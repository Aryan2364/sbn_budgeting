import type { AuthModules, AuthUser } from '../common/current-user';

/**
 * The one query that turns a users row into an AuthUser. Used by login
 * and by every request (findActive), so the two can never disagree.
 */
export const AUTH_USER_SELECT = `
  select u.id, u.name, u.email, u.phone, u.can_login, u.password_hash,
         case when d.id is null then null
              else json_build_object('id', d.id, 'name', d.name, 'seedKey', d.seed_key)
         end as designation,
         coalesce((select json_object_agg(m.module, m.role)
                   from user_module_access m where m.user_id = u.id), '{}'::json) as modules
  from users u
  left join designations d on d.id = u.designation_id`;

export interface AuthUserDbRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  can_login: boolean;
  password_hash: string | null;
  designation: AuthUser['designation'];
  modules: AuthModules;
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
