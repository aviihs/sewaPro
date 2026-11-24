import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Trim } from '../../../../common/validation/validators.js';
import { DocumentStatus, DocumentType } from '../../domain/media.js';
import { type DocumentView, type PortfolioView } from '../../application/provider-access.js';

export class UploadDocumentRequestDto {
  @ApiProperty({
    description: 'Kind of document',
    enum: DocumentType,
    example: DocumentType.CITIZENSHIP,
  })
  @IsEnum(DocumentType)
  readonly type: DocumentType;
}

export class AddPortfolioImageRequestDto {
  @ApiPropertyOptional({
    description: 'Caption',
    example: 'Kitchen rewiring, Baneshwor',
    maxLength: 200,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 200)
  readonly caption?: string;
}

export class DocumentResponseDto {
  @ApiProperty({
    description: 'Document id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({
    description: 'Document type',
    enum: DocumentType,
    example: DocumentType.CITIZENSHIP,
  })
  readonly type: DocumentType;

  @ApiProperty({
    description: 'Review status',
    enum: DocumentStatus,
    example: DocumentStatus.PENDING,
  })
  readonly status: DocumentStatus;

  @ApiProperty({ description: 'Detected content type', example: 'application/pdf' })
  readonly mimeType: string;

  @ApiProperty({ description: 'Size in bytes', example: 204800 })
  readonly sizeBytes: number;

  @ApiProperty({
    description: 'Original file name',
    example: 'citizenship.pdf',
    nullable: true,
    type: String,
  })
  readonly originalName: string | null;

  @ApiProperty({ description: 'Reviewer note', example: null, nullable: true, type: String })
  readonly reviewNote: string | null;

  @ApiProperty({
    description: 'Short-lived signed download URL',
    example: 'http://localhost:3000/api/v1/files/private?key=…&expires=…&signature=…',
  })
  readonly url: string;

  @ApiProperty({ description: 'When the URL stops working', example: '2030-01-01T10:05:00.000Z' })
  readonly urlExpiresAt: Date;

  @ApiProperty({ description: 'Uploaded at', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;
}

export class PortfolioImageResponseDto {
  @ApiProperty({
    description: 'Image id',
    format: 'uuid',
    example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f',
  })
  readonly id: string;

  @ApiProperty({
    description: 'Public URL',
    example: 'http://localhost:3000/api/v1/files/public?key=…',
  })
  readonly url: string;

  @ApiProperty({ description: 'Caption', example: null, nullable: true, type: String })
  readonly caption: string | null;

  @ApiProperty({ description: 'Display order', example: 0 })
  readonly sortOrder: number;
}

export const toDocumentResponse = ({
  document: d,
  url,
  urlExpiresAt,
}: DocumentView): DocumentResponseDto => ({
  id: d.id,
  type: d.type,
  status: d.status,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  originalName: d.originalName,
  reviewNote: d.reviewNote,
  url,
  urlExpiresAt,
  createdAt: d.createdAt,
});

export const toPortfolioResponse = ({ image, url }: PortfolioView): PortfolioImageResponseDto => ({
  id: image.id,
  url,
  caption: image.caption,
  sortOrder: image.sortOrder,
});
