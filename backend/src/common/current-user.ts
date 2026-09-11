import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** What the JWT carries, and what every guarded handler can rely on. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
