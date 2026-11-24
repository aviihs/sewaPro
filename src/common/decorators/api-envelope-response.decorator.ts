import { HttpStatus, type Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PaginationMetaDto } from '../dto/pagination-meta.dto.js';

interface EnvelopeOptions {
  readonly description: string;
  readonly status?: HttpStatus.OK | HttpStatus.CREATED;
  readonly isArray?: boolean;
}

/** Documents a `{ success: true, data: Model }` (or `data: Model[]`) response. */
export function ApiEnvelopeResponse(
  model: Type,
  { description, status = HttpStatus.OK, isArray = false }: EnvelopeOptions,
): MethodDecorator & ClassDecorator {
  const ref = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: isArray ? { type: 'array', items: ref } : ref,
        },
      },
    }),
  );
}

/** Documents a `{ success: true, data: Model[], meta: PaginationMeta }` response. */
export function ApiPaginatedResponse(
  model: Type,
  description: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto),
    ApiResponse({
      status: HttpStatus.OK,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
        },
      },
    }),
  );
}

/** Documents a `{ success: true, data: Model[], meta: { limit, nextCursor, hasMore } }` response. */
export function ApiCursorPaginatedResponse(
  model: Type,
  description: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: HttpStatus.OK,
      description,
      schema: {
        type: 'object',
        required: ['success', 'data', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: {
            type: 'object',
            properties: {
              limit: { type: 'integer', example: 20 },
              nextCursor: {
                type: 'string',
                nullable: true,
                example: 'MjAzMC0wMS0wN1QxMDowMDowMC4wMDBafDAxOTM',
              },
              hasMore: { type: 'boolean', example: true },
            },
          },
        },
      },
    }),
  );
}
