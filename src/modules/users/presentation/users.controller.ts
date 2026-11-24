import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/auth.decorators.js';
import { type AuthenticatedUser } from '../../../common/auth/role.js';
import { ApiEnvelopeResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { GetMyProfileUseCase } from '../application/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from '../application/update-my-profile.use-case.js';
import { UpdateProfileRequestDto } from './dto/update-profile.request.dto.js';
import { UserProfileResponseDto, toUserProfileResponse } from './dto/user-profile.response.dto.js';

@ApiTags('Users')
@ApiAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly getMyProfile: GetMyProfileUseCase,
    private readonly updateMyProfile: UpdateMyProfileUseCase,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiEnvelopeResponse(UserProfileResponseDto, { description: 'Your profile' })
  @ApiErrors(404)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileResponseDto> {
    return toUserProfileResponse(await this.getMyProfile.execute(user.id));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my name or email' })
  @ApiEnvelopeResponse(UserProfileResponseDto, { description: 'Updated profile' })
  @ApiErrors(400, 404, 409)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileRequestDto,
  ): Promise<UserProfileResponseDto> {
    return toUserProfileResponse(await this.updateMyProfile.execute(user.id, body));
  }
}
