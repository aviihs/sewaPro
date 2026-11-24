import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/auth/auth.decorators.js';
import { ApiEnvelopeResponse } from '../../common/decorators/api-envelope-response.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { HealthCheckDto } from './health-check.dto.js';
import { PrismaHealthIndicator } from './prisma.health-indicator.js';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: PrismaHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Liveness probe: the process is up' })
  @ApiEnvelopeResponse(HealthCheckDto, { description: 'Process is alive' })
  async live(): Promise<HealthCheckDto> {
    const result = await this.health.check([]);
    return { status: result.status, details: result.details };
  }

  @Get('ready')
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Readiness probe: dependencies (database) are reachable' })
  @ApiEnvelopeResponse(HealthCheckDto, { description: 'Ready to serve traffic' })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto, description: 'A dependency is down' })
  async ready(): Promise<HealthCheckDto> {
    const result = await this.health.check([() => this.database.check('database')]);
    return { status: result.status, details: result.details };
  }
}
