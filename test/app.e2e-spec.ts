import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { IsString, Length } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaginationQueryDto } from '../src/common/dto/pagination-query.dto.js';
import { PaginatedResult } from '../src/common/utils/pagination.js';
import { createTestApp } from './utils/create-test-app.js';

class EchoDto {
  @IsString()
  @Length(2, 10)
  readonly name: string;
}

/** Test-only routes that exercise the global pipeline end to end. */
@Controller('e2e-probe')
class ProbeController {
  @Get('items')
  list(@Query() query: PaginationQueryDto): PaginatedResult<number> {
    return PaginatedResult.of([1, 2], 42, query);
  }

  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }
}

describe('Platform (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('reports liveness', async () => {
      const res = await http().get('/api/v1/health/live').expect(200);
      expect(res.body).toEqual({ success: true, data: { status: 'ok', details: {} } });
    });

    it('reports readiness including the database', async () => {
      const res = await http().get('/api/v1/health/ready').expect(200);
      expect(res.body.data.details).toEqual({ database: { status: 'up' } });
    });
  });

  describe('request id', () => {
    it('generates one and returns it in the header and error body', async () => {
      const res = await http().get('/api/v1/does-not-exist').expect(404);
      const id = res.headers['x-request-id'];
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Cannot GET /api/v1/does-not-exist', requestId: id },
      });
    });

    it('reuses a safe inbound id and replaces an unsafe one', async () => {
      const safe = await http().get('/api/v1/health/live').set('X-Request-Id', 'client-req-0001');
      expect(safe.headers['x-request-id']).toBe('client-req-0001');

      const unsafe = await http().get('/api/v1/health/live').set('X-Request-Id', '<script>');
      expect(unsafe.headers['x-request-id']).not.toBe('<script>');
    });
  });

  describe('validation', () => {
    it('rejects invalid bodies with field details', async () => {
      const res = await http().post('/api/v1/e2e-probe/echo').send({ name: 'x' }).expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [
          { field: 'name', messages: ['name must be longer than or equal to 2 characters'] },
        ],
      });
    });

    it('rejects unknown properties (mass assignment)', async () => {
      const res = await http()
        .post('/api/v1/e2e-probe/echo')
        .send({ name: 'ram', role: 'ADMIN' })
        .expect(400);
      expect(res.body.error.details).toEqual([
        { field: 'role', messages: ['property role should not exist'] },
      ]);
    });

    it('rejects malformed JSON without leaking internals', async () => {
      const res = await http()
        .post('/api/v1/e2e-probe/echo')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects oversized bodies', async () => {
      const res = await http()
        .post('/api/v1/e2e-probe/echo')
        .send({ name: 'a'.repeat(2 * 1024 * 1024) })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('pagination envelope', () => {
    it('returns data with meta and applies defaults', async () => {
      const res = await http().get('/api/v1/e2e-probe/items').expect(200);
      expect(res.body).toEqual({
        success: true,
        data: [1, 2],
        meta: {
          page: 1,
          limit: 20,
          totalItems: 42,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      });
    });

    it('caps the page size', async () => {
      await http().get('/api/v1/e2e-probe/items?limit=1000').expect(400);
    });
  });

  describe('security headers and CORS', () => {
    it('sets helmet headers and hides the framework', async () => {
      const res = await http().get('/api/v1/health/live');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows listed origins only', async () => {
      const allowed = await http()
        .get('/api/v1/health/live')
        .set('Origin', 'http://localhost:3001');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');

      const denied = await http().get('/api/v1/health/live').set('Origin', 'https://evil.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('docs', () => {
    it('serves the OpenAPI document outside production', async () => {
      const res = await http().get('/docs-json').expect(200);
      expect(res.body.info.title).toBe('SewaPro API');
      expect(res.body.components.securitySchemes).toHaveProperty('access-token');
      expect(res.body.paths).toHaveProperty('/api/v1/health/ready');
    });
  });
});
