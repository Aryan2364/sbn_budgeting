import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import {
  IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength,
} from 'class-validator';
import type { Pool } from 'pg';

import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION,
} from '../common/crud';
import { CurrentUser, type AuthUser } from '../common/current-user';

export class UserDto {
  @IsString()
  @MinLength(1, { message: 'Enter the person’s name' })
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a complete email address, like name@company.com' })
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsIn(['admin', 'staff'], { message: 'Choose a role' })
  role!: 'admin' | 'staff';

  @IsBoolean()
  canLogin!: boolean;

  /** Only sent when setting or changing one. Never returned. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters' })
  password?: string;
}

import { Roles } from '../common/roles.decorator';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'staff';
  canLogin: boolean;
}

/**
 * One list of people. There is no manager/supervisor axis on a user
 * (question 3), so the site form's manager and supervisor pickers read
 * this list rather than a filtered subset of it.
 *
 * **Reading is open to anyone signed in; writing is admin only.**
 *
 * The class was admin-only at first and that was wrong: a staff user
 * filling in a site's manager has to be able to see the people list,
 * and a picker that 403s is section 26's "control that fails after
 * being clicked". Managing people stays in Settings, which staff do not
 * see at all.
 */
@Controller('users')
export class UsersController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('role') role?: string,
    @Query('canLogin') canLogin?: string,
  ): Promise<ListResult<UserRow & MatchInfo>> {
    return runListQuery<UserRow>(
      this.pool,
      {
        from: 'users u',
        select:
          'u.id, u.name, u.email, u.phone, u.role, u.can_login as "canLogin"',
        titleField: { sql: 'u.name', label: 'Name' },
        // Section 27.1: search covers every meaningful text field by
        // default. password_hash is excluded for the obvious reason and
        // that is the only exclusion.
        searchFields: [
          { sql: 'u.email', label: 'Email' },
          { sql: 'u.phone', label: 'Phone' },
          { sql: 'u.role', label: 'Role' },
        ],
        sortable: {
          name: 'u.name',
          email: 'u.email',
          role: 'u.role',
          createdAt: 'u.created_at',
        },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          role: (value, param) => `u.role = ${param(value)}`,
          canLogin: (value, param) => `u.can_login = ${param(value === 'true')}`,
        },
      },
      { ...query, filters: { role, canLogin } },
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserRow> {
    return findOneOrFail<UserRow>(
      this.pool,
      `select id, name, email, phone, role, can_login as "canLogin"
       from users where id = $1`,
      [id],
      'person',
    );
  }

  /**
   * The table constraint refuses a login-enabled row with no email and
   * no password, but a constraint violation is a 500 with a message
   * nobody can act on. This is the same rule, said in words
   * (section 7.2 rule 2).
   */
  private static assertLoginCredentials(
    canLogin: boolean,
    email: string | null | undefined,
    hasPassword: boolean,
  ): void {
    if (!canLogin) return;
    if (!email) {
      throw new BadRequestException(
        'Someone who signs in needs an email address. Add one, or turn off sign-in.',
      );
    }
    if (!hasPassword) {
      throw new BadRequestException(
        'Someone who signs in needs a password. Set one, or turn off sign-in.',
      );
    }
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: UserDto): Promise<UserRow> {
    UsersController.assertLoginCredentials(body.canLogin, body.email, Boolean(body.password));
    const passwordHash = body.password ? await hash(body.password, 12) : null;
    try {
      const { rows } = await this.pool.query(
        `insert into users (name, email, phone, role, password_hash, can_login)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [body.name, body.email ?? null, body.phone ?? null, body.role,
         passwordHash, body.canLogin],
      );
      return this.get(rows[0].id);
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`${body.email} is already in use by someone else.`);
      }
      throw error;
    }
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UserDto,
  ): Promise<UserRow> {
    const existing = await findOneOrFail<{ hasPassword: boolean }>(
      this.pool,
      'select (password_hash is not null) as "hasPassword" from users where id = $1',
      [id],
      'person',
    );
    UsersController.assertLoginCredentials(
      body.canLogin, body.email, Boolean(body.password) || existing.hasPassword,
    );
    const passwordHash = body.password ? await hash(body.password, 12) : null;
    try {
      await this.pool.query(
        `update users set name = $1, email = $2, phone = $3, role = $4,
                can_login = $5,
                password_hash = coalesce($6, password_hash)
         where id = $7`,
        [body.name, body.email ?? null, body.phone ?? null, body.role,
         body.canLogin, passwordHash, id],
      );
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(`${body.email} is already in use by someone else.`);
      }
      throw error;
    }
    return this.get(id);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    // Deleting yourself logs you out of an account you can no longer
    // sign back into. Refused rather than confirmed.
    if (id === user.id) {
      throw new ConflictException('You cannot delete your own account.');
    }
    try {
      await findOneOrFail(
        this.pool, 'delete from users where id = $1 returning id', [id], 'person',
      );
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          'This person is named on a site or has booked expenses. Remove those links first.',
        );
      }
      throw error;
    }
  }
}
