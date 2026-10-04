import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { AccessContext } from '../access/access-context';
import { RoleMapService } from '../access/role-map.service';
import type { AuthUser } from '../common/current-user';
import { IS_PUBLIC } from '../common/public.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly roleMap: RoleMapService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
      access?: AccessContext;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to continue');
    }

    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    // The one access query of the request (access plan 6.1.1): the
    // person, their active flag, their role ids and the access version.
    const active = payload.sub ? await this.auth.findActive(payload.sub) : null;
    if (!active) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    request.user = active.user;
    // In memory, unless the access version moved (then the role map
    // reloads once, for every request waiting on it). Fails closed: 503.
    request.access = await this.roleMap.contextFor(active.user.id, active.roleIds, active.accessVersion);
    return true;
  }
}
