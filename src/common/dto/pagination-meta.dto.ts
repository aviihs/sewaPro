import { ApiProperty } from '@nestjs/swagger';
import { type PaginationMeta } from '../utils/pagination.js';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty({ description: 'Current 1-based page', example: 1 })
  readonly page: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  readonly limit: number;

  @ApiProperty({ description: 'Total matching items', example: 57 })
  readonly totalItems: number;

  @ApiProperty({ description: 'Total pages', example: 3 })
  readonly totalPages: number;

  @ApiProperty({ description: 'Whether a next page exists', example: true })
  readonly hasNextPage: boolean;

  @ApiProperty({ description: 'Whether a previous page exists', example: false })
  readonly hasPreviousPage: boolean;
}
