import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * CONTRACT section 1: `login` is an email or a phone number. The old
 * `{ email, password }` body is still accepted so a cached budget
 * frontend keeps working through the deploy.
 */
export class LoginDto {
  @IsOptional()
  @IsString()
  login?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  password!: string;
}
