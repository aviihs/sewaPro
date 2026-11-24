import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { Trim, TrimLower } from '../../../../common/validation/validators.js';

export class UpdateProfileRequestDto {
  @ApiPropertyOptional({
    description: 'Full name',
    example: 'Aarati Sharma',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 100)
  readonly fullName?: string;

  @ApiPropertyOptional({
    description: 'Email address (stored lower-case)',
    example: 'aarati@example.com',
    maxLength: 254,
  })
  @IsOptional()
  @TrimLower()
  @IsEmail()
  @MaxLength(254)
  readonly email?: string;
}
