import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC } from '../common/public.decorator';
import { type AccessContext, can, canAny, canPick } from './access-context';
import { PICK_ACTION, keyInfo, type PermissionKey } from './catalogue';
import { type AccessDeclaration, declarationsOf } from './decorators';

/**
 * The route guard for the five declarations (access plan 6.1.3). From
 * P9 (switch-over) it decides EVERY route: ModuleAccessGuard and the
 * @ModuleAccess / @ModuleRole decorators are gone, and with them the
 * shadow comparison that ran from P2a to P9.
 *
 * A refusal is 403 `{ error: 'forbidden', permission, reason }` (R7,
 * backend kit 6 rule 5), the reason built from the key's label in kit
 * 26.2's words. `message` repeats the reason for today's client, which
 * reads `message`.
 *
 * It fails CLOSED: a handler carrying no declaration, or several, is
 * refused. Boot validation (boot-guard.ts) already refuses to start in
 * either case, so this only matters if metadata is changed at run time.
 */

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

/** A handler with no declaration, or several: never allowed (boot validation refuses both). */
export const UNDECLARED_REASON = 'This route does not say who may use it, so nobody may.';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, controller]);
    if (isPublic) return true;

    const declarations = declarationsOf(handler);
    const access = context.switchToHttp().getRequest<{ access?: AccessContext }>().access;
    const decision: Decision =
      declarations.length !== 1
        ? { allowed: false, permission: '', reason: UNDECLARED_REASON }
        : access
          ? decide(declarations[0]!, access)
          : { allowed: false, permission: '', reason: 'Sign in to continue.' };

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
}
