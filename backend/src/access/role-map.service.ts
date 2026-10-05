import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';

import { PG_POOL } from '../db/db.module';
import type { AccessContext } from './access-context';
import {
  PERMISSION_KEYS,
  PICK_ACTION,
  SCOPES,
  adminGrants,
  describeKeys,
  isPermissionKey,
  keyInfo,
  type PermissionKey,
  type Scope,
} from './catalogue';

/**
 * The in-memory role map plus the access version (access plan 6.1.2,
 * backend kit 5.2).
 *
 * One map per process: role id -> permission key -> scopes. It is read
 * only when the access version on the per-request user row differs from
 * the map's, and on the first request after a start (a restart is how
 * a new release's catalogue arrives, R5). Role assignments, `active`,
 * ticked sites and the reporting chain are NEVER cached here; they come
 * fresh with every request (kit rule 21).
 *
 * - Admin (the role whose system_key is 'admin') is computed: every key
 *   of every catalogue at All, access.rights.manage included. It has no
 *   rows (R4). This loader is one of the three places system_key is read.
 * - A row whose key no catalogue declares is dropped and counted (R5);
 *   self-check A8 names those rows.
 * - Reloads are single-flight and swap the map whole; the live map is
 *   never mutated.
 * - A failed reload fails closed: 503, never the stale map, never open.
 * - Several processes need no messaging: each compares versions on
 *   every request.
 */

export interface RoleMapSnapshot {
  readonly version: number;
  readonly roles: ReadonlyMap<string, ReadonlyMap<PermissionKey, ReadonlySet<Scope>>>;
  /** Unknown permission keys seen in role_permissions at load, with their row counts (R5). */
  readonly unknownKeys: ReadonlyMap<string, number>;
}

interface LoadRow {
  version: string | number;
  admin_ids: string[] | null;
  grants: Array<[string, string, string]> | null;
}

/**
 * ONE statement, so it reads one consistent snapshot: the version, the
 * Admin role's id and every role_permissions row. A single statement
 * needs no explicit transaction for that, which also keeps it working
 * inside the test harness's per-request transaction.
 */
export const ROLE_MAP_SQL = `
  select (select s.access_version from access_settings s) as version,
         (select coalesce(array_agg(r.id::text order by r.id), '{}')
            from roles r where r.system_key = 'admin') as admin_ids,
         (select coalesce(json_agg(json_build_array(rp.role_id::text, rp.permission_key, rp.scope::text)
                                   order by rp.role_id, rp.permission_key, rp.scope), '[]'::json)
            from role_permissions rp) as grants`;

export const ACCESS_UNAVAILABLE = 'Access could not be checked. Try again.';

const EMPTY: RoleMapSnapshot = { version: -1, roles: new Map(), unknownKeys: new Map() };

const KEY_ORDER = new Map<string, number>(PERMISSION_KEYS.map((k, i) => [k, i]));

/** Sections every active user picks at All (pick-for-everyone). */
const EVERYONE_PICKS: readonly PermissionKey[] = describeKeys()
  .filter((k) => k.kind === 'pick' && k.section?.pick?.everyone)
  .map((k) => k.key as PermissionKey);

function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Pure: the role map from the loader's row. Exported for tests. */
export function buildRoleMap(row: LoadRow): RoleMapSnapshot {
  const roles = new Map<string, Map<PermissionKey, Set<Scope>>>();
  const unknownKeys = new Map<string, number>();
  const grant = (roleId: string, key: PermissionKey, scope: Scope): void => {
    let perms = roles.get(roleId);
    if (!perms) roles.set(roleId, (perms = new Map()));
    let scopes = perms.get(key);
    if (!scopes) perms.set(key, (scopes = new Set()));
    scopes.add(scope);
  };

  const adminIds = new Set(row.admin_ids ?? []);
  for (const [roleId, key, scope] of row.grants ?? []) {
    // The database refuses Admin rows by trigger; ignore any all the same.
    if (adminIds.has(roleId)) continue;
    if (!isPermissionKey(key) || !isScope(scope)) {
      unknownKeys.set(key, (unknownKeys.get(key) ?? 0) + 1);
      continue;
    }
    grant(roleId, key, scope);
  }
  for (const adminId of adminIds) {
    for (const { key, scope } of adminGrants()) grant(adminId, key, scope);
  }
  return { version: Number(row.version), roles, unknownKeys };
}

