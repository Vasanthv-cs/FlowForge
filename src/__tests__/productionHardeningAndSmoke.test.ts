import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../server/app.ts';
import { loadConfig, resetConfigCache, parseCorsOrigins } from '../server/config.ts';
import { executionEngineService } from '../server/services/executionEngineService.ts';
import { workspaceService } from '../server/services/workspaceService.ts';
import * as supabaseModule from '../server/supabase.ts';
import type { FastifyInstance } from 'fastify';

describe('Batch 7: Production Hardening, Security Safeguards & Reliability', () => {
  describe('1. Production Configuration Validation', () => {
    beforeEach(() => {
      resetConfigCache();
    });

    it('parses comma-separated CORS origins into an array of trimmed domains', () => {
      const origins = parseCorsOrigins('https://flowforge.app, https://admin.flowforge.app ,https://staging.flowforge.app');
      expect(Array.isArray(origins)).toBe(true);
      expect(origins).toEqual([
        'https://flowforge.app',
        'https://admin.flowforge.app',
        'https://staging.flowforge.app',
      ]);
    });

    it('returns a single string for single origin without commas', () => {
      const origin = parseCorsOrigins('https://flowforge.app');
      expect(origin).toBe('https://flowforge.app');
    });

    it('fails fast when SUPABASE_SERVICE_ROLE_KEY is missing in production mode', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://rnkaowxaaxdzumliicku.supabase.co',
          SUPABASE_ANON_KEY: 'valid-anon-key',
          SUPABASE_SERVICE_ROLE_KEY: '', // Missing
          CORS_ORIGIN: 'https://flowforge.app',
        });
      }).toThrow(/SUPABASE_SERVICE_ROLE_KEY is required in production/);
    });

    it('fails fast when CORS_ORIGIN is default localhost in production mode', () => {
      expect(() => {
        loadConfig({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://rnkaowxaaxdzumliicku.supabase.co',
          SUPABASE_ANON_KEY: 'valid-anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'valid-service-role-key',
          CORS_ORIGIN: 'http://localhost:5173', // Insecure localhost default
        });
      }).toThrow(/CORS_ORIGIN must be explicitly configured with production origins/);
    });

    it('succeeds when all required production configurations are present and valid', () => {
      const config = loadConfig({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://rnkaowxaaxdzumliicku.supabase.co',
        SUPABASE_ANON_KEY: 'valid-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'valid-service-role-key',
        CORS_ORIGIN: 'https://flowforge.app',
      });

      expect(config.NODE_ENV).toBe('production');
      expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe('valid-service-role-key');
      expect(config.CORS_ORIGIN).toBe('https://flowforge.app');
    });
  });

  describe('2. Security Headers & HTTPS Enforcement', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      vi.restoreAllMocks();
      resetConfigCache();

      app = await buildApp({
        configOverride: {
          NODE_ENV: 'production',
          ENFORCE_HTTPS: true,
          CORS_ORIGIN: 'https://flowforge.app',
          SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
          SUPABASE_ANON_KEY: 'mock-anon',
        },
      });
    });

    it('sets protective security headers on all HTTP responses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-forwarded-proto': 'https',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    });

    it('enforces HTTPS and blocks plain HTTP requests in production', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'x-forwarded-proto': 'http', // Insecure proxy header
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('HTTPS is required in production');
    });
  });

  describe('3. Production Error Sanitization & Health Endpoints', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      vi.restoreAllMocks();
      resetConfigCache();

      app = await buildApp({
        configOverride: {
          NODE_ENV: 'production',
          CORS_ORIGIN: 'https://flowforge.app',
          SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
          SUPABASE_ANON_KEY: 'mock-anon',
        },
      });
    });

    it('sanitizes internal 500 error messages and names in production', async () => {
      // Simulate an unhandled route error
      app.get('/test-error', async () => {
        throw new Error('Database password failed: host postgres-internal:5432');
      });

      const res = await app.inject({
        method: 'GET',
        url: '/test-error',
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('InternalServerError');
      expect(body.message).toBe('Internal Server Error');
      // Verify sensitive details are not leaked
      expect(res.body).not.toContain('Database password');
      expect(res.body).not.toContain('postgres-internal');
    });

    it('masks database errors in /ready endpoint in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        vi.spyOn(workspaceService, 'checkDatabaseReadiness').mockResolvedValueOnce({
          isReady: false,
          latencyMs: 45,
          error: 'Connection terminated unexpectedly: user postgres@db.internal',
        });

        const res = await app.inject({
          method: 'GET',
          url: '/ready',
        });

        expect(res.statusCode).toBe(503);
        const body = JSON.parse(res.body);
        expect(body.status).toBe('unready');
        expect(body.error).toBe('Database connection probe failed');
        expect(res.body).not.toContain('db.internal');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('4. Execution Reliability: Stale Run Reconciliation on Startup', () => {
    it('identifies stale running and queued executions and marks them as failed with interrupted reason', async () => {
      const staleRecords = [
        { id: 'exec-stale-1', workflow_id: 'wf-1' },
        { id: 'exec-stale-2', workflow_id: 'wf-2' },
      ];

      const updateMock = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      });
      const insertEventsMock = vi.fn().mockResolvedValue({ error: null });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'executions') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: staleRecords,
                  error: null,
                }),
              }),
              update: updateMock,
            };
          }
          if (table === 'execution_events') {
            return {
              insert: insertEventsMock,
            };
          }
          return {};
        }),
      };

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue(
        mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>
      );

      const result = await executionEngineService.reconcileStaleExecutions();

      expect(result.reconciledCount).toBe(2);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: expect.stringContaining('Execution interrupted: server process restarted'),
        })
      );
      expect(insertEventsMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: 'execution_interrupted',
          }),
        ])
      );
    });

    it('aborts all tracked in-memory executions on server shutdown', () => {
      const mockAbort = vi.fn();
      // Inject fake active execution
      const activeExecutions = (executionEngineService as unknown as {
        activeExecutions: Map<string, { abortController: { abort: typeof mockAbort } }>;
      }).activeExecutions;

      activeExecutions.set('active-1', {
        abortController: { abort: mockAbort },
      });

      executionEngineService.abortAllActive('Server shutting down test');

      expect(mockAbort).toHaveBeenCalledTimes(1);
      expect(activeExecutions.size).toBe(0);
    });
  });
});
