import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { type AccessContext, can, scopesFor } from '../access/access-context';
import { keyInfo, type PermissionKey } from '../access/catalogue';
import { reasonFor } from '../access/permission.guard';
import { type Param, type Queryable, createSiteWhere, scopeWhere } from '../access/scope';

/**
 * The budget module's small access helpers (access plan P3b-budget,
 * 6.1.4 items 3-5). Every predicate comes from access/scope.ts; this
 * file only wires it into the budget routes' statements.
 */

/** A fresh `$n` numbering for one statement. */
export function params(): { values: unknown[]; param: Param } {
  const values: unknown[] = [];
  return {
    values,
    param: (v) => {
      values.push(v);
      return `$${values.length}`;
    },
  };
}

/** The routes' existing not-found wording (R7: a record outside your scope reads exactly the same). */
export function notFound(what: string): NotFoundException {
  return new NotFoundException(`That ${what} no longer exists. It may have been deleted.`);
}

/** 403 in the R7 shape; `message` repeats the reason for today's client. */
export function forbidden(permission: PermissionKey, reason: string): ForbiddenException {
  return new ForbiddenException({ error: 'forbidden', permission, reason, message: reason });
}

/** Runs `fn` in one transaction on its own connection. */
export async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

const CREATE_PHRASE = {
  own: 'on the sites you lead',
  team: 'on the sites your team runs',
  units: 'on your selected sites and the sites you lead',
} as const;

/**
 * Why a create (or a move) onto a site is refused (O5): the action's
 * label and the reach of the scopes held, never a role (kit 26.2).
 * "You can add expenses only on the sites you lead."
 */
export function createSiteReason(ctx: AccessContext, key: PermissionKey): string {
  const held = scopesFor(ctx, key);
  if (held.size === 0 || held.has('all')) return reasonFor(key);
  const label = keyInfo(key)?.label ?? key;
  const phrases = (['own', 'team', 'units'] as const).filter((s) => held.has(s)).map((s) => CREATE_PHRASE[s]);
  return `You can ${label} only ${phrases.join(', or ')}.`;
}

/**
 * O5: may the caller put a record of `key`'s kind on `siteId`? A site
 * that does not exist is left to the insert's own foreign key (today's
 * answer, unchanged); an existing site outside the reach of `key` is 403.
 */
export async function assertSiteCreatable(
  db: Queryable,
  ctx: AccessContext,
  key: PermissionKey,
  siteId: string,
): Promise<void> {
  if (!can(ctx, key)) throw forbidden(key, reasonFor(key));
  const { values, param } = params();
  const site = param(siteId);
  const { rows } = await db.query<{ allowed: boolean }>(
    `select coalesce(${createSiteWhere(ctx, key, 'cs.id', param)}, false) as allowed
     from sites cs where cs.id = ${site}::uuid`,
    values,
  );
  if (rows[0] && !rows[0].allowed) throw forbidden(key, createSiteReason(ctx, key));
}

/**
 * Linking a site to a project checks the project against
 * budget.projects.pick (plan 6.1.4 item 5). A project that does not
 * exist is left to the foreign key, as today; one outside the caller's
 * Pick reads as not found, so it is not revealed (R7).
 */
export async function assertProjectPickable(db: Queryable, ctx: AccessContext, projectId: string): Promise<void> {
  const { values, param } = params();
  const project = param(projectId);
  const { rows } = await db.query<{ visible: boolean }>(
    `select coalesce(${scopeWhere(ctx, 'budget.projects.pick', 'project', 'pp', param)}, false) as visible
     from projects pp where pp.id = ${project}::uuid`,
    values,
  );
  if (rows[0] && !rows[0].visible) throw notFound('project');
}
