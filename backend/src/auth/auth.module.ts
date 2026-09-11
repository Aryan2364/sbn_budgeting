import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not set. The API will not start without it.');
        }
        // jsonwebtoken types expiresIn as a literal union of duration
        // strings, which an env var cannot satisfy. The value is
        // validated by jsonwebtoken at sign time either way.
        const expiresIn = (config.get<string>('JWT_EXPIRES_IN') ??
          '12h') as unknown as number;
        return { secret, signOptions: { expiresIn } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
