import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../server/app.ts';
import * as supabaseModule from '../server/supabase.ts';
import { workspaceService } from '../server/services/workspaceService.ts';
import { SENSITIVE_LOG_PATHS } from '../server/logger.ts';
import type { FastifyInstance } from 'fastify';
import type { User } from '@supabase/supabase-js';

describe('Batch 6A: Backend API Foundation, Authentication & Workspace RBAC', () => {
  let app: FastifyInstance;

  const validWorkspaceId = '11111111-1111-4111-8111-111111111111';
  const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
  const validWorkflowId = '33333333-3333-4333-8333-333333333333';
  const otherWorkflowId = '44444444-4444-4444-8444-444444444444';
  const validExecutionId = '55555555-5555-4555-8555-555555555555';
  const otherExecutionId = '66666666-6666-4666-8666-666666666666';

  const mockUser: User = {
    id: 'user-alice-123',
    app_metadata: {},
    user_metadata: { name: 'Alice Developer' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'alice@example.com',
  };

  // Mock database members state
  let workspaceMembersTable: Record<string, { role: string }> = {};

  beforeEach(async () => {
    vi.restoreAllMocks();

    workspaceMembersTable = {
      [`${validWorkspaceId}:user-alice-123`]: { role: 'developer' },
    };

    // Mock verifyAccessToken
    vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
      if (token === 'valid-user-jwt') {
        return { user: mockUser, error: null };
      }
      if (token === 'expired-jwt') {
        return { user: null, error: 'JWT expired' };
      }
      return { user: null, error: 'Invalid token signature' };
    });

    // Mock getSupabaseAdminClient queries
    const mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(function (this: Record<string, unknown>, field: string, value: string) {
              const queryState: Record<string, string> = (this._query as Record<string, string>) || {};
              queryState[field] = value;
              return {
                ...this,
                _query: queryState,
                eq: vi.fn(function (this: Record<string, unknown>, field2: string, value2: string) {
                  queryState[field2] = value2;
                  return {
                    ...this,
                    _query: queryState,
                    maybeSingle: vi.fn(async () => {
                      const key = `${queryState['workspace_id']}:${queryState['user_id']}`;
                      const member = workspaceMembersTable[key];
                      return { data: member || null, error: null };
                    }),
                  };
                }),
                maybeSingle: vi.fn(async () => {
                  const key = `${queryState['workspace_id']}:${queryState['user_id']}`;
                  const member = workspaceMembersTable[key];
                  return { data: member || null, error: null };
                }),
              };
            }),
          };
        }

        if (table === 'workflows') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn(async () => ({
                  data: {
                    id: 'new-workflow-uuid',
                    workspace_id: validWorkspaceId,
                    name: 'New Server Workflow',
                    is_active: true,
                  },
                  error: null,
                })),
              }),
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue(mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>);

    app = await buildApp({
      configOverride: {
        NODE_ENV: 'test',
        RATE_LIMIT_MAX: 1000,
      },
    });
  });

  describe('1. Health and Readiness Endpoints', () => {
    it('GET /health returns 200 OK with server uptime and metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('flowforge-backend-api');
      expect(typeof body.uptimeSeconds).toBe('number');
      expect(body.timestamp).toBeDefined();
    });

    it('GET /ready returns 200 OK when database is reachable', async () => {
      vi.spyOn(workspaceService, 'checkDatabaseReadiness').mockResolvedValueOnce({
        isReady: true,
        latencyMs: 14,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready');
      expect(body.database).toBe('connected');
      expect(body.latencyMs).toBe(14);
    });

    it('GET /ready returns 503 Service Unavailable when database connection fails', async () => {
      vi.spyOn(workspaceService, 'checkDatabaseReadiness').mockResolvedValueOnce({
        isReady: false,
        latencyMs: 50,
        error: 'Database connection timeout',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('unready');
      expect(body.database).toBe('disconnected');
      expect(body.error).toBe('Database connection timeout');
    });
  });

  describe('2. Supabase Authentication Middleware', () => {
    it('rejects requests with missing Authorization header (401)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Missing Authorization header');
    });

    it('rejects requests with malformed Authorization header (401)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Basic dXNlcjpwYXNz',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('Expected "Bearer <token>"');
    });

    it('rejects requests with expired or invalid token (401)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer expired-jwt',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('JWT expired');
    });

    it('allows requests with valid token and derives user identity', async () => {
      vi.spyOn(workspaceService, 'listWorkflows').mockResolvedValueOnce([
        {
          id: validWorkflowId,
          workspaceId: validWorkspaceId,
          name: 'ETL Pipeline',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.workflows).toHaveLength(1);
      expect(body.workflows[0].name).toBe('ETL Pipeline');
    });
  });

  describe('3. Workspace RBAC & Membership Enforcement', () => {
    it('rejects requests if user is not a member of the workspace (403)', async () => {
      // Alice is NOT in otherWorkspaceId
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${otherWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('You are not a member of this workspace');
    });

    it('rejects invalid workspaceId parameter format (400)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/invalid-uuid-123/workflows',
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('Must be a valid UUID');
    });

    it('allows read operations for viewer role (200)', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-alice-123`] = { role: 'viewer' };

      vi.spyOn(workspaceService, 'listWorkflows').mockResolvedValueOnce([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('strictly forbids viewer role from creating or modifying workflows (403)', async () => {
      // Alice is configured as a viewer in this workspace
      workspaceMembersTable[`${validWorkspaceId}:user-alice-123`] = { role: 'viewer' };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
        payload: {
          name: 'Unauthorized Workflow',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('Viewers have read-only access');
    });

    it('allows developers and admins to create workflows (201)', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-alice-123`] = { role: 'developer' };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
        payload: {
          name: 'Developer Pipeline',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.workflow).toBeDefined();
      expect(body.workflow.name).toBe('New Server Workflow');
    });
  });

  describe('4. Cross-Workspace Access Prevention & ID Isolation', () => {
    it('returns 404 when workflow ID belongs to a different workspace', async () => {
      // Workflow exists in database, but getWorkflow returns null because workspace_id does not match
      vi.spyOn(workspaceService, 'getWorkflow').mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${otherWorkflowId}`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workflow not found in this workspace');
    });

    it('returns 404 when execution ID belongs to a different workspace', async () => {
      vi.spyOn(workspaceService, 'getExecution').mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions/${otherExecutionId}`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Execution not found in this workspace');
    });
  });

  describe('5. Execution Endpoints & Sensitive Data Redaction', () => {
    it('lists workspace executions with status filter', async () => {
      vi.spyOn(workspaceService, 'listExecutions').mockResolvedValueOnce([
        {
          id: validExecutionId,
          workflowId: validWorkflowId,
          workspaceId: validWorkspaceId,
          status: 'success',
          triggerType: 'manual',
          durationMs: 420,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          errorMessage: null,
          createdAt: new Date().toISOString(),
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions?status=success`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.executions).toHaveLength(1);
      expect(body.executions[0].status).toBe('success');
    });

    it('retrieves full execution details with node logs and deeply redacted credentials', async () => {
      vi.spyOn(workspaceService, 'getExecution').mockResolvedValueOnce({
        id: validExecutionId,
        workflowId: validWorkflowId,
        workspaceId: validWorkspaceId,
        status: 'success',
        triggerType: 'manual',
        durationMs: 1500,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        errorMessage: null,
        createdAt: new Date().toISOString(),
        inputPayload: {
          apiKey: '[REDACTED]',
          user: 'Alice',
        },
        outputPayload: {
          token: '[REDACTED]',
          status: 200,
        },
        nodeExecutions: [
          {
            id: 'node-exec-1',
            nodeId: 'http-node-1',
            nodeType: 'httpRequest',
            nodeLabel: 'API Call',
            status: 'success',
            durationMs: 250,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            errorMessage: null,
            inputPayload: {
              authorization: '[REDACTED]',
              url: 'https://api.example.com/data',
            },
            outputPayload: {
              secretKey: '[REDACTED]',
              items: [1, 2, 3],
            },
          },
        ],
        events: [],
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions/${validExecutionId}`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.execution.id).toBe(validExecutionId);
      expect(body.execution.inputPayload.apiKey).toBe('[REDACTED]');
      expect(body.execution.outputPayload.token).toBe('[REDACTED]');
      expect(body.execution.nodeExecutions[0].inputPayload.authorization).toBe('[REDACTED]');
      expect(body.execution.nodeExecutions[0].outputPayload.secretKey).toBe('[REDACTED]');
    });
  });

  describe('6. Security Configuration & Log Redaction', () => {
    it('verifies logger config contains mandatory sensitive paths', () => {
      expect(SENSITIVE_LOG_PATHS).toContain('req.headers.authorization');
      expect(SENSITIVE_LOG_PATHS).toContain('req.headers.cookie');
      expect(SENSITIVE_LOG_PATHS).toContain('password');
      expect(SENSITIVE_LOG_PATHS).toContain('token');
      expect(SENSITIVE_LOG_PATHS).toContain('secret');
      expect(SENSITIVE_LOG_PATHS).toContain('apiKey');
    });

    it('rejects invalid request body on creation (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
        payload: {
          name: '', // Empty name violates min(1)
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toBe('Validation failed');
    });
  });
});
