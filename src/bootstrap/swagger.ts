import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '../config/app-config.service.js';
import { swaggerBasicAuth } from './swagger-basic-auth.js';

export const DOCS_PATH = 'docs';
export const DOCS_JSON_PATH = 'docs-json';
export const BEARER_AUTH_NAME = 'access-token';

export function buildOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = app.get(AppConfigService);
  const builder = new DocumentBuilder()
    .setTitle('SewaPro API')
    .setDescription(
      'Local home-service marketplace for Nepal. All responses use the envelope ' +
        '`{ success, data, meta? }`; errors use `{ success: false, error: { code, message, details?, requestId } }`.',
    )
    .setVersion('1.0')
    .addServer(`http://localhost:${config.port}`, 'Local development')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token' },
      BEARER_AUTH_NAME,
    )
    .addTag('Health', 'Liveness and readiness probes')
    .build();
  return SwaggerModule.createDocument(app, builder);
}

/** Mounts Swagger UI at /docs and the raw spec at /docs-json, if enabled for this environment. */
export function setupSwagger(app: NestExpressApplication): void {
  const { enabled, credentials } = app.get(AppConfigService).swagger;
  if (!enabled) return;

  if (credentials) {
    const guard = swaggerBasicAuth(credentials.user, credentials.password);
    app.use([`/${DOCS_PATH}`, `/${DOCS_JSON_PATH}`], guard);
  }

  SwaggerModule.setup(DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: DOCS_JSON_PATH,
    useGlobalPrefix: false,
    swaggerOptions: { persistAuthorization: true },
  });
}
