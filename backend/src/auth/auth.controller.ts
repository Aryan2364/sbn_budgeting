import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

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
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
