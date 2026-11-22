import fastify, { type FastifyInstance, type FastifyServerOptions, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, type ServerConfig } from './config.ts';
import { getLoggerConfig } from './logger.ts';
import { healthRoutes } from './routes/health.ts';
import { workspaceRoutes } from './routes/workspaces.ts';

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

  // 1. CORS Configuration
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 2. Rate Limiting
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'], // Allow loopback for internal health probes
  });

  // 3. Register Application Routes
  await app.register(healthRoutes);
  await app.register(workspaceRoutes);

  // 4. Custom Error Handler
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;

    // Redact internal error message details in production
    const message =
      statusCode >= 500 && config.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : error.message;

    return reply.status(statusCode).send({
      statusCode,
      error: error.name || 'InternalServerError',
      message,
    });
  });

  // 5. Custom 404 Handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return app;
}
