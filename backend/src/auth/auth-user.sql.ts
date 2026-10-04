import type { AuthModules, AuthUser } from '../common/current-user';

/**
 * The one query that turns a users row into an AuthUser. Used by login
 * and by every request (findActive), so the two can never disagree.
 *
 * It is also the ONLY access query on the request path (access plan
 * 6.1.1, backend kit 5.1): in the same statement it returns the
 * person's `active` flag, their role ids and the access version. The
 * role map (access/role-map.service.ts) turns those into permissions in
 * memory, so a permission check costs no further query. Role
 * assignments and `active` are read here fresh on every request and
 * never cached.
 *
 * `modules` (the old levels) stays until P11, for the old guard and for
 * already-open tabs.
 */
export const AUTH_USER_SELECT = `
  select u.id, u.name, u.email, u.phone, u.can_login, u.active, u.password_hash,
         case when d.id is null then null
              else json_build_object('id', d.id, 'name', d.name, 'seedKey', d.seed_key)
         end as designation,
         coalesce((select array_agg(ur.role_id::text order by ur.role_id)
                   from user_roles ur where ur.user_id = u.id), '{}') as role_ids,
         (select s.access_version from access_settings s) as access_version,
         coalesce((select json_object_agg(m.module, m.role)
                   from user_module_access m where m.user_id = u.id), '{}'::json) as modules
  from users u /*scope-exempt: the signed-in user's own row*/
  left join designations d on d.id = u.designation_id`;

export interface AuthUserDbRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  can_login: boolean;
  /** "This person is current." Sign-in and every request need it (plan 3.4.9). */
  active: boolean;
  password_hash: string | null;
  designation: AuthUser['designation'];
  role_ids: string[];
  /** bigint, so node-postgres hands it back as a string. */
  access_version: string;
  modules: AuthModules;
}

/** Signing in, and staying signed in, need both (plan 3.4.9, 6.1.1). */
export function mayUseApp(row: Pick<AuthUserDbRow, 'active' | 'can_login'>): boolean {
  return row.active && row.can_login;
}

export function toAuthUser(row: AuthUserDbRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    designation: row.designation,
    modules: row.modules ?? {},
  };
}