/**
 * Pure: the effective permissions of someone holding `roleIds` (plan
 * 6.1.2): the union over their roles (3.4.3), each viewed section's own
 * Pick at the same scopes (3.4.6), and every pick-for-everyone Pick at
 * All. Keys come out in catalogue order.
 */
export function effectivePermissions(
  map: RoleMapSnapshot,
  roleIds: readonly string[],
): Map<PermissionKey, ReadonlySet<Scope>> {
  const union = new Map<PermissionKey, Set<Scope>>();
  const add = (key: PermissionKey, scopes: Iterable<Scope>): void => {
    let set = union.get(key);
    if (!set) union.set(key, (set = new Set()));
    for (const s of scopes) set.add(s);
  };

  for (const roleId of roleIds) {
    for (const [key, scopes] of map.roles.get(roleId) ?? []) add(key, scopes);
  }
  for (const [key, scopes] of [...union]) {
    const info = keyInfo(key);
    if (info?.kind !== 'action' || !info.section?.pick) continue;
    if (!key.endsWith('.view')) continue;
    const pick = `${info.module}.${info.section.key}.${PICK_ACTION}`;
    if (isPermissionKey(pick)) add(pick, scopes);
  }
  for (const key of EVERYONE_PICKS) add(key, ['all']);

  const ordered = [...union.entries()]
    .filter(([, scopes]) => scopes.size > 0)
    .sort(([a], [b]) => (KEY_ORDER.get(a) ?? 0) - (KEY_ORDER.get(b) ?? 0));
  return new Map(ordered);
}

type Loader = () => Promise<LoadRow>;

@Injectable()
export class RoleMapService {
  private readonly logger = new Logger('Access');
  private map: RoleMapSnapshot = EMPTY;
  private loading: Promise<RoleMapSnapshot> | null = null;
  private memo = new Map<string, Map<PermissionKey, ReadonlySet<Scope>>>();
  /** How many times the map has been read from the database. For tests and the self-check. */
  loads = 0;

  private readonly load: Loader;

  constructor(@Inject(PG_POOL) pool: Pool) {
    this.load = async () => (await pool.query<LoadRow>(ROLE_MAP_SQL)).rows[0]!;
  }

  /** The current map. Read-only. */
  get snapshot(): RoleMapSnapshot {
    return this.map;
  }

  /**
   * The caller's access context. Synchronous work only, unless the
   * request's access version differs from the map's: then the map is
   * reloaded first (single-flight), and once more if the request saw a
   * version newer than the reload did.
   */
  async contextFor(userId: string, roleIds: readonly string[], version: number): Promise<AccessContext> {
    if (this.map.version !== version) {
      await this.reload();
      if (this.map.version < version) await this.reload();
    }
    const map = this.map;
    const sorted = [...roleIds].sort();
    const memoKey = `${map.version}:${sorted.join(',')}`;
    let perms = this.memo.get(memoKey);
    if (!perms) {
      perms = effectivePermissions(map, sorted);
      this.memo.set(memoKey, perms);
    }
    return { userId, roleIds: sorted, version: map.version, perms };
  }

  /**
   * The ids of the roles that grant `key` at any scope, Admin included,
   * from the current map. For a narrowing filter on OTHER people ("who
   * may work on complaints"), read inside a request whose guard has
   * already brought the map up to that request's access version.
   */
  rolesHolding(key: PermissionKey): string[] {
    return [...this.map.roles].filter(([, perms]) => (perms.get(key)?.size ?? 0) > 0).map(([id]) => id);
  }

  /** Reads the map again. Concurrent callers share one read. Fails closed (503). */
  reload(): Promise<RoleMapSnapshot> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const next = buildRoleMap(await this.load());
        this.loads += 1;
        this.map = next;
        this.memo = new Map();
        if (next.unknownKeys.size > 0) {
          this.logger.warn(
            `Ignored role_permissions rows with keys no catalogue declares: ${[...next.unknownKeys.keys()].join(', ')}`,
          );
        }
        return next;
      } catch (error) {
        this.logger.error(
          `The role map could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new ServiceUnavailableException(ACCESS_UNAVAILABLE);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
}
