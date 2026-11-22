import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executionService } from '@/services/executionService';
import { redactSensitiveData } from '@flowforge/shared';
import { useWorkflowStore, cancelPendingAutosave } from '@/store/workflowStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { SavedWorkflow } from '@/store/persistence';
import type { TimelineEvent } from '@flowforge/workflow-core';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    },
    isSupabaseConfigured: true,
  };
});

describe('Stage 10, Batch 5: Execution History & Node-Level Run Logs', () => {
  const mockWorkspaceId = '11111111-1111-4111-8111-111111111111';
  const mockWorkflowId = '22222222-2222-4222-8222-222222222222';
  const mockExecutionId = '33333333-3333-4333-8333-333333333333';
  const mockUserId = '44444444-4444-4444-8444-444444444444';

  const sampleDefinition: SavedWorkflow = {
    id: mockWorkflowId,
    name: 'Customer Onboarding Run',
    nodes: [
      {
        id: 'node-trigger',
        type: 'workflowNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          description: 'Trigger',
          icon: 'Play',
          color: '#10b981',
          config: { payload: '{"apiKey": "secret_abc123", "user": "alice"}' },
          inputs: [],
          outputs: [{ id: 'output', label: 'Payload', type: 'any' }],
          status: 'idle',
        },
      },
    ],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    cancelPendingAutosave();

    useWorkspaceStore.setState({
      workspaces: [
        {
          id: mockWorkspaceId,
          name: 'Main Workspace',
          ownerId: mockUserId,
          role: 'developer',
          createdAt: new Date().toISOString(),
        },
      ],
      activeWorkspaceId: mockWorkspaceId,
      isLoading: false,
      isMembersLoading: false,
      error: null,
    });

    useWorkflowStore.setState({
      workflowId: mockWorkflowId,
      workflowName: 'Customer Onboarding Run',
      nodes: sampleDefinition.nodes,
      edges: [],
      isSaved: true,
      saveStatus: 'saved',
      isCloudWorkflow: true,
      workspaceId: mockWorkspaceId,
      isRunning: false,
      executionId: null,
      nodeRecords: {},
      logs: [],
      executionHistory: [],
    });
  });

  describe('Part A — Secret Redaction Safeguards', () => {
    it('deeply redacts passwords, tokens, API keys, and auth headers from nested payloads', () => {
      const sensitivePayload = {
        apiKey: 'super-secret-key-123',
        password: 'UserPassword!234',
        user: {
          name: 'Alice',
          authToken: 'Bearer eyJhbGciOi...',
          credentials: {
            clientSecret: 'secret_xyz',
            publicKey: 'safe-public-val',
          },
        },
        items: [
          { token: 'secret-token-1' },
          { name: 'public-item', authorization: 'Basic dXNlcjpwYXNz' },
        ],
      };

      const redacted = redactSensitiveData(sensitivePayload);

      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.user.name).toBe('Alice');
      expect(redacted.user.authToken).toBe('[REDACTED]');
      expect(redacted.user.credentials.clientSecret).toBe('[REDACTED]');
      expect(redacted.user.credentials.publicKey).toBe('safe-public-val');
      expect(redacted.items[0].token).toBe('[REDACTED]');
      expect(redacted.items[1].name).toBe('public-item');
      expect(redacted.items[1].authorization).toBe('[REDACTED]');
    });
  });

  describe('Part B — Execution Persistence Lifecycle', () => {
    it('starts execution record with exact snapshot in public.executions', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: { user: { id: mockUserId } as User },
        error: null,
      });

      const singleMock = vi.fn().mockResolvedValue({
        data: { id: mockExecutionId },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });

      const eventInsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'executions') {
          return { insert: insertMock } as unknown as ReturnType<typeof supabase.from>;
        }
        if (table === 'execution_events') {
          return { insert: eventInsertMock } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const { data, error } = await executionService.startExecution({
        executionId: mockExecutionId,
        workflowId: mockWorkflowId,
        workflowDefinition: sampleDefinition,
        triggerType: 'manual',
        triggerPayload: { password: 'my-password-123', target: 'prod' },
      });

      expect(error).toBeNull();
      expect(data).toBe(mockExecutionId);
      expect(insertMock).toHaveBeenCalled();

      // Verify that the trigger payload was redacted before database insert
      const insertArg = insertMock.mock.calls[0][0];
      expect(insertArg.input_payload.triggerPayload.password).toBe('[REDACTED]');
      expect(insertArg.input_payload.triggerPayload.target).toBe('prod');
      expect(insertArg.status).toBe('running');
    });

    it('finalizes execution record with success status and outputs', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const eventInsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'executions') {
          return { update: updateMock } as unknown as ReturnType<typeof supabase.from>;
        }
        if (table === 'execution_events') {
          return { insert: eventInsertMock } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const { error } = await executionService.finishExecution({
        executionId: mockExecutionId,
        status: 'success',
        outputPayload: { processedUsers: 5, secretApiKey: 'secret_value' },
        startedAt: 1000,
        completedAt: 1500,
      });

      expect(error).toBeNull();
      expect(updateMock).toHaveBeenCalled();
      const updateArg = updateMock.mock.calls[0][0];
      expect(updateArg.status).toBe('success');
      expect(updateArg.output_payload.processedUsers).toBe(5);
      expect(updateArg.output_payload.secretApiKey).toBe('[REDACTED]');
    });

    it('finalizes execution record with failed status and error message on failure', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const eventInsertMock = vi.fn().mockResolvedValue({ error: null });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'executions') {
          return { update: updateMock } as unknown as ReturnType<typeof supabase.from>;
        }
        if (table === 'execution_events') {
          return { insert: eventInsertMock } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const { error } = await executionService.finishExecution({
        executionId: mockExecutionId,
        status: 'failed',
        errorMessage: 'HTTP request timed out after 5000ms',
        completedAt: Date.now(),
      });

      expect(error).toBeNull();
      const updateArg = updateMock.mock.calls[0][0];
      expect(updateArg.status).toBe('failed');
      expect(updateArg.error_message).toContain('HTTP request timed out');
    });
  });

  describe('Part C — Node-Level Runs & Event Timeline Persistence', () => {
    it('persists granular node execution records into public.node_executions', async () => {
      const nodeRecords: Record<string, NodeExecutionRecord> = {
        'node-trigger': {
          nodeId: 'node-trigger',
          nodeLabel: 'Manual Trigger',
          nodeType: 'manual-trigger',
          state: 'success',
          startedAt: 1000,
          completedAt: 1020,
          durationMs: 20,
          inputData: { rawToken: 'secret_tok' },
          outputData: { status: 'ok' },
        },
      };

      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ upsert: upsertMock } as unknown as ReturnType<typeof supabase.from>);

      const { error } = await executionService.persistNodeExecutions(mockExecutionId, nodeRecords);

      expect(error).toBeNull();
      expect(upsertMock).toHaveBeenCalled();
      const rows = upsertMock.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].node_id).toBe('node-trigger');
      expect(rows[0].node_label).toBe('Manual Trigger');
      expect(rows[0].status).toBe('success');
      expect(rows[0].input_payload.rawToken).toBe('[REDACTED]');
      expect(rows[0].output_payload.status).toBe('ok');
    });

    it('persists structured events to public.execution_events', async () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-1',
          type: 'node_started',
          timestamp: Date.now(),
          nodeId: 'node-trigger',
          nodeLabel: 'Manual Trigger',
          message: 'Node started',
        },
        {
          id: 'ev-2',
          type: 'node_completed',
          timestamp: Date.now() + 50,
          nodeId: 'node-trigger',
          nodeLabel: 'Manual Trigger',
          durationMs: 50,
          message: 'Node completed',
        },
      ];

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabase.from>);

      const { error } = await executionService.persistTimelineEvents(mockExecutionId, events);

      expect(error).toBeNull();
      expect(insertMock).toHaveBeenCalled();
      const rows = insertMock.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0].event_type).toBe('node_started');
      expect(rows[1].event_type).toBe('node_completed');
    });
  });

  describe('Part D — Querying Execution History & Details', () => {
    it('lists workflow executions filtered by status', async () => {
      const mockExecutions = [
        {
          id: mockExecutionId,
          workflow_id: mockWorkflowId,
          workflow_version_id: null,
          status: 'success',
          trigger_type: 'manual',
          error_message: null,
          started_at: '2026-11-22T10:00:00.000Z',
          finished_at: '2026-11-22T10:00:02.000Z',
          created_by: mockUserId,
          created_at: '2026-11-22T10:00:00.000Z',
        },
      ];

      const limitMock = vi.fn().mockResolvedValue({ data: mockExecutions, error: null });
      const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const { data, error } = await executionService.listWorkflowExecutions(mockWorkflowId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe('success');
      expect(data![0].durationMs).toBe(2000);
    });

    it('retrieves full execution details with node records, events, and snapshot', async () => {
      // Mock execution row
      const execSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: mockExecutionId,
              workflow_id: mockWorkflowId,
              status: 'success',
              trigger_type: 'manual',
              input_payload: { definition: sampleDefinition },
              started_at: '2026-11-22T10:00:00.000Z',
              finished_at: '2026-11-22T10:00:01.000Z',
              created_at: '2026-11-22T10:00:00.000Z',
            },
            error: null,
          }),
        }),
      });

      // Mock node executions
      const nodeSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'n-exec-1',
                execution_id: mockExecutionId,
                node_id: 'node-trigger',
                node_type: 'manual-trigger',
                node_label: 'Manual Trigger',
                status: 'success',
                input_payload: { safe: true },
                output_payload: { done: true },
                duration_ms: 100,
                started_at: '2026-11-22T10:00:00.000Z',
                finished_at: '2026-11-22T10:00:00.100Z',
              },
            ],
            error: null,
          }),
        }),
      });

      // Mock events
      const eventSelectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 1,
                execution_id: mockExecutionId,
                node_id: 'node-trigger',
                event_type: 'node_completed',
                message: 'Trigger executed',
                metadata: {},
                created_at: '2026-11-22T10:00:00.100Z',
              },
            ],
            error: null,
          }),
        }),
      });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'executions') {
          return { select: execSelectMock } as unknown as ReturnType<typeof supabase.from>;
        }
        if (table === 'node_executions') {
          return { select: nodeSelectMock } as unknown as ReturnType<typeof supabase.from>;
        }
        if (table === 'execution_events') {
          return { select: eventSelectMock } as unknown as ReturnType<typeof supabase.from>;
        }
        return {} as unknown as ReturnType<typeof supabase.from>;
      });

      const { data, error } = await executionService.getExecutionDetails(mockExecutionId);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data!.execution.status).toBe('success');
      expect(data!.nodeExecutions).toHaveLength(1);
      expect(data!.nodeExecutions[0].nodeLabel).toBe('Manual Trigger');
      expect(data!.events).toHaveLength(1);
      expect(data!.definitionSnapshot?.name).toBe('Customer Onboarding Run');
    });
  });

  describe('Part E — Reliability & Resilience', () => {
    it('continues workflow run successfully even if database persistence throws or fails', async () => {
      // Mock Supabase throwing an error during execution persistence
      vi.mocked(supabase.from).mockImplementation(() => {
        throw new Error('Database unreachable');
      });

      // Run workflow in canvas store
      const result = await useWorkflowStore.getState().runWorkflow();

      // The workflow run itself should succeed! Database error does NOT crash the editor
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(useWorkflowStore.getState().isRunning).toBe(false);
    });

    it('skips cloud execution persistence for local / offline workflows without error', async () => {
      useWorkflowStore.setState({
        workflowId: 'wf-local-offline-1',
        isCloudWorkflow: false,
      });

      const insertMock = vi.fn();
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabase.from>);

      const { data, error } = await executionService.startExecution({
        workflowId: 'wf-local-offline-1',
        workflowDefinition: sampleDefinition,
      });

      expect(data).toBeNull();
      expect(error).toContain('Local workflow: skipped');
      expect(insertMock).not.toHaveBeenCalled();
    });
  });
});
