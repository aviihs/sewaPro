import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { ToBoolean, Trim } from '../../../../common/validation/validators.js';
import { type ReviewView, publicName } from '../../domain/review.js';

const rating = (description: string) =>
  ApiProperty({
    description: `${description}, 1 (poor) to 5 (excellent)`,
    example: 5,
    minimum: 1,
    maximum: 5,
  });

export class CreateReviewRequestDto {
  @rating('Overall') @IsInt() @Min(1) @Max(5) readonly overall: number;
  @rating('Quality of work') @IsInt() @Min(1) @Max(5) readonly serviceQuality: number;
  @rating('Professionalism') @IsInt() @Min(1) @Max(5) readonly professionalism: number;
  @rating('Punctuality') @IsInt() @Min(1) @Max(5) readonly punctuality: number;
  @rating('Communication') @IsInt() @Min(1) @Max(5) readonly communication: number;

  @ApiPropertyOptional({
    description: 'Public comment',
    example: 'Quick, tidy and explained everything.',
    maxLength: 2000,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 2000)
  readonly comment?: string;
}

export class ReviewModerationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Only hidden (true) or only visible (false) reviews',
    example: false,
  })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  readonly hidden?: boolean;

  @ApiPropertyOptional({ description: 'Only reviews of this provider', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly providerId?: string;

  @ApiPropertyOptional({
    description: 'Only reviews with overall rating at most this',
    example: 2,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  readonly maxOverall?: number;
}

export class HideReviewRequestDto {
  @ApiProperty({
    description: 'Why the review is hidden (kept in the audit log)',
    example: 'Contains personal phone number',
    minLength: 5,
    maxLength: 500,
  })
  @Trim()
  @IsString()
  @Length(5, 500)
  readonly reason: string;
}

export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly id: string;
  @ApiProperty({ description: 'Author, shortened for privacy', example: 'Aarati S.' })
  readonly customerName: string;
  @ApiProperty({ example: 5 }) readonly overall: number;
  @ApiProperty({ example: 5 }) readonly serviceQuality: number;
  @ApiProperty({ example: 4 }) readonly professionalism: number;
  @ApiProperty({ example: 5 }) readonly punctuality: number;
  @ApiProperty({ example: 4 }) readonly communication: number;
  @ApiProperty({ nullable: true, type: String, example: 'Quick and tidy.' }) readonly comment:
    string | null;
  @ApiProperty({ example: '2030-01-08T10:00:00.000Z' }) readonly createdAt: Date;
}

export class AdminReviewResponseDto extends ReviewResponseDto {
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly bookingId: string;
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly providerId: string;
  @ApiProperty({ nullable: true, type: Date, example: null }) readonly hiddenAt: Date | null;
  @ApiProperty({ nullable: true, type: String, example: null }) readonly hiddenReason:
    string | null;
}

export const toReviewResponse = ({ review: r, customerName }: ReviewView): ReviewResponseDto => ({
  id: r.id,
  customerName: publicName(customerName),
  overall: r.overall,
  serviceQuality: r.serviceQuality,
  professionalism: r.professionalism,
  punctuality: r.punctuality,
  communication: r.communication,
  comment: r.comment,
  createdAt: r.createdAt,
});

export const toAdminReviewResponse = (view: ReviewView): AdminReviewResponseDto => {
  const r = view.review;
  return {
    id: r.id,
    customerName: view.customerName,
    overall: r.overall,
    serviceQuality: r.serviceQuality,
    professionalism: r.professionalism,
    punctuality: r.punctuality,
    communication: r.communication,
    comment: r.comment,
    createdAt: r.createdAt,
    bookingId: r.bookingId,
    providerId: r.providerId,
    hiddenAt: r.hiddenAt,
    hiddenReason: r.hiddenReason,
  };
};
