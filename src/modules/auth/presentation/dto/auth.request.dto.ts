import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import {
  IsNepalPhone,
  NormalizePhone,
  Trim,
  TrimLower,
} from '../../../../common/validation/validators.js';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE = 'password must contain at least one letter and one digit';

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
    description: 'Nepal mobile number; normalized to E.164',
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

export class SendOtpRequestDto {
  @ApiProperty({ description: 'Nepal mobile number to receive the code', example: '9841234567' })
  @NormalizePhone()
  @IsNepalPhone()
  readonly phone: string;
}

export class VerifyOtpRequestDto {
  @ApiProperty({ description: 'Phone the code was sent to', example: '9841234567' })
  @NormalizePhone()
  @IsNepalPhone()
  readonly phone: string;

  @ApiProperty({ description: '6-digit code from the SMS', example: '482913', pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  readonly code: string;

  @ApiPropertyOptional({
    description: 'Required only on first sign-in for a new phone (creates a customer account)',
    example: 'Nabin Rai',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly fullName?: string;
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
