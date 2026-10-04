import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../common/current-user';
import { MODULE_ACCESS, type ModuleRequirement } from '../common/module-access.decorator';
import { IS_PUBLIC } from '../common/public.decorator';
import { type AccessContext, can, canAny, canPick } from './access-context';
import { PICK_ACTION, keyInfo, type PermissionKey } from './catalogue';
import { type AccessDeclaration, declarationsOf } from './decorators';

/**
 * The route guard for the five declarations (access plan 6.1.3).
 *
 * SHADOW MODE, from P2a until P9 (plan P2b). The old ModuleAccessGuard
 * still decides on every route that existed before roles. On those
 * routes this guard only compares its answer with the old one and logs
 * an `ACCESS-SHADOW` line when they disagree; it never refuses. It
 * decides for real only on routes that exist solely in the new system:
 * the `/pick/*` and `/access/*` controllers (NEW_SYSTEM_PREFIXES).
 *
 * It is registered BEFORE ModuleAccessGuard, so it sees every request
 * the old guard is about to refuse as well as every one it allows, and
 * the shadow log covers disagreements in both directions.
 *
 * A refusal is 403 `{ error: 'forbidden', permission, reason }` (R7,
 * backend kit 6 rule 5), the reason built from the key's label in kit
 * 26.2's words. `message` repeats the reason for today's client, which
 * reads `message`.
 *
 * P9 deletes the shadow branch, the legacy comparison and
 * ModuleAccessGuard together; this guard then decides everywhere.
 */

/** Controllers whose routes exist only in the new system: decided here from the start. */
export const NEW_SYSTEM_PREFIXES: readonly string[] = ['pick', 'access'];

export const SHADOW_LOG_CONTEXT = 'ACCESS-SHADOW';

export type Decision =
  | { allowed: true }
  | { allowed: false; permission: string; reason: string };

/** Kit 26.2: names the permission, never a role. */
export function reasonFor(key: string): string {
  const label = keyInfo(key)?.label ?? key;
  return `Only people allowed to ${label} can do this.`;
}

/** Pure: what the new rules say about one declaration. */
export function decide(declaration: AccessDeclaration, ctx: AccessContext): Decision {
  switch (declaration.kind) {
    case 'signedIn':
      return { allowed: true };
    case 'can': {
      const [key] = declaration.keys;
      return can(ctx, key) ? { allowed: true } : { allowed: false, permission: key, reason: reasonFor(key) };
    }
    case 'canAny': {
      const first = declaration.keys[0] as PermissionKey;
      return canAny(ctx, declaration.keys)
        ? { allowed: true }
        : { allowed: false, permission: first, reason: reasonFor(first) };
    }
    case 'pickOf': {
      const key = `${declaration.section}.${PICK_ACTION}`;
      return canPick(ctx, declaration.section)
        ? { allowed: true }
        : { allowed: false, permission: key, reason: reasonFor(key) };
    }
  }
}

/** Today's rule, as ModuleAccessGuard applies it. For the shadow comparison only; deleted at P9. */
export function legacyAllows(user: AuthUser | undefined, requirements: readonly ModuleRequirement[]): boolean {
  return requirements.every((req) => {
    const role = user?.modules?.[req.module] as string | undefined;
    return Boolean(role) && (req.roles.length === 0 || req.roles.includes(role!));
  });
}

/** Disagreements seen by this process, newest last, capped. P2b's harness reads it. */
export const shadowDisagreements: string[] = [];
const SHADOW_CAP = 1000;

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(SHADOW_LOG_CONTEXT);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, controller]);
    if (isPublic) return true;

    const declarations = declarationsOf(handler);
    // A handler with none is a P2b gap (boot validation reports it); the
    // old guard decides it. Several is refused at boot.
    if (declarations.length !== 1) return true;

    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      user?: AuthUser;
      access?: AccessContext;
    }>();
    const access = request.access;
    const decision: Decision = access
      ? decide(declarations[0]!, access)
      : { allowed: false, permission: '', reason: 'Sign in to continue.' };

    if (this.isNewSystemRoute(controller)) {
      if (!decision.allowed) {
        throw new ForbiddenException({
          error: 'forbidden',
          permission: decision.permission,
          reason: decision.reason,
          message: decision.reason,
        });
      }
      return true;
    }

    // Shadow: compare, log, never decide.
    const requirements = [
      this.reflector.get<ModuleRequirement | undefined>(MODULE_ACCESS, controller),
      this.reflector.get<ModuleRequirement | undefined>(MODULE_ACCESS, handler),
    ].filter((r): r is ModuleRequirement => Boolean(r));
    const old = legacyAllows(request.user, requirements);
    if (old !== decision.allowed) {
      const line =
        `${request.method ?? '?'} ${(request.url ?? '?').split('?')[0]} user=${request.user?.id ?? '?'} ` +
        `old=${old ? 'allow' : 'deny'} new=${decision.allowed ? 'allow' : 'deny'}` +
        (decision.allowed ? '' : ` permission=${decision.permission}`);
      shadowDisagreements.push(line);
      if (shadowDisagreements.length > SHADOW_CAP) shadowDisagreements.shift();
      this.logger.warn(line);
    }
    return true;
  }

  private isNewSystemRoute(controller: object): boolean {
    const raw = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
    const paths = Array.isArray(raw) ? raw : [raw ?? ''];
    return paths.some((p) => NEW_SYSTEM_PREFIXES.includes(p.replace(/^\/+/, '').split('/')[0] ?? ''));
  }
}
