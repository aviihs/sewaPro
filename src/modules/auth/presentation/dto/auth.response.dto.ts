import { ApiProperty } from '@nestjs/swagger';
import {
  UserProfileResponseDto,
  toUserProfileResponse,
} from '../../../users/presentation/dto/user-profile.response.dto.js';
import { type CodeSent } from '../../application/email-codes.js';
import { type PendingRegistration } from '../../application/register-customer.use-case.js';
import { type AuthSession } from '../../application/session-issuer.js';

export class AuthSessionResponseDto {
  @ApiProperty({
    description: 'JWT access token (send as `Authorization: Bearer …`)',
    example: 'eyJhbGciOiJIUzI1NiJ9…',
  })
  readonly accessToken: string;

  @ApiProperty({
    description: 'Opaque refresh token; rotates on every refresh. Store securely.',
    example: 'hY3n0w9c4m1e2k5Jd8sQ0aB7xV6uT1zR3pL9oN2mK4jH8gF5dS1aZ7xC0vB6nM3qW',
  })
  readonly refreshToken: string;

  @ApiProperty({ description: 'Token type', example: 'Bearer', enum: ['Bearer'] })
  readonly tokenType: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  readonly expiresIn: number;

  @ApiProperty({ type: UserProfileResponseDto })
  readonly user: UserProfileResponseDto;
}

export class CodeSentResponseDto {
  @ApiProperty({ description: 'Seconds until the emailed code expires', example: 600 })
  readonly expiresInSeconds: number;

  @ApiProperty({ description: 'Seconds before another code can be requested', example: 60 })
  readonly resendAfterSeconds: number;
}

export class RegistrationResponseDto {
  @ApiProperty({ type: UserProfileResponseDto })
  readonly user: UserProfileResponseDto;

  @ApiProperty({
    type: CodeSentResponseDto,
    description: 'A code was emailed; confirm it with POST /auth/verify-email to sign in',
  })
  readonly verification: CodeSentResponseDto;
}

export function toAuthSessionResponse(session: AuthSession): AuthSessionResponseDto {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenType: 'Bearer',
    expiresIn: session.expiresIn,
    user: toUserProfileResponse(session.user),
  };
}

export const toCodeSentResponse = (sent: CodeSent): CodeSentResponseDto => ({
  expiresInSeconds: sent.expiresInSeconds,
  resendAfterSeconds: sent.resendAfterSeconds,
});

export const toRegistrationResponse = (pending: PendingRegistration): RegistrationResponseDto => ({
  user: toUserProfileResponse(pending.user),
  verification: toCodeSentResponse(pending.verification),
});
