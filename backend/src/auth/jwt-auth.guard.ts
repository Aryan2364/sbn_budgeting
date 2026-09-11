import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import type { AuthUser } from '../common/current-user';
import { IS_PUBLIC } from '../common/public.decorator';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
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

    const user = payload.sub ? await this.auth.findActive(payload.sub) : null;
    if (!user) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    request.user = user;
    return true;
  }
}
