import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthModules {
  platform?: 'admin';
  budget?: 'admin' | 'staff';
  complaints?: 'admin' | 'member';
}

/**
 * CONTRACT section 1. What /auth/login and /auth/me return, and what
 * every guarded handler can rely on. Re-read from the database on every
 * request (AuthService.findActive), never trusted from the token.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: { id: string; name: string; seedKey: string | null } | null;
  modules: AuthModules;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
