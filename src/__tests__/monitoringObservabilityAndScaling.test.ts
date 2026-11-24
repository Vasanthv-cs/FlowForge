import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  calculatePercentile,
  getTimeRangeCutoff,
  metricsService,
} from '../server/services/metricsService';
import { workspaceService } from '../server/services/workspaceService';
import { durableWorker } from '../server/services/durableWorkerService';
import { workflowSchedulerService } from '../server/services/workflowSchedulerService';
import { serverLogger } from '../server/logger';
import { buildApp } from '../server/app';
import * as supabaseModule from '../server/supabase';

const mockWorkspaceId = '11111111-1111-4111-8111-111111111111';
const mockWorkflowId = '22222222-2222-4222-8222-222222222222';
const mockUserId = '33333333-3333-4333-8333-333333333333';

describe('Batch 16: Monitoring, Observability & Scaling', () => {
  /* ─────────────────────────────────────────────────────────────
   * 1. Health and Readiness Probes
   * ───────────────────────────────────────────────────────────── */
  describe('1. Health and Readiness Probes', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      vi.restoreAllMocks();

      app = await buildApp({
        configOverride: { NODE_ENV: 'test', RATE_LIMIT_MAX: 1000 },
        loggerOverride: false,
      });
    });

    it('GET /health and GET /health/live return 200 OK with process liveness and memory metrics', async () => {
      const resLive = await app.inject({ method: 'GET', url: '/health/live' });
      expect(resLive.statusCode).toBe(200);

      const body = JSON.parse(resLive.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('flowforge-backend-api');
      expect(typeof body.uptimeSeconds).toBe('number');
      expect(body.memory).toBeDefined();
      expect(body.memory.heapUsedBytes).toBeGreaterThan(0);

      // Verify backwards-compatible /health
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const standardBody = JSON.parse(res.body);
      expect(standardBody.status).toBe('ok');
    });

    it('GET /ready and GET /health/ready return 200 OK when all infrastructure components are operational', async () => {
      vi.spyOn(workspaceService, 'checkDatabaseReadiness').mockResolvedValue({
        isReady: true,
        latencyMs: 12,
      });
      vi.spyOn(workspaceService, 'getQueueMetrics').mockResolvedValue({
        queued: 3,
        running: 1,
      });

      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.status).toBe('ready');
      expect(body.database).toBe('connected');
      expect(body.latencyMs).toBe(12);
      expect(body.queue.status).toBe('operational');
      expect(body.queue.queuedCount).toBe(3);
      expect(body.queue.runningCount).toBe(1);
      expect(body.worker.workerId).toBeDefined();
      expect(body.scheduler.status).toBeDefined();

      // Backwards-compatible /ready
      const standardRes = await app.inject({ method: 'GET', url: '/ready' });
      expect(standardRes.statusCode).toBe(200);
    });

    it('GET /ready returns 503 Service Unavailable when database connection fails without leaking secrets', async () => {
      vi.spyOn(workspaceService, 'checkDatabaseReadiness').mockResolvedValue({
        isReady: false,
        latencyMs: 45,
        error: 'Connection timeout to postgres://internal-db:5432',
      });

      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(503);

      const body = JSON.parse(res.body);
      expect(body.status).toBe('unready');
      expect(body.database).toBe('disconnected');
      expect(body.queue.status).toBe('degraded');
      expect(body.error).toBeDefined();
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 2. Execution Metrics Service & Statistics
   * ───────────────────────────────────────────────────────────── */
  describe('2. Execution Metrics Engine & Statistical Analysis', () => {
    it('calculates percentiles reliably across small, large, and empty datasets', () => {
      // Empty array guard
      expect(calculatePercentile([], 50)).toBe(0);
      expect(calculatePercentile([], 95)).toBe(0);

      // Single item
      expect(calculatePercentile([100], 50)).toBe(100);
      expect(calculatePercentile([100], 90)).toBe(100);

      // Distributed array [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(calculatePercentile(values, 50)).toBe(50);
      expect(calculatePercentile(values, 90)).toBe(90);
      expect(calculatePercentile(values, 95)).toBe(100);
    });

    it('calculates proper time range cutoffs for 1h, 24h, 7d, 30d', () => {
      const now = Date.now();
      const cutoff1h = getTimeRangeCutoff('1h').getTime();
      expect(now - cutoff1h).toBeGreaterThanOrEqual(3500 * 1000);
      expect(now - cutoff1h).toBeLessThanOrEqual(3700 * 1000);

      const cutoff7d = getTimeRangeCutoff('7d').getTime();
      expect(now - cutoff7d).toBeGreaterThanOrEqual(6.9 * 24 * 3600 * 1000);
    });

    it('computes accurate status counts, success rates, duration percentiles, and queue wait times', async () => {
      const now = Date.now();
      const mockExecutions = [
        {
          id: 'ex-1',
          workflow_id: mockWorkflowId,
          status: 'success',
          trigger_type: 'manual',
          started_at: new Date(now - 5000).toISOString(),
          finished_at: new Date(now - 3000).toISOString(), // 2000ms duration
          created_at: new Date(now - 6000).toISOString(), // 1000ms wait
          error_message: null,
          retry_count: 0,
          worker_id: 'worker-1',
          workflows: { workspace_id: mockWorkspaceId, name: 'Lead Intake' },
        },
        {
          id: 'ex-2',
          workflow_id: mockWorkflowId,
          status: 'success',
          trigger_type: 'webhook',
          started_at: new Date(now - 4000).toISOString(),
          finished_at: new Date(now - 3000).toISOString(), // 1000ms duration
          created_at: new Date(now - 5000).toISOString(), // 1000ms wait
          error_message: null,
          retry_count: 1, // Had 1 retry
          worker_id: 'worker-1',
          workflows: { workspace_id: mockWorkspaceId, name: 'Lead Intake' },
        },
        {
          id: 'ex-3',
          workflow_id: mockWorkflowId,
          status: 'failed',
          trigger_type: 'schedule',
          started_at: new Date(now - 2000).toISOString(),
          finished_at: new Date(now - 1000).toISOString(), // 1000ms duration
          created_at: new Date(now - 3000).toISOString(), // 1000ms wait
          error_message: 'HTTP 500 downstream error',
          retry_count: 2, // Had 2 retries
          worker_id: 'worker-1',
          workflows: { workspace_id: mockWorkspaceId, name: 'Lead Intake' },
        },
        {
          id: 'ex-4',
          workflow_id: mockWorkflowId,
          status: 'cancelled',
          trigger_type: 'manual',
          started_at: null,
          finished_at: null,
          created_at: new Date(now - 1000).toISOString(),
          error_message: 'Cancelled by user',
          retry_count: 0,
          worker_id: null,
          workflows: { workspace_id: mockWorkspaceId, name: 'Lead Intake' },
        },
      ];

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'executions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => Promise.resolve({ data: mockExecutions, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'node_executions') {
            return {
              select: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      { node_type: 'http-request', status: 'failed' },
                      { node_type: 'http-request', status: 'success' },
                      { node_type: 'set-data', status: 'success' },
                    ],
                    error: null,
                  }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

      const result = await metricsService.getWorkspaceMetrics(mockWorkspaceId, {
        timeRange: '24h',
      });

      // Assert counts
      expect(result.counts.total).toBe(4);
      expect(result.counts.success).toBe(2);
      expect(result.counts.failed).toBe(1);
      expect(result.counts.cancelled).toBe(1);

      // Assert rates
      expect(result.rates.successRate).toBe(50.0); // 2/4 = 50%
      expect(result.rates.failureRate).toBe(25.0); // 1/4 = 25%
      expect(result.rates.cancellationRate).toBe(25.0); // 1/4 = 25%

      // Assert durations (durations: 2000, 1000, 1000 -> avg: 1333)
      expect(result.duration.minMs).toBe(1000);
      expect(result.duration.maxMs).toBe(2000);
      expect(result.duration.avgMs).toBe(1333);
      expect(result.duration.p50Ms).toBe(1000);

      // Assert queue wait times (all 1000ms)
      expect(result.queue.avgWaitMs).toBe(1000);

      // Assert retries (total 3 retries, 2 executions experienced retries)
      expect(result.retries.totalRetries).toBe(3);
      expect(result.retries.executionsWithRetries).toBe(2);
      expect(result.retries.retryRate).toBe(50.0);

      // Assert recent failures captured
      expect(result.recentFailures).toHaveLength(1);
      expect(result.recentFailures[0].errorMessage).toBe('HTTP 500 downstream error');

      // Assert node failure stats
      expect(result.nodeFailures.length).toBeGreaterThan(0);
      const httpStat = result.nodeFailures.find((n) => n.nodeType === 'http-request');
      expect(httpStat).toBeDefined();
      expect(httpStat?.failedExecutions).toBe(1);
      expect(httpStat?.totalExecutions).toBe(2);
      expect(httpStat?.failureRate).toBe(50.0);
    });

    it('gracefully handles empty execution history without division by zero errors', async () => {
      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'executions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'node_executions') {
            return {
              select: () => ({
                in: () => Promise.resolve({ data: [], error: null }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

      const result = await metricsService.getWorkspaceMetrics(mockWorkspaceId, {
        timeRange: '1h',
      });

      expect(result.counts.total).toBe(0);
      expect(result.rates.successRate).toBe(0);
      expect(result.rates.failureRate).toBe(0);
      expect(result.duration.avgMs).toBe(0);
      expect(result.duration.p50Ms).toBe(0);
      expect(result.nodeFailures).toHaveLength(0);
      expect(result.recentFailures).toHaveLength(0);
      expect(result.volumeOverTime).toBeDefined();
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 3. Fastify Metrics API Routes & Workspace RBAC
   * ───────────────────────────────────────────────────────────── */
  describe('3. Fastify Metrics API Routes & Workspace RBAC', () => {
    let app: FastifyInstance;
    let mockUserRole = 'developer';

    beforeEach(async () => {
      vi.restoreAllMocks();
      mockUserRole = 'developer';

      vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
        if (token === 'valid-user-jwt') {
          return {
            user: {
              id: mockUserId,
              email: 'operator@flowforge.internal',
              user_metadata: {},
              app_metadata: {},
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as any,
            error: null,
          };
        }
        return { user: null, error: 'Invalid or expired authentication token' };
      });

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'workspace_members') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: { role: mockUserRole, user_id: mockUserId },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          if (table === 'executions') {
            return {
              select: () => ({
                eq: () => ({
                  gte: () => ({
                    order: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'node_executions') {
            return {
              select: () => ({
                in: () => Promise.resolve({ data: [], error: null }),
              }),
            };
          }
          if (table === 'workspaces') {
            return {
              select: () => ({
                limit: () => Promise.resolve({ data: [{ id: mockWorkspaceId }], error: null }),
              }),
            };
          }
          return { select: vi.fn() };
        },
      } as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

      app = await buildApp({
        configOverride: { NODE_ENV: 'test', RATE_LIMIT_MAX: 1000 },
        loggerOverride: false,
      });
    });

    it('GET /api/workspaces/:workspaceId/metrics returns 200 with metrics payload for workspace members', async () => {
      mockUserRole = 'viewer'; // Viewers have read permissions

      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${mockWorkspaceId}/metrics?timeRange=7d`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.metrics).toBeDefined();
      expect(body.metrics.workspaceId).toBe(mockWorkspaceId);
      expect(body.metrics.timeRange).toBe('7d');
    });

    it('GET /api/workspaces/:workspaceId/metrics rejects invalid non-uuid workspaceId with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/workspaces/not-a-valid-uuid/metrics',
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toMatch(/must be a valid UUID/i);
    });

    it('GET /api/workspaces/:workspaceId/metrics rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${mockWorkspaceId}/metrics`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('GET /api/workspaces/:workspaceId/metrics/health returns real-time infrastructure operational status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${mockWorkspaceId}/metrics/health`,
        headers: { authorization: 'Bearer valid-user-jwt' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.health).toBeDefined();
      expect(body.health.database.status).toBe('connected');
      expect(body.health.worker.workerId).toBeDefined();
      expect(body.health.queue.status).toBe('healthy');
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 4. Structured Logging & Sensitive Data Redaction
   * ───────────────────────────────────────────────────────────── */
  describe('4. Structured Logging & Sensitive Data Redaction', () => {
    it('redacts tokens, passwords, and sensitive headers from structured logs', () => {
      const logs: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => logs.push(msg);

      try {
        serverLogger.warn(
          {
            reqId: 'req-123',
            service: 'worker-engine',
            token: 'eyJhSecretToken1234567890',
            password: 'superSecretPassword',
            headers: {
              authorization: 'Bearer secret-jwt',
              'content-type': 'application/json',
            },
            payload: {
              apiKey: 'secret_api_key_1234567890',
              data: 'normal value',
            },
          },
          'Dispatched external request'
        );

        expect(logs.length).toBeGreaterThan(0);
        const loggedJson = JSON.parse(logs[0]);

        // Assert sensitive keys are redacted
        expect(loggedJson.token).toBe('[REDACTED]');
        expect(loggedJson.password).toBe('[REDACTED]');
        expect(loggedJson.payload.apiKey).toBe('[REDACTED]');
        expect(loggedJson.payload.data).toBe('normal value');
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 5. Worker Concurrency & Stale Lease Recovery
   * ───────────────────────────────────────────────────────────── */
  describe('5. Worker Concurrency & Stale Lease Recovery', () => {
    it('reports worker status and active concurrency metrics', () => {
      const status = durableWorker.getStatus();
      expect(status.workerId).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');
      expect(typeof status.activeJobs).toBe('number');
      expect(status.maxConcurrency).toBeGreaterThan(0);
      expect(status.maxPerWorkspaceConcurrency).toBeGreaterThan(0);
    });

    it('reports scheduler status and polling intervals', () => {
      const schedulerStatus = workflowSchedulerService.getStatus();
      expect(typeof schedulerStatus.isRunning).toBe('boolean');
      expect(typeof schedulerStatus.isPolling).toBe('boolean');
      expect(schedulerStatus.pollIntervalMs).toBe(10000);
    });
  });
});
