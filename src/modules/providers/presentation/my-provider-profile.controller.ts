import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  Public,
  ReqContext,
  Roles,
  SensitiveRateLimit,
} from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser, type RequestContext, Role } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import {
  AuthSessionResponseDto,
  toAuthSessionResponse,
} from '../../auth/presentation/dto/auth.response.dto.js';
import {
  GetEarningsSummaryUseCase,
  GetProviderDashboardUseCase,
} from '../application/dashboard.use-cases.js';
import {
  GetMyProviderProfileUseCase,
  ResubmitVerificationUseCase,
  UpdateMyProviderProfileUseCase,
} from '../application/profile.use-cases.js';
import { RegisterProviderUseCase } from '../application/register-provider.use-case.js';
import {
  EarningsSummaryResponseDto,
  ProviderDashboardResponseDto,
  toDashboardResponse,
  toEarningsResponse,
} from './dto/dashboard.dto.js';
import {
  ProviderProfileResponseDto,
  RegisterProviderRequestDto,
  UpdateProviderProfileRequestDto,
  toProviderProfileResponse,
} from './dto/provider-profile.dto.js';

@ApiTags('Providers: Me')
@Controller('providers')
export class MyProviderProfileController {
  constructor(
    private readonly registerProvider: RegisterProviderUseCase,
    private readonly getProfile: GetMyProviderProfileUseCase,
    private readonly updateProfile: UpdateMyProviderProfileUseCase,
    private readonly resubmit: ResubmitVerificationUseCase,
    private readonly dashboard: GetProviderDashboardUseCase,
    private readonly earnings: GetEarningsSummaryUseCase,
  ) {}

  @Public()
  @SensitiveRateLimit()
  @Post('register')
  @ApiOperation({
    summary: 'Register as a provider (account + profile pending verification), signed in',
  })
  @ApiEnvelopeResponse(AuthSessionResponseDto, {
    description: 'Registered',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 409, 429)
  async register(
    @Body() body: RegisterProviderRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    const input = {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      password: body.password,
      businessName: body.businessName ?? null,
      bio: body.bio ?? null,
      experienceYears: body.experienceYears,
      latitude: body.latitude,
      longitude: body.longitude,
      serviceRadiusKm: body.serviceRadiusKm,
    };
    return toAuthSessionResponse(await this.registerProvider.execute(input, context));
  }

  @Get('me')
  @ApiAuth()
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'My provider profile and verification status' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Profile' })
  @ApiErrors(404)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.getProfile.execute(user.id));
  }

  @Patch('me')
  @ApiAuth()
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Update business details, location, radius or availability switch' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Updated profile' })
  @ApiErrors(400, 404)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProviderProfileRequestDto,
  ): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.updateProfile.execute(user.id, body));
  }

  @Post('me/verification/resubmit')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Send a rejected profile back for review (upload new documents first)' })
  @ApiEnvelopeResponse(ProviderProfileResponseDto, { description: 'Back in the review queue' })
  @ApiErrors(404, 409, 422)
  async resubmitVerification(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderProfileResponseDto> {
    return toProviderProfileResponse(await this.resubmit.execute(user.id));
  }

  @Get('me/dashboard')
  @ApiAuth()
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Booking counts, today, rating' })
  @ApiEnvelopeResponse(ProviderDashboardResponseDto, { description: 'Dashboard' })
  @ApiErrors(404)
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderDashboardResponseDto> {
    return toDashboardResponse(await this.dashboard.execute(user.id));
  }

  @Get('me/earnings-summary')
  @ApiAuth()
  @Roles(Role.PROVIDER)
  @ApiOperation({ summary: 'Completed jobs and totals of final amounts (no commission)' })
  @ApiEnvelopeResponse(EarningsSummaryResponseDto, { description: 'Earnings summary' })
  @ApiErrors(404)
  async getEarnings(@CurrentUser() user: AuthenticatedUser): Promise<EarningsSummaryResponseDto> {
    return toEarningsResponse(await this.earnings.execute(user.id));
  }
}
