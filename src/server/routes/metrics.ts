import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES } from '../middleware/rbac.ts';
import { metricsService, type MetricsTimeRange } from '../services/metricsService.ts';
import { workspaceService } from '../services/workspaceService.ts';
import { durableWorker } from '../services/durableWorkerService.ts';
import { workflowSchedulerService } from '../services/workflowSchedulerService.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_RANGES = new Set<string>(['1h', '24h', '7d', '30d']);

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/workspaces/:workspaceId/metrics
   * Retrieves aggregated execution metrics, duration percentiles, volume, and node failure rates.
   */
  app.get(
    '/api/workspaces/:workspaceId/metrics',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const query = request.query as { timeRange?: string; workflowId?: string };

      if (!UUID_REGEX.test(workspaceId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workspaceId. Must be a valid UUID.',
        });
      }

      if (query.workflowId && !UUID_REGEX.test(query.workflowId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workflowId filter. Must be a valid UUID.',
        });
      }

      const timeRange: MetricsTimeRange =
        query.timeRange && VALID_RANGES.has(query.timeRange)
          ? (query.timeRange as MetricsTimeRange)
          : '24h';

      try {
        const metrics = await metricsService.getWorkspaceMetrics(workspaceId, {
          timeRange,
          workflowId: query.workflowId,
        });

        return reply.status(200).send({ metrics });
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'InternalServerError',
          message: (err as Error).message || 'Failed to retrieve execution metrics',
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/metrics/health
   * Retrieves operational health summary (DB latency, worker status, queue depths, scheduler status).
   */
  app.get(
    '/api/workspaces/:workspaceId/metrics/health',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      if (!UUID_REGEX.test(workspaceId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workspaceId. Must be a valid UUID.',
        });
      }

      const [dbStatus, queueMetrics] = await Promise.all([
        workspaceService.checkDatabaseReadiness(),
        workspaceService.getQueueMetrics(),
      ]);

      const workerStatus = durableWorker.getStatus();
      const schedulerStatus = workflowSchedulerService.getStatus();

      return reply.status(200).send({
        health: {
          database: {
            status: dbStatus.isReady ? 'connected' : 'disconnected',
            latencyMs: dbStatus.latencyMs,
          },
          worker: {
            status: workerStatus.isRunning ? 'available' : 'stopped',
            workerId: workerStatus.workerId,
            activeJobs: workerStatus.activeJobs,
            maxConcurrency: workerStatus.maxConcurrency,
            maxPerWorkspaceConcurrency: workerStatus.maxPerWorkspaceConcurrency,
          },
          queue: {
            status: queueMetrics.queued > 100 ? 'congested' : 'healthy',
            queuedCount: queueMetrics.queued,
            runningCount: queueMetrics.running,
          },
          scheduler: {
            status: schedulerStatus.isRunning ? 'running' : 'stopped',
            isPolling: schedulerStatus.isPolling,
            pollIntervalMs: schedulerStatus.pollIntervalMs,
          },
          timestamp: new Date().toISOString(),
        },
      });
    }
  );
};
