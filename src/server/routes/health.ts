import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { workspaceService } from '../services/workspaceService.ts';

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * GET /health - Liveness probe
   * Returns 200 OK if process is running.
   */
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'flowforge-backend-api',
      version: '0.1.0',
    });
  });

  /**
   * GET /ready - Readiness probe
   * Returns 200 OK if external dependencies (database) are reachable, 503 if degraded.
   */
  app.get('/ready', async (_request, reply) => {
    const dbStatus = await workspaceService.checkDatabaseReadiness();

    if (!dbStatus.isReady) {
      return reply.status(503).send({
        status: 'unready',
        database: 'disconnected',
        error: dbStatus.error,
        latencyMs: dbStatus.latencyMs,
        timestamp: new Date().toISOString(),
      });
    }

    return reply.status(200).send({
      status: 'ready',
      database: 'connected',
      latencyMs: dbStatus.latencyMs,
      timestamp: new Date().toISOString(),
    });
  });
};
