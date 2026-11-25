import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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
import {
  ChangePasswordUseCase,
  ForgotPasswordUseCase,
  ResetPasswordUseCase,
} from '../application/password-reset.use-cases.js';
import {
  ChangePasswordRequestDto,
  EmailRequestDto,
  ResetPasswordRequestDto,
} from './dto/auth.request.dto.js';
import {
  AuthSessionResponseDto,
  CodeSentResponseDto,
  toAuthSessionResponse,
  toCodeSentResponse,
} from './dto/auth.response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class PasswordController {
  constructor(
    private readonly forgotPassword: ForgotPasswordUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  @Public()
  @SensitiveRateLimit()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email a password reset code (same response whether or not the account exists)',
  })
  @ApiEnvelopeResponse(CodeSentResponseDto, { description: 'Code sent if the account exists' })
  @ApiErrors(400, 429)
  async forgot(@Body() body: EmailRequestDto): Promise<CodeSentResponseDto> {
    return toCodeSentResponse(await this.forgotPassword.execute(body.email));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password with the emailed code; signs out every session',
  })
  @ApiNoContentResponse({ description: 'Password changed; sign in again' })
  @ApiErrors(400, 401, 429)
  async reset(@Body() body: ResetPasswordRequestDto): Promise<void> {
    await this.resetPassword.execute(body);
  }

  @SensitiveRateLimit()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({
    summary: 'Change the password; revokes every other session and returns a new one',
  })
  @ApiEnvelopeResponse(AuthSessionResponseDto, { description: 'Password changed, new session' })
  @ApiErrors(400, 404, 422, 429)
  async change(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChangePasswordRequestDto,
    @ReqContext() context: RequestContext,
  ): Promise<AuthSessionResponseDto> {
    return toAuthSessionResponse(await this.changePassword.execute(user.id, body, context));
  }
}
