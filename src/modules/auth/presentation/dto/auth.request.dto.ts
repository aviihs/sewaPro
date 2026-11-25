import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  IsNepalPhone,
  NormalizePhone,
  Trim,
  TrimLower,
} from '../../../../common/validation/validators.js';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE = 'password must contain at least one letter and one digit';
const NEW_PASSWORD_PROPERTY = {
  description: 'New password: 8 to 128 characters with at least one letter and one digit',
  example: 'Pokhara2031',
  minLength: 8,
  maxLength: 128,
  format: 'password',
} as const;

export class RegisterRequestDto {
  @ApiProperty({ description: 'Full name', example: 'Aarati Sharma', minLength: 2, maxLength: 100 })
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly fullName: string;

  @ApiProperty({ description: 'Email (stored lower-case)', example: 'aarati@example.com' })
  @TrimLower()
  @IsEmail()
  @MaxLength(254)
  readonly email: string;

  @ApiProperty({
    description: 'Nepal mobile number; normalized to E.164 (stored unverified for now)',
    example: '9841234567',
  })
  @NormalizePhone()
  @IsNepalPhone()
  readonly phone: string;

  @ApiProperty({
    description: 'Password: 8 to 128 characters with at least one letter and one digit',
    example: 'Kathmandu2030',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @Length(8, 128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  readonly password: string;
}

export class LoginRequestDto {
  @ApiProperty({ description: 'Account email', example: 'aarati@example.com' })
  @TrimLower()
  @IsEmail()
  @MaxLength(254)
  readonly email: string;

  @ApiProperty({ description: 'Password', example: 'Kathmandu2030', format: 'password' })
  @IsString()
  @Length(1, 128)
  readonly password: string;
}

const CODE_PROPERTY = {
  description: '6-digit code from the email',
  example: '482913',
  pattern: '^\\d{6}$',
} as const;

class EmailField {
  @ApiProperty({ description: 'Account email', example: 'aarati@example.com' })
  @TrimLower()
  @IsEmail()
  @MaxLength(254)
  readonly email: string;
}

export class VerifyEmailRequestDto extends EmailField {
  @ApiProperty(CODE_PROPERTY)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  readonly code: string;
}

export class EmailRequestDto extends EmailField {}

export class ResetPasswordRequestDto extends EmailField {
  @ApiProperty(CODE_PROPERTY)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  readonly code: string;

  @ApiProperty(NEW_PASSWORD_PROPERTY)
  @IsString()
  @Length(8, 128)
  @Matches(PASSWORD_RULE, { message: 'newPassword must contain at least one letter and one digit' })
  readonly newPassword: string;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ description: 'Current password', example: 'Kathmandu2030', format: 'password' })
  @IsString()
  @Length(1, 128)
  readonly currentPassword: string;

  @ApiProperty(NEW_PASSWORD_PROPERTY)
  @IsString()
  @Length(8, 128)
  @Matches(PASSWORD_RULE, { message: 'newPassword must contain at least one letter and one digit' })
  readonly newPassword: string;
}

export class RefreshTokenRequestDto {
  @ApiProperty({
    description: 'Refresh token from login/registration/previous refresh',
    example: 'hY3n0w9c4m1e2k5Jd8sQ0aB7xV6uT1zR3pL9oN2mK4jH8gF5dS1aZ7xC0vB6nM3qW',
  })
  @IsString()
  @Length(20, 200)
  readonly refreshToken: string;
}
