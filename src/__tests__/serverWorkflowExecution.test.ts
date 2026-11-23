import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../server/app.ts';
import * as supabaseModule from '../server/supabase.ts';
import { executionEngineService } from '../server/services/executionEngineService.ts';
import type { FastifyInstance } from 'fastify';
import type { User } from '@supabase/supabase-js';

describe('Batch 6B: Server-Side Workflow Execution, RBAC & Status API', () => {
  let app: FastifyInstance;

  const validWorkspaceId = '11111111-1111-4111-8111-111111111111';
  const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
  const validWorkflowId = '33333333-3333-4333-8333-333333333333';
  const cyclicWorkflowId = '44444444-4444-4444-8444-444444444444';
  const nonExistentWorkflowId = '99999999-9999-4999-8999-999999999999';
  const validExecutionId = '55555555-5555-4555-8555-555555555555';
  const otherExecutionId = '66666666-6666-4666-8666-666666666666';

  const mockUser: User = {
    id: 'user-bob-456',
    app_metadata: {},
    user_metadata: { name: 'Bob Developer' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'bob@example.com',
  };

  const validWorkflowDefinition = {
    nodes: [
      {
        id: 'node-start',
        type: 'workflowNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Start Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          description: 'Trigger node',
          icon: 'Play',
          color: '#ffffff',
          inputs: [],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          config: { payload: '{}' },
        },
      },
      {
        id: 'node-log',
        type: 'workflowNode',
        position: { x: 300, y: 100 },
        data: {
          label: 'Log Output',
          type: 'console-output',
          category: 'utility',
          description: 'Console log',
          icon: 'Terminal',
          color: '#ffffff',
          inputs: [{ id: 'input', label: 'In', type: 'any' }],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          config: { level: 'info', prefix: '[Server]' },
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-start',
        target: 'node-log',
      },
    ],
  };

  const cyclicWorkflowDefinition = {
    nodes: [
      {
        id: 'node-a',
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Node A',
          type: 'manual-trigger',
          category: 'trigger',
          description: 'A',
          icon: 'Play',
          color: '#ffffff',
          inputs: [],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          config: { payload: '' },
        },
      },
      {
        id: 'node-b',
        type: 'workflowNode',
        position: { x: 100, y: 0 },
        data: {
          label: 'Node B',
          type: 'delay',
          category: 'utility',
          description: 'B',
          icon: 'Clock',
          color: '#ffffff',
          inputs: [{ id: 'input', label: 'In', type: 'any' }],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          config: { delayMs: 10 },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'node-a', target: 'node-b' },
      { id: 'e2', source: 'node-b', target: 'node-a' },
    ],
  };

  let workspaceMembersTable: Record<string, { role: string }> = {};

  beforeEach(async () => {
    vi.restoreAllMocks();

    workspaceMembersTable = {
      [`${validWorkspaceId}:user-bob-456`]: { role: 'developer' },
    };

    // Mock verifyAccessToken
    vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
      if (token === 'valid-user-jwt') {
        return { user: mockUser, error: null };
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
                      if (
                        queryState['id'] === validWorkflowId &&
                        queryState['workspace_id'] === validWorkspaceId
                      ) {
                        return {
                          data: {
                            id: validWorkflowId,
                            name: 'Authoritative Valid Workflow',
                            workspace_id: validWorkspaceId,
                            definition: validWorkflowDefinition,
                          },
                          error: null,
                        };
                      }
                      if (
                        queryState['id'] === cyclicWorkflowId &&
                        queryState['workspace_id'] === validWorkspaceId
                      ) {
                        return {
                          data: {
                            id: cyclicWorkflowId,
                            name: 'Cyclic Workflow',
                            workspace_id: validWorkspaceId,
                            definition: cyclicWorkflowDefinition,
                          },
                          error: null,
                        };
                      }
                      return { data: null, error: null };
                    }),
                  };
                }),
              };
            }),
          };
        }

        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
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
                      if (
                        queryState['id'] === validExecutionId &&
                        queryState['workflows.workspace_id'] === validWorkspaceId
                      ) {
                        return {
                          data: {
                            id: validExecutionId,
                            workflow_id: validWorkflowId,
                            status: 'success',
                            trigger_type: 'manual',
                            started_at: '2026-11-23T06:00:00Z',
                            finished_at: '2026-11-23T06:00:02Z',
                            error_message: null,
                            workflows: { workspace_id: validWorkspaceId },
                          },
                          error: null,
                        };
                      }
                      return { data: null, error: null };
                    }),
                  };
                }),
              };
            }),
          };
        }

        if (table === 'node_executions' || table === 'execution_events') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        };
      }),
    };

    vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdminClient>
    );

    app = await buildApp({
      configOverride: {
        NODE_ENV: 'test',
        RATE_LIMIT_MAX: 1000,
      },
    });
  });

  describe('1. Authentication & RBAC for Server Execution', () => {
    it('rejects unauthenticated execution requests with 401 Unauthorized', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute`,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('rejects viewer role with 403 Forbidden on execution endpoint', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-bob-456`] = { role: 'viewer' };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('Viewers have read-only access');
    });

    it('rejects execution when user is not a member of the workspace (403)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${otherWorkspaceId}/workflows/${validWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden');
    });

    it('allows developer role to trigger execution', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-bob-456`] = { role: 'developer' };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.executionId).toBeDefined();
      expect(body.status).toBe('running');
    });
  });

  describe('2. Authoritative Database Loading & DAG Validation', () => {
    it('returns 404 when workflow does not exist in workspace', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${nonExistentWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workflow not found in this workspace');
    });

    it('returns 400 Bad Request when authoritative definition has cyclic dependency', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${cyclicWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.message).toContain('validation failed');
    });

    it('executes synchronously and returns 200 OK when wait=true is passed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute?wait=true`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.executionId).toBeDefined();
      expect(body.status).toBe('success');
      expect(body.result).toBeDefined();
      expect(body.result.success).toBe(true);
      expect(body.result.nodesExecuted).toBe(2);
      expect(body.result.nodeRecords['node-start'].state).toBe('success');
      expect(body.result.nodeRecords['node-log'].state).toBe('success');
    });

    it('returns 200 with status failed when a node fails during execution', async () => {
      // Mock executeCoreEngine returning success: false
      const failedResult = {
        executionId: 'mock-fail-id',
        success: false,
        startedAt: Date.now() - 500,
        completedAt: Date.now(),
        durationMs: 500,
        nodesExecuted: 1,
        nodeRecords: {
          'node-start': {
            nodeId: 'node-start',
            nodeType: 'manual-trigger',
            nodeLabel: 'Start Trigger',
            state: 'completed' as const,
          },
          'node-log': {
            nodeId: 'node-log',
            nodeType: 'console-output',
            nodeLabel: 'Log Output',
            state: 'failed' as const,
            error: 'Console writer stream broken',
          },
        },
        timeline: [],
        finalOutputs: {},
      };

      vi.spyOn(
        executionEngineService as unknown as { executeCoreEngine: () => Promise<unknown> },
        'executeCoreEngine'
      ).mockResolvedValueOnce(failedResult);

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute?wait=true`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('failed');
      expect(body.result.success).toBe(false);
      expect(body.result.nodeRecords['node-log'].state).toBe('failed');
    });
  });

  describe('3. Workspace Concurrency Limits', () => {
    it('rejects execution with 429 Too Many Requests when workspace limit is reached', async () => {
      // Mock getActiveCount returning MAX_CONCURRENT_PER_WORKSPACE (5)
      vi.spyOn(executionEngineService, 'getActiveCount').mockReturnValue(5);

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/workflows/${validWorkflowId}/execute`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('Workspace execution limit reached');
    });
  });

  describe('4. Execution Status Polling & Scoping', () => {
    it('rejects unauthenticated status query with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions/${validExecutionId}/status`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('allows viewer role to query execution status (read permission)', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-bob-456`] = { role: 'viewer' };

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions/${validExecutionId}/status`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(body.status.id).toBe(validExecutionId);
      expect(body.status.status).toBe('success');
    });

    it('returns 404 for execution not belonging to requested workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${validWorkspaceId}/executions/${otherExecutionId}/status`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });
  });

  describe('5. Execution Cancellation', () => {
    it('rejects viewer role with 403 Forbidden on cancel endpoint', async () => {
      workspaceMembersTable[`${validWorkspaceId}:user-bob-456`] = { role: 'viewer' };

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${validExecutionId}/cancel`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('allows developer to cancel an execution', async () => {
      vi.spyOn(executionEngineService, 'cancelExecution').mockResolvedValueOnce({
        success: true,
        message: 'Execution cancelled successfully',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${validExecutionId}/cancel`,
        headers: {
          authorization: 'Bearer valid-user-jwt',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});
