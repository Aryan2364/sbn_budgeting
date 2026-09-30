import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../common/current-user';
import {
  MODULE_ACCESS,
  MODULE_LABEL,
  type ModuleRequirement,
} from '../common/module-access.decorator';

/**
 * Enforces @ModuleAccess / @ModuleRole. The class-level requirement and
 * the handler-level one are BOTH checked: a budget controller says
 * "budget users only" once, and each admin write inside it adds
 * "budget admins only".
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const onClass = this.reflector.get<ModuleRequirement | undefined>(
      MODULE_ACCESS,
      context.getClass(),
    );
    const onHandler = this.reflector.get<ModuleRequirement | undefined>(
      MODULE_ACCESS,
      context.getHandler(),
    );
    const requirements = [onClass, onHandler].filter(
      (r): r is ModuleRequirement => Boolean(r),
    );
    if (requirements.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    for (const req of requirements) {
      const role = user?.modules?.[req.module] as string | undefined;
      if (!role) {
        throw new ForbiddenException(`You don't have access to ${MODULE_LABEL[req.module]}`);
      }
      if (req.roles.length > 0 && !req.roles.includes(role)) {
        throw new ForbiddenException('Only an administrator can do that');
      }
    }
    return true;
  }
}
