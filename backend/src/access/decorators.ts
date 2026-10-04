import type { PickSection } from './access-context';
import type { PermissionKey } from './catalogue';

/**
 * The route declarations (access plan 6.1.3, backend kit 5.3). Every
 * route handler carries EXACTLY ONE of five:
 *
 *   @Public()                    no sign-in (login only). Lives in
 *                                common/public.decorator.ts and keeps
 *                                its existing metadata key.
 *   @SignedIn()                  any active signed-in user, for the
 *                                caller's own or static data. Each use
 *                                carries a one-line comment saying why.
 *   @Can('budget.expenses.edit') holds the key at any scope; which
 *                                records is decided in the data query.
 *   @CanAny('a.b.c', 'd.e.f')    holds any one of the keys.
 *   @PickOf('budget.sites')      holds that section's Pick, or it is
 *                                pick-for-everyone.
 *
 * Keys are typed: a misspelt key fails to compile. Boot validation
 * (boot-guard.ts) checks the rest: none or several on one handler, and
 * a key no catalogue declares.
 *
 * Each decorator APPENDS to the handler's list rather than overwriting
 * it, so two declarations on one handler are seen and refused instead
 * of the second silently winning.
 */

export const ACCESS_DECLARATIONS = 'accessDeclarations';

export type AccessDeclaration =
  | { readonly kind: 'signedIn' }
  | { readonly kind: 'can'; readonly keys: readonly [PermissionKey] }
  | { readonly kind: 'canAny'; readonly keys: readonly PermissionKey[] }
  | { readonly kind: 'pickOf'; readonly section: PickSection };

function declare(declaration: AccessDeclaration): MethodDecorator {
  return (_target, _property, descriptor: PropertyDescriptor) => {
    const handler = descriptor.value as object;
    const existing = (Reflect.getMetadata(ACCESS_DECLARATIONS, handler) as AccessDeclaration[] | undefined) ?? [];
    Reflect.defineMetadata(ACCESS_DECLARATIONS, [...existing, declaration], handler);
    return descriptor;
  };
}

/** Any active signed-in user. Say why on the line above. */
export const SignedIn = (): MethodDecorator => declare({ kind: 'signedIn' });

/** Holds `key` at any scope. */
export const Can = (key: PermissionKey): MethodDecorator => declare({ kind: 'can', keys: [key] });

/** Holds at least one of `keys` at any scope. */
export const CanAny = (...keys: [PermissionKey, PermissionKey, ...PermissionKey[]]): MethodDecorator =>
  declare({ kind: 'canAny', keys });

/** Holds the Pick of `section` ('module.section') at any scope. */
export const PickOf = (section: PickSection): MethodDecorator => declare({ kind: 'pickOf', section });

export const ACCESS_IN_HANDLER_KEYS = 'accessInHandlerKeys';

/**
 * NOT a declaration: names a key the handler checks INSIDE, on part of
 * its body, beside the route's one declaration (O7: the manager and
 * supervisor half of POST/PATCH /sites is budget.sites.change_people).
 * Boot validation checks the key exists and counts it as used, so it
 * does not warn "used by no route".
 */
export const AlsoChecks = (...keys: [PermissionKey, ...PermissionKey[]]): MethodDecorator =>
  (_target, _property, descriptor: PropertyDescriptor) => {
    const handler = descriptor.value as object;
    const existing = (Reflect.getMetadata(ACCESS_IN_HANDLER_KEYS, handler) as PermissionKey[] | undefined) ?? [];
    Reflect.defineMetadata(ACCESS_IN_HANDLER_KEYS, [...existing, ...keys], handler);
    return descriptor;
  };

/** The keys a handler checks inside (`@AlsoChecks`), as written. */
export function inHandlerKeysOf(handler: object): readonly PermissionKey[] {
  return (Reflect.getMetadata(ACCESS_IN_HANDLER_KEYS, handler) as PermissionKey[] | undefined) ?? [];
}

/** The declarations on one handler, as written. */
export function declarationsOf(handler: object): readonly AccessDeclaration[] {
  return (Reflect.getMetadata(ACCESS_DECLARATIONS, handler) as AccessDeclaration[] | undefined) ?? [];
}
