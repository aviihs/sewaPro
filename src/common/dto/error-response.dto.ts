import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({
    description: 'Stable machine-readable error code',
    example: 'VALIDATION_FAILED',
  })
  readonly code: string;

  @ApiProperty({ description: 'Human-readable message', example: 'Request validation failed' })
  readonly message: string;

  @ApiPropertyOptional({
    description: 'Extra context; for VALIDATION_FAILED a list of field violations',
    example: [{ field: 'phone', messages: ['phone must be a valid Nepal mobile number'] }],
  })
  readonly details?: unknown;

  @ApiProperty({
    description: 'Request correlation id (also sent as the X-Request-Id header)',
    example: '6f1c2d4e-8a0b-4c4e-9a43-0c6f0e7c1b2a',
  })
  readonly requestId: string;
}

export class ErrorResponseDto {
  @ApiProperty({ description: 'Always false for errors', example: false })
  readonly success: false;

  @ApiProperty({ type: ErrorBodyDto })
  readonly error: ErrorBodyDto;
}
