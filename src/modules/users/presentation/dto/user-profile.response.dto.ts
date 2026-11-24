import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../../common/auth/role.js';
import { type User, UserStatus } from '../../domain/user.js';

export class UserProfileResponseDto {
  @ApiProperty({
    description: 'User id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({ description: 'Account role', enum: Role, example: Role.CUSTOMER })
  readonly role: Role;

  @ApiProperty({ description: 'Account status', enum: UserStatus, example: UserStatus.ACTIVE })
  readonly status: UserStatus;

  @ApiProperty({ description: 'Full name', example: 'Aarati Sharma' })
  readonly fullName: string;

  @ApiProperty({
    description: 'Email (lower-case)',
    example: 'aarati@example.com',
    nullable: true,
    type: String,
  })
  readonly email: string | null;

  @ApiProperty({ description: 'Mobile number, E.164', example: '+9779841234567' })
  readonly phone: string;

  @ApiProperty({ description: 'Whether the phone was verified by OTP', example: true })
  readonly phoneVerified: boolean;

  @ApiProperty({ description: 'Account creation time', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;
}

/** Never exposes the password hash or internal timestamps. */
export function toUserProfileResponse(user: User): UserProfileResponseDto {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    phoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
  };
}
