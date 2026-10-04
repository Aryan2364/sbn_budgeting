import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

import { CurrentUser, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { type AccessContext, CurrentAccess } from './access-context';
import { AccessService } from './access.service';
import type { AuditActor } from './audit';
import { Can } from './decorators';

/**
 * The access API (access plan P6, backend kit 7.4): what the four access
 * screens need, and nothing else. Every route is behind
 * access.rights.manage, which only Admin holds (revised O1); there is no
 * separate viewing permission (R12). These are new-system routes, so the
 * new route guard decides them from the start (permission.guard.ts).
 *
 *   Roles            GET /access/roles, GET /access/roles/:id,
 *                    POST /access/roles, PUT /access/roles/:id (the whole
 *                    role at once), DELETE /access/roles/:id.
 *                    No Duplicate route: the editor prefills the create
 *                    form (R12, kit 40.2 rule 8).
 *   People           GET /access/people (with uncoveredUnits),
 *                    GET /access/people/:id,
 *                    PUT /access/people/:id/access (roles and ticked
 *                    sites together), PUT /access/people/:id/active,
 *                    PUT /access/people/:id/reports-to.
 *                    GET /access/units: every site, unpaginated, with its
 *                    location; the location shortcut is the client's
 *                    (ticks are stored per site, decision 3).
 *   What they can do GET /access/people/:id/effective
 *   History          GET /access/history
 *
 * Refusals follow R7: 404 for a role or person that does not exist; 403
 * from the guard without access.rights.manage; 409 `{ error: 'blocked',
 * reason }` for the last-holder rule, the Admin role, and deleting a
 * role somebody holds. Role saves never refuse over Picks (R6): they
 * answer 200 with `notices`.
 */

export class RoleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** `{ "<key>": "<scope>" }`, one scope per ticked permission. Checked against the catalogue. */
  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;
}

export class PersonAccessDto {
  @IsArray({ message: 'Send the roles as a list' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true, message: 'Choose roles from the list' })
  roleIds!: string[];

  @IsArray({ message: 'Send the sites as a list' })
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true, message: 'Choose sites from the list' })
  unitIds!: string[];
}

export class ActiveDto {
  @IsBoolean({ message: 'Say whether this person is active' })
  active!: boolean;
}

export class ReportsToDto {
  /** null = they report to nobody. Required, so a missing key is not read as "nobody". */
  @IsOptional()
  @IsUUID('all', { message: 'Choose who they report to from the list' })
  reportsToId?: string | null;
}

const actorOf = (user: AuthUser): AuditActor => ({ id: user.id, name: user.name });

@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  // ---- roles ------------------------------------------------------------

  @Get('roles')
  @Can('access.rights.manage')
  roles(@Query() query: ListQueryDto) {
    return this.access.listRoles(query);
  }

  @Get('roles/:id')
  @Can('access.rights.manage')
  role(@Param('id') id: string) {
    return this.access.getRole(id);
  }

  @Post('roles')
  @Can('access.rights.manage')
  createRole(@Body() body: RoleDto, @CurrentUser() user: AuthUser) {
    return this.access.createRole(actorOf(user), body);
  }

  @Put('roles/:id')
  @Can('access.rights.manage')
  updateRole(@Param('id') id: string, @Body() body: RoleDto, @CurrentUser() user: AuthUser) {
    return this.access.updateRole(actorOf(user), id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @Can('access.rights.manage')
  async deleteRole(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.access.deleteRole(actorOf(user), id);
  }

  // ---- people -----------------------------------------------------------

  @Get('people')
  @Can('access.rights.manage')
  people(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('roleId') roleId?: string,
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('unitsNoneChosen') unitsNoneChosen?: string,
  ) {
    return this.access.listPeople(access, { ...query, filters: { roleId, status, locationId, unitsNoneChosen } });
  }

  @Get('people/:id')
  @Can('access.rights.manage')
  person(@Param('id') id: string, @CurrentAccess() access: AccessContext) {
    return this.access.getPerson(access, id);
  }

  @Get('people/:id/effective')
  @Can('access.rights.manage')
  effective(@Param('id') id: string, @CurrentAccess() access: AccessContext) {
    return this.access.effective(access, id);
  }

  @Put('people/:id/access')
  @Can('access.rights.manage')
  saveAccess(
    @Param('id') id: string,
    @Body() body: PersonAccessDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ) {
    return this.access.saveAccess(access, actorOf(user), id, body);
  }

  @Put('people/:id/active')
  @Can('access.rights.manage')
  setActive(
    @Param('id') id: string,
    @Body() body: ActiveDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ) {
    return this.access.setActive(access, actorOf(user), id, body.active);
  }

  @Put('people/:id/reports-to')
  @Can('access.rights.manage')
  setReportsTo(
    @Param('id') id: string,
    @Body() body: ReportsToDto,
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ) {
    if (body.reportsToId === undefined) {
      throw new BadRequestException('Say who they report to, or send null for nobody.');
    }
    return this.access.setReportsTo(access, actorOf(user), id, body.reportsToId);
  }

  @Get('units')
  @Can('access.rights.manage')
  units() {
    return this.access.units();
  }

  // ---- history ----------------------------------------------------------

  @Get('history')
  @Can('access.rights.manage')
  history(
    @Query() query: ListQueryDto,
    @Query('actorId') actorId?: string,
    @Query('personId') personId?: string,
    @Query('roleId') roleId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.access.history({ ...query, filters: { actorId, personId, roleId, action, from, to } });
  }
}
