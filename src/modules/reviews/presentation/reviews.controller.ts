import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, CurrentUser, Public, Roles } from '../../../common/auth/auth.decorators.js';
import { type Actor, type AuthenticatedUser, Role } from '../../../common/auth/role.js';
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import {
  CreateReviewUseCase,
  HideReviewUseCase,
  ListProviderReviewsUseCase,
  ListReviewsForModerationUseCase,
} from '../application/reviews.use-cases.js';
import {
  AdminReviewResponseDto,
  CreateReviewRequestDto,
  HideReviewRequestDto,
  ReviewModerationQueryDto,
  ReviewResponseDto,
  toAdminReviewResponse,
  toReviewResponse,
} from './dto/review.dto.js';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(
    private readonly createReview: CreateReviewUseCase,
    private readonly listProviderReviews: ListProviderReviewsUseCase,
    private readonly listForModeration: ListReviewsForModerationUseCase,
    private readonly hideReview: HideReviewUseCase,
  ) {}

  @Post('bookings/:bookingId/review')
  @ApiAuth()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: 'Review a completed booking (once, within 30 days)' })
  @ApiEnvelopeResponse(ReviewResponseDto, {
    description: 'Review created',
    status: HttpStatus.CREATED,
  })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() body: CreateReviewRequestDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.createReview.execute(user, bookingId, {
      overall: body.overall,
      serviceQuality: body.serviceQuality,
      professionalism: body.professionalism,
      punctuality: body.punctuality,
      communication: body.communication,
      comment: body.comment ?? null,
    });
    return toReviewResponse(review);
  }

  @Public()
  @Get('providers/:providerId/reviews')
  @ApiOperation({ summary: 'Visible reviews of a verified provider, newest first' })
  @ApiPaginatedResponse(ReviewResponseDto, 'Reviews')
  @ApiErrors(400, 404)
  async providerReviews(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<ReviewResponseDto>> {
    return (await this.listProviderReviews.execute(providerId, query)).map(toReviewResponse);
  }

  @Get('admin/reviews')
  @ApiAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reviews for moderation (filter by hidden, provider, low rating)' })
  @ApiPaginatedResponse(AdminReviewResponseDto, 'Reviews')
  @ApiErrors(400)
  async moderation(
    @Query() query: ReviewModerationQueryDto,
  ): Promise<PaginatedResult<AdminReviewResponseDto>> {
    const filter = {
      hidden: query.hidden,
      providerId: query.providerId,
      maxOverall: query.maxOverall,
    };
    return (await this.listForModeration.execute(filter, query)).map(toAdminReviewResponse);
  }

  @Post('admin/reviews/:id/hide')
  @ApiAuth()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hide a review (soft) and recalculate the provider rating' })
  @ApiEnvelopeResponse(AdminReviewResponseDto, { description: 'Hidden' })
  @ApiErrors(400, 404, 409)
  async hide(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HideReviewRequestDto,
  ): Promise<AdminReviewResponseDto> {
    const review = await this.hideReview.execute(actor, id, body.reason);
    return toAdminReviewResponse(review);
  }
}
