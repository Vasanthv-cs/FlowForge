import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findDownstreamNodeIds,
  partitionWorkflowForReplay,
  buildReplayEngineOptions,
  WorkflowEngine,
} from '@flowforge/workflow-core';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';
import { serverNodeRegistry } from '../server/engine/serverRegistry.ts';
import { buildApp } from '../server/app.ts';
import * as supabaseModule from '../server/supabase.ts';
import type { FastifyInstance } from 'fastify';
import type { User } from '@supabase/supabase-js';

describe('Batch 14: Time-Travel Debugging & Workflow Replay', () => {
  /* ── 1. Graph Partitioning & Reachability Tests ───────────────────── */
  describe('1. Graph Partitioning & Reachability', () => {
    const nodes = [
      { id: 'trigger', data: { label: 'Start Trigger', type: 'manual-trigger' } },
      { id: 'transform-1', data: { label: 'Transform 1', type: 'set-data' } },
      { id: 'condition', data: { label: 'Condition', type: 'condition' } },
      { id: 'branch-a', data: { label: 'Branch A', type: 'set-data' } },
      { id: 'branch-b', data: { label: 'Branch B', type: 'set-data' } },
    ] as never;

    const edges = [
      { id: 'e1', source: 'trigger', target: 'transform-1' },
      { id: 'e2', source: 'transform-1', target: 'condition' },
      { id: 'e3', source: 'condition', target: 'branch-a', sourceHandle: 'true' },
      { id: 'e4', source: 'condition', target: 'branch-b', sourceHandle: 'false' },
    ] as never;

    it('finds all downstream nodes from the root trigger', () => {
      const downstream = findDownstreamNodeIds(nodes, edges, 'trigger');
      expect(downstream.has('trigger')).toBe(true);
      expect(downstream.has('transform-1')).toBe(true);
      expect(downstream.has('condition')).toBe(true);
      expect(downstream.has('branch-a')).toBe(true);
      expect(downstream.has('branch-b')).toBe(true);
      expect(downstream.size).toBe(5);
    });

    it('finds all downstream nodes from an intermediate node', () => {
      const downstream = findDownstreamNodeIds(nodes, edges, 'condition');
      expect(downstream.has('condition')).toBe(true);
      expect(downstream.has('branch-a')).toBe(true);
      expect(downstream.has('branch-b')).toBe(true);
      expect(downstream.has('trigger')).toBe(false);
      expect(downstream.has('transform-1')).toBe(false);
      expect(downstream.size).toBe(3);
    });

    it('partitions nodes into reused and re-executed groups based on historical records', () => {
      const historicalRecords: Record<string, NodeExecutionRecord> = {
        trigger: {
          nodeId: 'trigger',
          nodeLabel: 'Start Trigger',
          nodeType: 'manual-trigger',
          state: 'success',
          outputData: { userId: 'usr_123', amount: 500 },
        },
        'transform-1': {
          nodeId: 'transform-1',
          nodeLabel: 'Transform 1',
          nodeType: 'set-data',
          state: 'success',
          outputData: { userId: 'usr_123', amount: 500, tier: 'gold' },
        },
        condition: {
          nodeId: 'condition',
          nodeLabel: 'Condition',
          nodeType: 'condition',
          state: 'failed',
          error: 'Condition evaluation failed',
        },
      };

      const partition = partitionWorkflowForReplay(nodes, edges, 'condition', historicalRecords);

      expect(partition.targetNodeId).toBe('condition');
      expect(partition.reusedNodeIds).toContain('trigger');
      expect(partition.reusedNodeIds).toContain('transform-1');
      expect(partition.reexecutedNodeIds).toContain('condition');
      expect(partition.reexecutedNodeIds).toContain('branch-a');
      expect(partition.reexecutedNodeIds).toContain('branch-b');
      expect(partition.reusedNodeIds.length).toBe(2);
      expect(partition.reexecutedNodeIds.length).toBe(3);
    });

    it('throws when target node does not exist in workflow definition', () => {
      expect(() =>
        partitionWorkflowForReplay(nodes, edges, 'non-existent-node', {})
      ).toThrow('Target node "non-existent-node" does not exist in workflow definition.');
    });

    it('does not reuse upstream nodes if their historical status was not success', () => {
      const historicalRecords: Record<string, NodeExecutionRecord> = {
        trigger: {
          nodeId: 'trigger',
          nodeLabel: 'Start Trigger',
          nodeType: 'manual-trigger',
          state: 'failed',
          error: 'Trigger failed',
        },
      };

      const partition = partitionWorkflowForReplay(nodes, edges, 'transform-1', historicalRecords);
      // 'trigger' did not succeed, so it must not be marked as reused
      expect(partition.reusedNodeIds).not.toContain('trigger');
      expect(partition.reexecutedNodeIds).toContain('trigger');
    });
  });

  /* ── 2. Core Replay Engine Execution Tests ───────────────────────── */
  describe('2. Core Replay Engine Execution & State Preservation', () => {
    const replayNodes = [
      {
        id: 'node-trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          config: { payload: '{"base": 100}' },
        },
      },
      {
        id: 'node-set',
        data: {
          label: 'Set Multiplier',
          type: 'set-data',
          category: 'transform',
          config: {
            fields: [{ key: 'multiplier', value: '2', valueType: 'number' }],
            mergeWithIncoming: true,
          },
        },
      },
      {
        id: 'node-math',
        data: {
          label: 'Calculate Total',
          type: 'math-operations',
          category: 'transform',
          config: {
            operation: 'multiply',
            leftOperand: 'payload.base',
            rightOperand: 'multiplier',
            outputKey: 'total',
          },
        },
      },
    ] as never;

    const replayEdges = [
      { id: 'e1', source: 'node-trigger', target: 'node-set' },
      { id: 'e2', source: 'node-set', target: 'node-math' },
    ] as never;

    it('replays workflow from intermediate node while reusing upstream output without re-executing', async () => {
      const engine = new WorkflowEngine(serverNodeRegistry);

      // Step A: Run the original execution
      const origResult = await engine.executeWorkflow('orig-exec-1', replayNodes, replayEdges, {
        overrideTriggerPayload: { base: 100 },
      });
      expect(origResult.success).toBe(true);
      expect(origResult.nodeRecords['node-math'].outputData?.total).toBe(200);

      // Step B: Replay starting from node-set
      const partition = partitionWorkflowForReplay(
        replayNodes,
        replayEdges,
        'node-set',
        origResult.nodeRecords
      );

      const replayOptions = buildReplayEngineOptions({
        replayedFromExecutionId: 'orig-exec-1',
        targetNodeId: 'node-set',
        partition,
        originalRecords: origResult.nodeRecords,
        safeReplayMode: true,
      });

      const replayResult = await engine.executeWorkflow(
        'replay-exec-2',
        replayNodes,
        replayEdges,
        replayOptions
      );

      expect(replayResult.success).toBe(true);
      // Upstream node-trigger was reused
      expect(replayResult.nodeRecords['node-trigger'].isReused).toBe(true);
      expect(replayResult.nodeRecords['node-trigger'].outputData).toEqual(
        origResult.nodeRecords['node-trigger'].outputData
      );

      // Downstream node-set and node-math re-executed fresh
      expect(replayResult.nodeRecords['node-set'].isReused).toBe(false);
      expect(replayResult.nodeRecords['node-math'].isReused).toBe(false);
      expect(replayResult.nodeRecords['node-math'].outputData?.total).toBe(200);

      // Timeline contains reused event indicator
      const reusedEvent = replayResult.timeline.find((t) => t.details?.reused === true);
      expect(reusedEvent).toBeDefined();
      expect(reusedEvent?.nodeId).toBe('node-trigger');
    });

    it('allows editing incoming input payload for the replayed target node', async () => {
      const engine = new WorkflowEngine(serverNodeRegistry);

      // Step A: Original run
      const origResult = await engine.executeWorkflow('orig-exec-3', replayNodes, replayEdges, {
        overrideTriggerPayload: { base: 100 },
      });
      expect(origResult.success).toBe(true);

      // Step B: Replay from node-set with edited input: override base to 500
      const partition = partitionWorkflowForReplay(
        replayNodes,
        replayEdges,
        'node-set',
        origResult.nodeRecords
      );

      const replayOptions = buildReplayEngineOptions({
        replayedFromExecutionId: 'orig-exec-3',
        targetNodeId: 'node-set',
        partition,
        originalRecords: origResult.nodeRecords,
        editedInput: { payload: { base: 500 } }, // Edited payload
        safeReplayMode: true,
      });

      const replayResult = await engine.executeWorkflow(
        'replay-exec-4',
        replayNodes,
        replayEdges,
        replayOptions
      );

      expect(replayResult.success).toBe(true);
      // The new calculation reflects the edited input: 500 * 2 = 1000
      expect(replayResult.nodeRecords['node-math'].outputData?.total).toBe(1000);
    });
  });

  /* ── 3. Safe Replay Mode Tests ───────────────────────────────────── */
  describe('3. Safe Replay Mode & External Request Protection', () => {
    const httpWorkflowNodes = [
      {
        id: 'node-trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          config: { payload: '{"orderId": "ord_999"}' },
        },
      },
      {
        id: 'node-http',
        data: {
          label: 'Call External API',
          type: 'http-request',
          category: 'action',
          config: {
            url: 'https://api.example.com/charge',
            method: 'POST',
            timeoutMs: 5000,
          },
        },
      },
    ] as never;

    const httpWorkflowEdges = [
      { id: 'e1', source: 'node-trigger', target: 'node-http' },
    ] as never;

    it('automatically mocks HTTP responses in Safe Replay Mode using recorded historical outputs', async () => {
      const engine = new WorkflowEngine(serverNodeRegistry);

      const simulatedOriginalRecords: Record<string, NodeExecutionRecord> = {
        'node-trigger': {
          nodeId: 'node-trigger',
          nodeLabel: 'Manual Trigger',
          nodeType: 'manual-trigger',
          state: 'success',
          outputData: { orderId: 'ord_999' },
        },
        'node-http': {
          nodeId: 'node-http',
          nodeLabel: 'Call External API',
          nodeType: 'http-request',
          state: 'success',
          outputData: {
            status: 200,
            statusText: 'OK',
            data: { chargeId: 'ch_live_123', paid: true },
            ok: true,
          },
        },
      };

      const partition = partitionWorkflowForReplay(
        httpWorkflowNodes,
        httpWorkflowEdges,
        'node-http',
        simulatedOriginalRecords
      );

      // Replay with Safe Mode = true (default)
      const replayOptions = buildReplayEngineOptions({
        replayedFromExecutionId: 'original-exec-charge',
        targetNodeId: 'node-http',
        partition,
        originalRecords: simulatedOriginalRecords,
        safeReplayMode: true,
      });

      const result = await engine.executeWorkflow(
        'replay-exec-charge-safe',
        httpWorkflowNodes,
        httpWorkflowEdges,
        replayOptions
      );

      expect(result.success).toBe(true);
      const httpRecord = result.nodeRecords['node-http'];
      // Marked as mocked in safe replay mode
      expect(httpRecord.isMocked).toBe(true);
      expect((httpRecord.outputData?.data as Record<string, unknown>)?.chargeId).toBe('ch_live_123');
    });
  });

  /* ── 4. Fastify Server Replay Route & Lineage Tests ──────────────── */
  describe('4. Fastify Server Replay Route & Lineage Preservation', () => {
    let app: FastifyInstance;

    const validWorkspaceId = '11111111-1111-4111-8111-111111111111';
    const originalExecutionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const nonExistentExecId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    const mockDeveloperUser: User = {
      id: 'dev-user-1',
      app_metadata: {},
      user_metadata: { name: 'Alice Dev' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: 'alice@example.com',
    };

    const mockViewerUser: User = {
      id: 'viewer-user-2',
      app_metadata: {},
      user_metadata: { name: 'Bob Viewer' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: 'bob@example.com',
    };

    const snapshotDefinition = {
      name: 'Replay Target Workflow',
      nodes: [
        {
          id: 'n-start',
          type: 'workflowNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Start Trigger',
            type: 'manual-trigger',
            category: 'trigger',
            config: { payload: '{"val": 1}' },
          },
        },
        {
          id: 'n-set',
          type: 'workflowNode',
          position: { x: 100, y: 0 },
          data: {
            label: 'Set Property',
            type: 'set-data',
            category: 'transform',
            config: { fieldPath: 'status', fieldValue: 'active', valueType: 'string' },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'n-start', target: 'n-set' }],
    };

    beforeEach(async () => {
      vi.restoreAllMocks();

      vi.spyOn(supabaseModule, 'verifyAccessToken').mockImplementation(async (token: string) => {
        if (token === 'dev-token') return { user: mockDeveloperUser, error: null };
        if (token === 'viewer-token') return { user: mockViewerUser, error: null };
        return { user: null, error: 'Invalid or expired authentication token' };
      });

      const workspaceMembersTable: Record<string, { role: string }> = {
        [`${validWorkspaceId}:dev-user-1`]: { role: 'developer' },
        [`${validWorkspaceId}:viewer-user-2`]: { role: 'viewer' },
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn(async (token: string) => {
            if (token === 'dev-token') return { data: { user: mockDeveloperUser }, error: null };
            if (token === 'viewer-token') return { data: { user: mockViewerUser }, error: null };
            return { data: { user: null }, error: new Error('Invalid token') };
          }),
        },
        from: vi.fn((table: string) => {
          if (table === 'workspace_members') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn((_field1: string, val1: string) => ({
                  eq: vi.fn((_field2: string, val2: string) => ({
                    maybeSingle: vi.fn(async () => {
                      const key = `${val1}:${val2}`;
                      const row = workspaceMembersTable[key];
                      return { data: row ? { role: row.role } : null, error: null };
                    }),
                  })),
                })),
              })),
            };
          }

          if (table === 'executions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn((_f1: string, v1: string) => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                      if (v1 === originalExecutionId) {
                        return {
                          data: {
                            id: originalExecutionId,
                            workflow_id: 'wf-111',
                            workflow_version_id: null,
                            input_payload: {
                              definition: snapshotDefinition,
                            },
                            workflows: {
                              workspace_id: validWorkspaceId,
                              name: 'Replay Target Workflow',
                            },
                          },
                          error: null,
                        };
                      }
                      return { data: null, error: null };
                    }),
                  })),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
              update: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            };
          }

          if (table === 'node_executions') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: [
                    {
                      node_id: 'n-start',
                      node_type: 'manual-trigger',
                      node_label: 'Start Trigger',
                      status: 'success',
                      input_payload: {},
                      output_payload: { val: 1 },
                      duration_ms: 10,
                    },
                  ],
                  error: null,
                })),
              })),
              upsert: vi.fn(async () => ({ error: null })),
            };
          }

          if (table === 'execution_events') {
            return {
              insert: vi.fn(async () => ({ error: null })),
            };
          }

          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }),
      };

      vi.spyOn(supabaseModule, 'getSupabaseAdminClient').mockReturnValue(mockSupabase as never);

      app = await buildApp({ loggerOverride: false });
      await app.ready();
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${originalExecutionId}/replay`,
        payload: { targetNodeId: 'n-set' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects viewer role with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${originalExecutionId}/replay`,
        headers: { authorization: 'Bearer viewer-token' },
        payload: { targetNodeId: 'n-set' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects missing or non-string targetNodeId with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${originalExecutionId}/replay`,
        headers: { authorization: 'Bearer dev-token' },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('targetNodeId is required');
    });

    it('returns 404 when original execution is not found in the workspace', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${nonExistentExecId}/replay`,
        headers: { authorization: 'Bearer dev-token' },
        payload: { targetNodeId: 'n-set' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('allows developer to replay workflow execution and returns lineage metadata', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${validWorkspaceId}/executions/${originalExecutionId}/replay`,
        headers: { authorization: 'Bearer dev-token' },
        payload: {
          targetNodeId: 'n-set',
          safeReplay: true,
          waitForCompletion: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.executionId).toBeDefined();
      expect(body.replayedFromExecutionId).toBe(originalExecutionId);
      expect(body.replayFromNodeId).toBe('n-set');
      expect(body.reusedNodeIds).toContain('n-start');
      expect(body.reexecutedNodeIds).toContain('n-set');
      expect(body.safeReplay).toBe(true);
      expect(body.status).toBe('success');
    });
  });
});
