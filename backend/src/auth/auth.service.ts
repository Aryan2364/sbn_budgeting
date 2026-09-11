import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { Pool } from 'pg';

import type { AuthUser } from '../common/current-user';
import type { Role } from '../common/roles.decorator';
import { PG_POOL } from '../db/db.module';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  password_hash: string | null;
  can_login: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const { rows } = await this.pool.query<UserRow>(
      `select id, name, email, role, password_hash, can_login
       from users
       where lower(email) = lower($1)`,
      [email],
    );

    const user = rows[0];

    /**
     * One message for every failure — unknown email, wrong password,
     * a person record that cannot log in. Telling the difference tells
     * an attacker which addresses exist.
     *
     * The comparison still runs against a dummy hash when there is no
     * user, so the response takes the same time either way.
     */
    const hash = user?.password_hash ?? DUMMY_HASH;
    const passwordMatches = await compare(password, hash);

    if (!user || !user.can_login || !user.password_hash || !passwordMatches) {
      throw new UnauthorizedException('Email or password is incorrect');
    }

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email ?? '',
      role: user.role,
    };

    const token = await this.jwt.signAsync({
      sub: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
    });

    return { token, user: authUser };
  }

  /**
   * Re-read on every request rather than trusting the token's copy.
   * A role change or a revoked login has to take effect before the
   * token expires, not after.
   */
  async findActive(id: string): Promise<AuthUser | null> {
    const { rows } = await this.pool.query<UserRow>(
      `select id, name, email, role, password_hash, can_login
       from users where id = $1`,
      [id],
    );
    const user = rows[0];
    if (!user || !user.can_login) return null;
    return { id: user.id, name: user.name, email: user.email ?? '', role: user.role };
  }
}

/** A real bcrypt hash of a value nobody knows, so the timing matches. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO0aQoJ0jV5RhVQ0Fh0G0oWkOZ7t1p8Uu';
