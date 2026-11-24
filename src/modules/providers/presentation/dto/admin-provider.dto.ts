import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto.js';
import { Trim } from '../../../../common/validation/validators.js';
import { type ProviderAdminDetail } from '../../application/admin-providers.queries.js';
import { VerificationStatus } from '../../domain/provider.js';
import { type ProviderAdminSummary } from '../../domain/provider.repositories.js';
import { DocumentResponseDto, toDocumentResponse } from './media.dto.js';
import { OfferingResponseDto, toOfferingResponse } from './offering.dto.js';
import { ProviderProfileResponseDto, toProviderProfileResponse } from './provider-profile.dto.js';

export class AdminProviderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by verification status',
    enum: VerificationStatus,
    example: VerificationStatus.PENDING_VERIFICATION,
  })
  @IsOptional()
  @IsEnum(VerificationStatus)
  readonly status?: VerificationStatus;

  @ApiPropertyOptional({
    description: 'Business name, owner name or phone contains',
    example: 'thapa',
    maxLength: 80,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 80)
  readonly q?: string;
}

export class ReasonRequestDto {
  @ApiProperty({
    description: 'Reason shown to the provider and kept in the audit log',
    example: 'Citizenship photo is unreadable; please upload a clearer scan.',
    minLength: 10,
    maxLength: 500,
  })
  @Trim()
  @IsString()
  @Length(10, 500)
  readonly reason: string;
}

export class AdminProviderSummaryResponseDto {
  @ApiProperty({ type: ProviderProfileResponseDto })
  readonly provider: ProviderProfileResponseDto;

  @ApiProperty({ description: 'Owner full name', example: 'Ram Bahadur Thapa' })
  readonly fullName: string;

  @ApiProperty({ description: 'Owner phone', example: '+9779841234567' })
  readonly phone: string;

  @ApiProperty({
    description: 'Owner email',
    example: 'ram@example.com',
    nullable: true,
    type: String,
  })
  readonly email: string | null;

  @ApiProperty({ description: 'Uploaded documents', example: 2 })
  readonly documentCount: number;
}

export class AdminProviderDetailResponseDto extends AdminProviderSummaryResponseDto {
  @ApiProperty({ type: [DocumentResponseDto], description: 'Documents with signed URLs' })
  readonly documents: DocumentResponseDto[];

  @ApiProperty({ type: [OfferingResponseDto] })
  readonly offerings: OfferingResponseDto[];
}

export const toAdminSummaryResponse = (
  s: ProviderAdminSummary,
): AdminProviderSummaryResponseDto => ({
  provider: toProviderProfileResponse(s.provider),
  fullName: s.fullName,
  phone: s.phone,
  email: s.email,
  documentCount: s.documentCount,
});

export const toAdminDetailResponse = (d: ProviderAdminDetail): AdminProviderDetailResponseDto => ({
  provider: toProviderProfileResponse(d.summary.provider),
  fullName: d.summary.fullName,
  phone: d.summary.phone,
  email: d.summary.email,
  documentCount: d.summary.documentCount,
  documents: d.documents.map(toDocumentResponse),
  offerings: d.offerings.map(toOfferingResponse),
});
