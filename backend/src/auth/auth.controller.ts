import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { type AccessContext, CurrentAccess, type MyAccess, toMyAccess } from '../access/access-context';
import { SignedIn } from '../access/decorators';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { Public } from '../common/public.decorator';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<{ token: string; user: AuthUser }> {
    return this.auth.login(body.login ?? body.email, body.password);
  }

  /**
   * Today's AuthUser, with the backend kit's MyAccess beside it in
   * `access` (access plan 6.1.7, R3): the access version, the keys held
   * with their scopes, and the sites Selected sites reaches. No role
   * names, no refusals, no labels: labels live in the frontend's
   * generated lib/permission-keys.ts. Never 403 for an active user,
   * whatever roles they hold.
   */
  // @SignedIn: the caller's own record and access, for every signed-in person.
  @SignedIn()
  @Get('me')
  async me(
    @CurrentUser() user: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<AuthUser & { access: MyAccess }> {
    const units = await this.auth.myUnitIds(user.id);
    return { ...user, access: toMyAccess(access, units) };
  }
}
