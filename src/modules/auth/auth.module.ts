import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service.js';
import { UsersModule } from '../users/users.module.js';
import { AccessTokenService, AuthSecrets, AuthSettings } from './application/auth.ports.js';
import { AuthenticateAccessTokenUseCase } from './application/authenticate-access-token.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { RegisterCustomerUseCase } from './application/register-customer.use-case.js';
import { EmailCodes } from './application/email-codes.js';
import {
  ResendVerificationUseCase,
  VerifyEmailUseCase,
} from './application/email-verification.use-cases.js';
import {
  ChangePasswordUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from './application/password-reset.use-cases.js';
import { SessionIssuer } from './application/session-issuer.js';
import { OtpChallengeRepository } from './domain/otp.js';
import { RefreshTokenRepository } from './domain/refresh-token.js';
import { CryptoAuthSecrets } from './infrastructure/crypto-auth-secrets.js';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  JwtAccessTokenService,
} from './infrastructure/jwt-access-token.service.js';
import { PrismaOtpChallengeRepository } from './infrastructure/prisma-otp-challenge.repository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { AuthController } from './presentation/auth.controller.js';
import { PasswordController } from './presentation/password.controller.js';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard.js';
import { RolesGuard } from './presentation/guards/roles.guard.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.auth.accessSecret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.auth.accessTtlSeconds,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController, PasswordController],
  providers: [
    { provide: AccessTokenService, useClass: JwtAccessTokenService },
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
    { provide: OtpChallengeRepository, useClass: PrismaOtpChallengeRepository },
    {
      provide: AuthSecrets,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new CryptoAuthSecrets(config.auth.otpPepper),
    },
    {
      provide: AuthSettings,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): AuthSettings => ({
        accessTtlSeconds: config.auth.accessTtlSeconds,
        refreshTtlDays: config.auth.refreshTtlDays,
      }),
    },
    SessionIssuer,
    EmailCodes,
    AuthenticateAccessTokenUseCase,
    RegisterCustomerUseCase,
    LoginUseCase,
    VerifyEmailUseCase,
    ResendVerificationUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    ChangePasswordUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SessionIssuer, EmailCodes, RefreshTokenRepository],
})
export class AuthModule {}
