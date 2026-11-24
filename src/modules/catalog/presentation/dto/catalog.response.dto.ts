import { ApiProperty, OmitType } from '@nestjs/swagger';
import {
  type ActiveCategory,
  type Category,
  RemovalOutcome,
  type Service,
} from '../../domain/catalog.js';

const UUID_EXAMPLE = '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f';

export class PublicServiceResponseDto {
  @ApiProperty({ description: 'Service id', format: 'uuid', example: UUID_EXAMPLE })
  readonly id: string;

  @ApiProperty({ description: 'Category id', format: 'uuid', example: UUID_EXAMPLE })
  readonly categoryId: string;

  @ApiProperty({ description: 'Name', example: 'Fan Installation' })
  readonly name: string;

  @ApiProperty({ description: 'URL slug', example: 'fan-installation' })
  readonly slug: string;

  @ApiProperty({ description: 'Description', example: null, nullable: true, type: String })
  readonly description: string | null;
}

export class PublicCategoryResponseDto {
  @ApiProperty({ description: 'Category id', format: 'uuid', example: UUID_EXAMPLE })
  readonly id: string;

  @ApiProperty({ description: 'Name', example: 'Electrician' })
  readonly name: string;

  @ApiProperty({ description: 'URL slug', example: 'electrician' })
  readonly slug: string;

  @ApiProperty({
    description: 'Description',
    example: 'Wiring and repairs',
    nullable: true,
    type: String,
  })
  readonly description: string | null;

  @ApiProperty({ description: 'Icon URL', example: null, nullable: true, type: String })
  readonly iconUrl: string | null;

  @ApiProperty({ type: [PublicServiceResponseDto], description: 'Active services' })
  readonly services: PublicServiceResponseDto[];
}

export class CategoryResponseDto extends OmitType(PublicCategoryResponseDto, [
  'services',
] as const) {
  @ApiProperty({ description: 'Display order', example: 0 })
  readonly sortOrder: number;

  @ApiProperty({ description: 'Visible to customers', example: true })
  readonly isActive: boolean;

  @ApiProperty({ description: 'Created at', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;

  @ApiProperty({ description: 'Updated at', example: '2030-01-01T10:00:00.000Z' })
  readonly updatedAt: Date;
}

export class ServiceResponseDto extends PublicServiceResponseDto {
  @ApiProperty({ description: 'Visible to customers', example: true })
  readonly isActive: boolean;

  @ApiProperty({ description: 'Created at', example: '2030-01-01T10:00:00.000Z' })
  readonly createdAt: Date;

  @ApiProperty({ description: 'Updated at', example: '2030-01-01T10:00:00.000Z' })
  readonly updatedAt: Date;
}

export class RemovalResponseDto {
  @ApiProperty({ description: 'Id of the removed entry', format: 'uuid', example: UUID_EXAMPLE })
  readonly id: string;

  @ApiProperty({
    description: 'DELETED (soft-deleted) or DEACTIVATED (still offered by providers, hidden)',
    enum: RemovalOutcome,
    example: RemovalOutcome.DELETED,
  })
  readonly outcome: RemovalOutcome;
}

export const toPublicService = (s: Service): PublicServiceResponseDto => ({
  id: s.id,
  categoryId: s.categoryId,
  name: s.name,
  slug: s.slug,
  description: s.description,
});

export const toPublicCategory = ({
  category,
  services,
}: ActiveCategory): PublicCategoryResponseDto => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  iconUrl: category.iconUrl,
  services: services.map(toPublicService),
});

export const toCategoryResponse = (c: Category): CategoryResponseDto => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  iconUrl: c.iconUrl,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const toServiceResponse = (s: Service): ServiceResponseDto => ({
  id: s.id,
  categoryId: s.categoryId,
  name: s.name,
  slug: s.slug,
  description: s.description,
  isActive: s.isActive,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});
