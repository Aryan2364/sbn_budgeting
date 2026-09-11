import { SetMetadata } from '@nestjs/common';

export const ROLES = 'roles';

export type Role = 'admin' | 'staff';

/**
 * AGENTS.md section 26. There are exactly two roles: admin sees
 * Settings and can delete, staff does not and cannot.
 *
 * Hiding a button is appearance. THIS is the check that matters —
 * anyone can unhide a control with browser tools.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);
