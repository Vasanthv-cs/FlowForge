import type { FastifyServerOptions } from 'fastify';

/**
 * Structured Pino logger configuration with strict sensitive data redaction.
 * Ensures Authorization headers, cookies, API tokens, and credentials are never logged in cleartext.
 */
export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-supabase-auth"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.accessToken',
  '*.refreshToken',
];

export function getLoggerConfig(isTest = process.env.NODE_ENV === 'test'): FastifyServerOptions['logger'] {
  if (isTest) {
    return false;
  }

  return {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: SENSITIVE_LOG_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          path: req.routeOptions?.url || req.url,
          parameters: req.params,
          headers: {
            host: req.headers.host,
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            // Authorization is redacted by Pino redact paths
            authorization: req.headers.authorization ? '[REDACTED]' : undefined,
          },
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  };
}
