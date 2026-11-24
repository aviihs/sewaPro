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
import { SendOtpUseCase } from '../application/send-otp.use-case.js';
import { VerifyOtpUseCase } from '../application/verify-otp.use-case.js';
import {
  LoginRequestDto,
  RefreshTokenRequestDto,
  RegisterRequestDto,
  SendOtpRequestDto,
  VerifyOtpRequestDto,
} from './dto/auth.request.dto.js';
import {
  AuthSessionResponseDto,
  OtpSentResponseDto,
  toAuthSessionResponse,
  toOtpSentResponse,
} from './dto/auth.response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerCustomer: RegisterCustomerUseCase,
    private readonly login: LoginUseCase,
    private readonly sendOtp: SendOtpUseCase,
    private readonly verifyOtp: VerifyOtpUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutSession: LogoutUseCase,
    private readonly getMyProfile: GetMyProfileUseCase,
  ) {}

  @Public()
  @SensitiveRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Register a customer with email, phone and password' })
  @ApiEnvelopeResponse(AuthSessionResponseDto, {
    description: 'Account created and signed in',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 409, 429)
  async register(
    @Body() body: RegisterRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.registerCustomer.execute(body, context));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
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
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Send a 6-digit login code by SMS (same response whether or not the phone is registered)',
  })
  @ApiEnvelopeResponse(OtpSentResponseDto, { description: 'Code sent' })
  @ApiErrors(400, 429)
  async requestOtp(@Body() body: SendOtpRequestDto): Promise<OtpSentResponseDto> {
    return toOtpSentResponse(await this.sendOtp.execute(body.phone));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign in with phone + code (creates a customer account on first use when fullName is given)',
  })
  @ApiEnvelopeResponse(AuthSessionResponseDto, { description: 'Signed in' })
  @ApiErrors(400, 401, 403, 422, 429)
  async confirmOtp(
    @Body() body: VerifyOtpRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.verifyOtp.execute(body, context));
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
