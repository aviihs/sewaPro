import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckDto {
  @ApiProperty({
    description: 'Overall status',
    enum: ['ok', 'error', 'shutting_down'],
    example: 'ok',
  })
  readonly status: string;

  @ApiProperty({
    description: 'Per-dependency results',
    example: { database: { status: 'up' } },
    type: 'object',
    additionalProperties: true,
  })
  readonly details: Record<string, unknown>;
}
