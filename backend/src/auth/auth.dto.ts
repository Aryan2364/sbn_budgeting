import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Enter a complete email address, like name@company.com' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  password!: string;
}
