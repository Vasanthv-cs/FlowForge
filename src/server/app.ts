import fastify, { type FastifyInstance, type FastifyServerOptions, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, parseCorsOrigins, type ServerConfig } from './config.ts';
import { getLoggerConfig } from './logger.ts';
import { healthRoutes } from './routes/health.ts';
import { workspaceRoutes } from './routes/workspaces.ts';
import { webhookRoutes } from './routes/webhooks.ts';
import { scheduleRoutes } from './routes/schedules.ts';
import { credentialRoutes } from './routes/credentials.ts';
import { templateRoutes } from './routes/templates.ts';
import { metricsRoutes } from './routes/metrics.ts';

export interface BuildAppOptions {
  configOverride?: Partial<ServerConfig>;
  loggerOverride?: FastifyServerOptions['logger'];
}

/**
 * Builds and configures the Fastify server instance.
 * Modular factory allowing in-memory injection testing and standalone production serving.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...options.configOverride };

  const app = fastify({
    logger: options.loggerOverride !== undefined ? options.loggerOverride : getLoggerConfig(config.NODE_ENV === 'test'),
    bodyLimit: config.BODY_LIMIT,
  });

  // 1. Security Headers Hook
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-XSS-Protection', '0');

    if (config.NODE_ENV === 'production' || config.ENFORCE_HTTPS) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

  // 2. HTTPS Enforcement (in production or when explicitly configured)
  if (config.NODE_ENV === 'production' || config.ENFORCE_HTTPS) {
    app.addHook('onRequest', async (request, reply) => {
      const proto = request.headers['x-forwarded-proto'];
      if (proto && proto !== 'https') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'HTTPS is required in production.',
        });
      }
    });
  }

  // 3. CORS Configuration
  const allowedOrigins = parseCorsOrigins(config.CORS_ORIGIN);
  await app.register(cors, {
    origin: Array.isArray(allowedOrigins) ? allowedOrigins : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 4. Rate Limiting
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'], // Allow loopback for internal health probes
  });

  // 5. Register Application Routes
  await app.register(healthRoutes);
  await app.register(workspaceRoutes);
  await app.register(webhookRoutes);
  await app.register(scheduleRoutes);
  await app.register(credentialRoutes);
  await app.register(templateRoutes);
  await app.register(metricsRoutes);

  // 6. Custom Error Handler with Sensitive Data Masking
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const isProd = config.NODE_ENV === 'production';

    // Mask internal error details and database errors in production
    const message =
      statusCode >= 500 && isProd
        ? 'Internal Server Error'
        : error.message;

    const errorName =
      statusCode >= 500 && isProd
        ? 'InternalServerError'
        : error.name || 'InternalServerError';

    return reply.status(statusCode).send({
      statusCode,
      error: errorName,
      message,
    });
  });

  // 7. Custom 404 Handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return app;
}
