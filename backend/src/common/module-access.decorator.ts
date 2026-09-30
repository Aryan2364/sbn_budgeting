import { SetMetadata } from '@nestjs/common';

export const MODULE_ACCESS = 'moduleAccess';

export type ModuleName = 'platform' | 'budget' | 'complaints';

export interface ModuleRequirement {
  module: ModuleName;
  /** Empty = any role in the module is enough. */
  roles: string[];
}

/**
 * Plan 3.3 / CONTRACT section 1. Access is per module, read from
 * user_module_access on every request (AuthService.findActive), so a
 * change takes effect before the token expires.
 *
 * `@ModuleAccess('budget')`: any budget role. No row = 403.
 * `@ModuleRole('budget', 'admin')`: that role only.
 *
 * Hiding a control is appearance. THIS is the check that matters.
 * A method-level requirement is checked IN ADDITION to the class-level
 * one (both must pass), so a class can say "budget users only" and a
 * write inside it "budget admins only".
 */
export const ModuleAccess = (module: ModuleName): MethodDecorator & ClassDecorator =>
  SetMetadata(MODULE_ACCESS, { module, roles: [] } satisfies ModuleRequirement);

export const ModuleRole = (
  module: ModuleName,
  ...roles: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(MODULE_ACCESS, { module, roles } satisfies ModuleRequirement);

export const MODULE_LABEL: Record<ModuleName, string> = {
  platform: 'Settings',
  budget: 'Budget',
  complaints: 'Complaints',
};
