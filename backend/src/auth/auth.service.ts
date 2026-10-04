import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { Pool } from 'pg';

import type { AuthUser } from '../common/current-user';
import { PHONE_SQL, phoneDigits } from '../common/phone';
import { PG_POOL } from '../db/db.module';
import { AUTH_USER_SELECT, type AuthUserDbRow, mayUseApp, toAuthUser } from './auth-user.sql';

/** What the per-request query gives the auth guard: the person, plus what access needs. */
export interface ActiveUser {
  user: AuthUser;
  /** Sorted role ids. Turned into permissions by the role map, never shown. */
  roleIds: string[];
  accessVersion: number;
}

const LOGIN_FAILED = 'Email/phone or password is incorrect';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly jwt: JwtService,
  ) {}

  /**
   * `login` is an email or a phone (plan Q7). Anything with an @ is an
   * email; anything else is compared by its last ten digits, the same
   * way phones are stored.
   */
  async login(login: string | undefined, password: string): Promise<{ token: string; user: AuthUser }> {
    const identifier = login?.trim() ?? '';
    if (!identifier) {
      throw new BadRequestException('Enter your email or phone number');
    }

    let rows: AuthUserDbRow[] = [];
    if (identifier.includes('@')) {
      ({ rows } = await this.pool.query<AuthUserDbRow>(
        `${AUTH_USER_SELECT} where lower(u.email) = lower($1)`,
        [identifier],
      ));
    } else {
      const digits = phoneDigits(identifier);
      if (digits && digits.length === 10) {
        ({ rows } = await this.pool.query<AuthUserDbRow>(
          `${AUTH_USER_SELECT}
           where u.phone is not null and u.phone <> '' and ${PHONE_SQL('u.phone')} = $1`,
          [digits],
        ));
      }
    }

    const user = rows[0];

    /**
     * One message for every failure — unknown email or phone, wrong
     * password, a person record that cannot log in. Telling the
     * difference tells an attacker which accounts exist.
     *
     * The comparison still runs against a dummy hash when there is no
     * user, so the response takes the same time either way.
     */
    const hash = user?.password_hash ?? DUMMY_HASH;
    const passwordMatches = await compare(password, hash);

    if (!user || !mayUseApp(user) || !user.password_hash || !passwordMatches) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const authUser = toAuthUser(user);
    const token = await this.jwt.signAsync({ sub: authUser.id, name: authUser.name });
    return { token, user: authUser };
  }

  /**
   * Re-read on every request rather than trusting the token's copy.
   * A module-access change or a revoked login has to take effect before
   * the token expires, not after. Deactivating a person ends their
   * access on their next request (decision 17): null here is a 401.
   *
   * This is the one access query per request (access plan 6.1.1).
   */
  async findActive(id: string): Promise<ActiveUser | null> {
    const { rows } = await this.pool.query<AuthUserDbRow>(
      `${AUTH_USER_SELECT} where u.id = $1`,
      [id],
    );
    const user = rows[0];
    if (!user || !mayUseApp(user)) return null;
    return {
      user: toAuthUser(user),
      roleIds: [...(user.role_ids ?? [])].sort(),
      accessVersion: Number(user.access_version),
    };
  }

  /**
   * The site ids Selected sites reaches for this person: ticked on them,
   * plus the sites they lead (O4). For the `units` of /auth/me only.
   */
  async myUnitIds(userId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select u.id::text as id /*scope-exempt: the caller's own ticked and led sites, for /auth/me*/
       from access_my_unit_ids($1) as u(id) order by 1`,
      [userId],
    );
    return rows.map((r) => r.id);
  }
}

/** A real bcrypt hash of a value nobody knows, so the timing matches. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO0aQoJ0jV5RhVQ0Fh0G0oWkOZ7t1p8Uu';
