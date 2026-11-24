import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { workspaceService } from '../services/workspaceService.ts';
import { durableWorker } from '../services/durableWorkerService.ts';
import { workflowSchedulerService } from '../services/workflowSchedulerService.ts';

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * Helper generating the liveness probe payload.
   */
  const handleLiveness = async (_request: FastifyRequest, reply: FastifyReply) => {
    const mem = process.memoryUsage();
    return reply.status(200).send({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'flowforge-backend-api',
      version: '0.1.0',
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
    });
  };

  /**
   * Helper generating the readiness probe payload.
   */
  const handleReadiness = async (_request: FastifyRequest, reply: FastifyReply) => {
    const dbStatus = await workspaceService.checkDatabaseReadiness();
    const workerStatus = durableWorker.getStatus();
    const schedulerStatus = workflowSchedulerService.getStatus();

    if (!dbStatus.isReady) {
      // Never reveal internal database credentials, connection strings, or hostnames in production
      const errorDetail =
        process.env.NODE_ENV === 'production'
          ? 'Database connection probe failed'
          : dbStatus.error;

      return reply.status(503).send({
        status: 'unready',
        database: 'disconnected',
        error: errorDetail,
        latencyMs: dbStatus.latencyMs,
        worker: {
          status: workerStatus.isRunning ? 'available' : 'stopped',
          workerId: workerStatus.workerId,
          activeJobs: workerStatus.activeJobs,
          maxConcurrency: workerStatus.maxConcurrency,
        },
        queue: {
          status: 'degraded',
          queuedCount: 0,
          runningCount: 0,
        },
        scheduler: {
          status: schedulerStatus.isRunning ? 'running' : 'stopped',
          isPolling: schedulerStatus.isPolling,
          pollIntervalMs: schedulerStatus.pollIntervalMs,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const queueMetrics = await workspaceService.getQueueMetrics();

    return reply.status(200).send({
      status: 'ready',
      database: 'connected',
      latencyMs: dbStatus.latencyMs,
      worker: {
        status: workerStatus.isRunning ? 'available' : 'idle',
        workerId: workerStatus.workerId,
        activeJobs: workerStatus.activeJobs,
        maxConcurrency: workerStatus.maxConcurrency,
      },
      queue: {
        status: 'operational',
        queuedCount: queueMetrics.queued,
        runningCount: queueMetrics.running,
      },
      scheduler: {
        status: schedulerStatus.isRunning ? 'running' : 'stopped',
        isPolling: schedulerStatus.isPolling,
        pollIntervalMs: schedulerStatus.pollIntervalMs,
      },
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * GET /health & GET /health/live - Process liveness probes
   */
  app.get('/health', handleLiveness);
  app.get('/health/live', handleLiveness);

  /**
   * GET /ready & GET /health/ready - Dependency readiness probes
   */
  app.get('/ready', handleReadiness);
  app.get('/health/ready', handleReadiness);
};
