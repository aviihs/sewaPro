import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Roles } from '../../../common/auth/auth.decorators.js';
import { ActorRole, Role } from '../../../common/auth/role.js';
import { ApiPaginatedResponse } from '../../../common/decorators/api-envelope-response.decorator.js';
import { ApiAuth, ApiErrors } from '../../../common/decorators/api-docs.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { type PaginatedResult } from '../../../common/utils/pagination.js';
import { ListAuditLogsUseCase } from '../application/audit.use-cases.js';
import { type AuditLogEntry } from '../domain/audit-log.js';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Who acted', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly actorId?: string;
  @ApiPropertyOptional({ description: 'Exact action', example: 'provider.verified' })
  @IsOptional()
  @Matches(/^[a-z-]+\.[a-z-]+$/, { message: 'action must look like entity.verb' })
  readonly action?: string;
  @ApiPropertyOptional({ description: 'Entity type', example: 'Provider' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  readonly entityType?: string;
  @ApiPropertyOptional({ description: 'Entity id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  readonly entityId?: string;
  @ApiPropertyOptional({ description: 'At or after (ISO 8601)', type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly from?: Date;
  @ApiPropertyOptional({ description: 'Before (ISO 8601)', type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  readonly to?: Date;
}

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid', example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly id: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid', example: null }) readonly actorId:
    string | null;
  @ApiProperty({ enum: ActorRole, nullable: true, example: ActorRole.ADMIN })
  readonly actorRole: ActorRole | null;
  @ApiProperty({ example: 'provider.verified' }) readonly action: string;
  @ApiProperty({ example: 'Provider' }) readonly entityType: string;
  @ApiProperty({ nullable: true, type: String, example: '01933b5e-8f3a-7c1d-9e2f-1a2b3c4d5e6f' })
  readonly entityId: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { verificationStatus: 'PENDING_VERIFICATION' },
  })
  readonly before: unknown;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { verificationStatus: 'VERIFIED' },
  })
  readonly after: unknown;
  @ApiProperty({ nullable: true, type: String, example: '203.0.113.7' }) readonly ipAddress:
    string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Mozilla/5.0' }) readonly userAgent:
    string | null;
  @ApiProperty({ nullable: true, type: String, example: '6f1c2d4e-8a0b-4c4e-9a43-0c6f0e7c1b2a' })
  readonly requestId: string | null;
  @ApiProperty({ example: '2030-01-07T04:20:00.000Z' }) readonly createdAt: Date;
}

const toAuditLogResponse = (e: AuditLogEntry): AuditLogResponseDto => ({
  id: e.id,
  actorId: e.actorId,
  actorRole: e.actorRole,
  action: e.action,
  entityType: e.entityType,
  entityId: e.entityId,
  before: e.before,
  after: e.after,
  ipAddress: e.ipAddress,
  userAgent: e.userAgent,
  requestId: e.requestId,
  createdAt: e.createdAt,
});

@ApiTags('Admin: Audit')
@ApiAuth()
@Roles(Role.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly listAuditLogs: ListAuditLogsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Audit log, newest first (read-only)' })
  @ApiPaginatedResponse(AuditLogResponseDto, 'Audit entries')
  @ApiErrors(400)
  async list(@Query() query: AuditLogQueryDto): Promise<PaginatedResult<AuditLogResponseDto>> {
    const { actorId, action, entityType, entityId, from, to } = query;
    const page = await this.listAuditLogs.execute(
      { actorId, action, entityType, entityId, from, to },
      query,
    );
    return page.map(toAuditLogResponse);
  }
}
