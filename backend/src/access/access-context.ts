import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { PICK_ACTION, SCOPES, type PermissionKey, type Scope } from './catalogue';

/**
 * The caller's effective access for one request (access plan 6.1.2,
 * backend kit 5.3).
 *
 * Built once per request by JwtAuthGuard from the per-request user
 * query (role ids and the access version) and the in-memory role map,
 * and attached as `request.access`. Every check in the request reads
 * it. Nothing here touches the database: `can` is synchronous (kit
 * rule 13).
 *
 * The context never says WHICH roles grant a key, and nothing outside
 * src/access may ask whether someone "is an admin": code asks
 * `can(ctx, key)`.
 */
export interface AccessContext {
  readonly userId: string;
  /** Sorted. Used only to memoise `perms`; never for a decision. */
  readonly roleIds: readonly string[];
  /** The access version the role map held when `perms` was built. */
  readonly version: number;
  /**
   * Every key held, with its scopes: the union over the user's roles
   * (plan 3.4.3), each viewed section's own Pick (3.4.6), and every
   * pick-for-everyone Pick at All. Admin's grants arrive here computed.
   */
  readonly perms: ReadonlyMap<PermissionKey, ReadonlySet<Scope>>;
}

const NO_SCOPES: ReadonlySet<Scope> = new Set();

/** Holds the key at any scope. Synchronous, no I/O. */
export function can(ctx: AccessContext, key: PermissionKey): boolean {
  return (ctx.perms.get(key)?.size ?? 0) > 0;
}

/** Holds any one of the keys at any scope. */
export function canAny(ctx: AccessContext, keys: readonly PermissionKey[]): boolean {
  return keys.some((key) => can(ctx, key));
}

/** The scopes the key is held at. Empty when not held. */
export function scopesFor(ctx: AccessContext, key: PermissionKey): ReadonlySet<Scope> {
  return ctx.perms.get(key) ?? NO_SCOPES;
}

/** A section whose Pick a route can declare: 'budget.sites' for 'budget.sites.pick'. */
export type PickSection = PermissionKey extends infer K
  ? K extends `${infer S}.${typeof PICK_ACTION}`
    ? S
    : never
  : never;

/** Holds that section's Pick at any scope (pick-for-everyone sections are already in `perms`). */
export function canPick(ctx: AccessContext, section: PickSection): boolean {
  return can(ctx, `${section}.${PICK_ACTION}` as PermissionKey);
}

/**
 * The access part of GET /auth/me: the backend kit's `MyAccess` (8.1)
 * exactly. No role names, no refusals, no labels (R3). It never grows.
 */
export interface MyAccess {
  version: number;
  /** Only keys held, Picks and module-wide keys included, scopes in R1 order. */
  permissions: Partial<Record<PermissionKey, Scope[]>>;
  /** Site ids reached by Selected sites: ticked on the person, plus the sites they lead. */
  units: string[];
}

export function toMyAccess(ctx: AccessContext, units: readonly string[]): MyAccess {
  const permissions: Partial<Record<PermissionKey, Scope[]>> = {};
  for (const [key, scopes] of ctx.perms) {
    if (scopes.size === 0) continue;
    permissions[key] = SCOPES.filter((s) => scopes.has(s));
  }
  return { version: ctx.version, permissions, units: [...units].sort() };
}

/** The request's AccessContext, attached by JwtAuthGuard. */
export const CurrentAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessContext => {
    const request = context.switchToHttp().getRequest<{ access?: AccessContext }>();
    if (!request.access) {
      // Only reachable on a @Public() route, which has no caller.
      throw new Error('CurrentAccess used on a route with no signed-in caller.');
    }
    return request.access;
  },
);
