import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { BEARER_AUTH_NAME } from '../common/decorators/api-docs.decorator.js';
import { AppConfigService } from '../config/app-config.service.js';
import { swaggerBasicAuth } from './swagger-basic-auth.js';

export const DOCS_PATH = 'docs';
export const DOCS_JSON_PATH = 'docs-json';

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
    .addTag('Auth', 'Registration, login (password or phone OTP), token rotation')
    .addTag('Users', 'Your own profile')
    .addTag('Addresses', 'Saved service addresses (customers)')
    .addTag('Catalog', 'Public service categories and services')
    .addTag('Admin: Catalog', 'Category and service management')
    .addTag('Providers: Me', 'Provider onboarding, offer, documents, schedule, dashboard')
    .addTag('Admin: Providers', 'Provider verification')
    .addTag('Bookings', 'Customer bookings')
    .addTag('Bookings: Provider', 'Jobs assigned to the provider and their lifecycle')
    .addTag('Quotations', 'Provider quotations and customer responses')
    .addTag('Reviews', 'Customer reviews, public listing and moderation')
    .addTag('Notifications', 'In-app notifications (cursor pagination)')
    .addTag('Disputes', 'Disputes on bookings and their resolution')
    .addTag('Admin: Audit', 'Read-only audit log')
    .addTag('Admin: Dashboard & Reports', 'Platform totals, growth and booking reports')
    .addTag('Admin: Users & Bookings', 'User suspension and booking monitoring')
    .addTag('Files', 'File downloads (signed for private files)')
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
    swaggerOptions: {
      persistAuthorization: true,
      // Start with every tag and every schema (DTO) collapsed.
      docExpansion: 'none',
      defaultModelsExpandDepth: 0,
      filter: true,
    },
  });
}
