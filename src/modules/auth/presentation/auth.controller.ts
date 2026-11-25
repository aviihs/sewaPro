import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  Public,
  ReqContext,
  SensitiveRateLimit,
} from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser, type RequestContext } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { GetMyProfileUseCase } from '../../users/application/get-my-profile.use-case.js';
import {
  UserProfileResponseDto,
  toUserProfileResponse,
} from '../../users/presentation/dto/user-profile.response.dto.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { RegisterCustomerUseCase } from '../application/register-customer.use-case.js';
import {
  ResendVerificationUseCase,
  VerifyEmailUseCase,
} from '../application/email-verification.use-cases.js';
import {
  EmailRequestDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  VerifyEmailRequestDto,
} from './dto/auth.request.dto.js';
import {
  AuthSessionResponseDto,
  CodeSentResponseDto,
  RegistrationResponseDto,
  toAuthSessionResponse,
  toCodeSentResponse,
  toRegistrationResponse,
} from './dto/auth.response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerCustomer: RegisterCustomerUseCase,
    private readonly login: LoginUseCase,
    private readonly verifyEmail: VerifyEmailUseCase,
    private readonly resendVerification: ResendVerificationUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutSession: LogoutUseCase,
    private readonly getMyProfile: GetMyProfileUseCase,
  ) {}

  @Public()
  @SensitiveRateLimit()
  @Post('register')
  @ApiOperation({
    summary: 'Register a customer with email, phone and password; emails a verification code',
  })
  @ApiEnvelopeResponse(RegistrationResponseDto, {
    description: 'Account created; verify the email to sign in',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 409, 429)
  async register(@Body() body: RegisterRequestDto): Promise<RegistrationResponseDto> {
    return toRegistrationResponse(await this.registerCustomer.execute(body));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with email and password (403 EMAIL_NOT_VERIFIED until the email is verified)',
  })
  @ApiEnvelopeResponse(AuthSessionResponseDto, { description: 'Signed in' })
  @ApiErrors(400, 401, 403, 429)
  async signIn(
    @Body() body: LoginRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.login.execute(body, context));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the email with the emailed 6-digit code and sign in' })
  @ApiEnvelopeResponse(AuthSessionResponseDto, { description: 'Email verified, signed in' })
  @ApiErrors(400, 401, 403, 429)
  async confirmEmail(
    @Body() body: VerifyEmailRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.verifyEmail.execute(body, context));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Email a new verification code (same response whether or not the account exists or is verified)',
  })
  @ApiEnvelopeResponse(CodeSentResponseDto, { description: 'Code sent if the account needs one' })
  @ApiErrors(400, 429)
  async resend(@Body() body: EmailRequestDto): Promise<CodeSentResponseDto> {
    return toCodeSentResponse(await this.resendVerification.execute(body.email));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and get a new access token' })
  @ApiEnvelopeResponse(AuthSessionResponseDto, { description: 'New token pair' })
  @ApiErrors(400, 401, 403, 429)
  async refresh(
    @Body() body: RefreshTokenRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.refreshSession.execute(body.refreshToken, context));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session (refresh token family). Idempotent.' })
  @ApiNoContentResponse({ description: 'Session revoked' })
  @ApiErrors(400)
  async logout(@Body() body: RefreshTokenRequestDto): Promise<void> {
    await this.logoutSession.execute(body.refreshToken);
  }

  @Get('me')
  @ApiAuth()
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiEnvelopeResponse(UserProfileResponseDto, { description: 'Current user' })
  @ApiErrors(404)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileResponseDto> {
    return toUserProfileResponse(await this.getMyProfile.execute(user.id));
  }
}
