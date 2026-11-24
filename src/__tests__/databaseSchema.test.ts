import { describe, it, expect } from 'vitest';
import {
  workspaceRoleSchema,
  executionStatusSchema,
  profileSchema,
  workspaceSchema,
  workspaceMemberSchema,
  workflowRowSchema,
  workflowVersionRowSchema,
  executionRowSchema,
  nodeExecutionRowSchema,
  executionEventRowSchema,
} from '@flowforge/workflow-schema';

describe('Database Schema Types and Validation (Batch 1)', () => {
  it('validates workspace roles according to database check constraint', () => {
    expect(workspaceRoleSchema.parse('owner')).toBe('owner');
    expect(workspaceRoleSchema.parse('admin')).toBe('admin');
    expect(workspaceRoleSchema.parse('developer')).toBe('developer');
    expect(workspaceRoleSchema.parse('viewer')).toBe('viewer');
    expect(() => workspaceRoleSchema.parse('superadmin')).toThrow();
  });

  it('validates execution statuses according to database check constraint', () => {
    const validStatuses = ['queued', 'running', 'success', 'failed', 'cancelled', 'waiting', 'interrupted'] as const;
    for (const status of validStatuses) {
      expect(executionStatusSchema.parse(status)).toBe(status);
    }
    expect(() => executionStatusSchema.parse('unknown_status')).toThrow();
  });

  it('validates user profiles with UUIDs', () => {
    const validProfile = {
      id: '11111111-1111-4111-8111-111111111111',
      displayName: 'Alice Engineer',
      avatarUrl: 'https://example.com/avatar.png',
      createdAt: new Date().toISOString(),
    };
    expect(profileSchema.parse(validProfile)).toEqual(validProfile);

    // Invalid non-UUID
    expect(() =>
      profileSchema.parse({
        id: 'not-a-uuid',
        createdAt: new Date().toISOString(),
      })
    ).toThrow();
  });

  it('validates workspaces and workspace members', () => {
    const workspace = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Engineering Workspace',
      ownerId: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
    };
    expect(workspaceSchema.parse(workspace)).toEqual(workspace);

    const member = {
      workspaceId: workspace.id,
      userId: workspace.ownerId,
      role: 'owner' as const,
      createdAt: new Date().toISOString(),
    };
    expect(workspaceMemberSchema.parse(member)).toEqual(member);
  });

  it('validates workflow database row with JSONB graph definition', () => {
    const workflow = {
      id: '33333333-3333-4333-8333-333333333333',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      name: 'Order Processing Pipeline',
      description: 'Production event pipeline',
      definition: {
        id: 'wf-1',
        name: 'Order Processing Pipeline',
        nodes: [
          {
            id: 'node-1',
            type: 'manual-trigger',
            position: { x: 100, y: 100 },
            data: { label: 'Start', category: 'trigger', status: 'idle', config: {} },
          },
        ],
        edges: [],
      },
      createdBy: '11111111-1111-4111-8111-111111111111',
      updatedBy: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(workflowRowSchema.parse(workflow).id).toBe(workflow.id);
  });

  it('validates immutable workflow version snapshot row', () => {
    const versionRow = {
      id: '44444444-4444-4444-8444-444444444444',
      workflowId: '33333333-3333-4333-8333-333333333333',
      versionNumber: 1,
      name: 'v1.0.0 Stable Release',
      definition: {
        id: 'wf-1',
        name: 'Order Processing Pipeline',
        nodes: [],
        edges: [],
      },
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
    };
    expect(workflowVersionRowSchema.parse(versionRow).versionNumber).toBe(1);
  });

  it('validates execution and node execution records', () => {
    const execution = {
      id: '55555555-5555-4555-8555-555555555555',
      workflowId: '33333333-3333-4333-8333-333333333333',
      workflowVersionId: '44444444-4444-4444-8444-444444444444',
      status: 'success' as const,
      triggerType: 'manual',
      inputPayload: { orderId: 1042 },
      outputPayload: { processed: true },
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
    };
    expect(executionRowSchema.parse(execution).status).toBe('success');

    const nodeExec = {
      id: '66666666-6666-4666-8666-666666666666',
      executionId: execution.id,
      nodeId: 'node-1',
      nodeType: 'manual-trigger',
      status: 'success',
      inputPayload: { orderId: 1042 },
      outputPayload: { orderId: 1042 },
      durationMs: 4,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(nodeExecutionRowSchema.parse(nodeExec).durationMs).toBe(4);

    const event = {
      id: 1,
      executionId: execution.id,
      nodeId: 'node-1',
      eventType: 'NODE_COMPLETED',
      message: 'Node execution succeeded',
      metadata: { durationMs: 4 },
      createdAt: new Date().toISOString(),
    };
    expect(executionEventRowSchema.parse(event).eventType).toBe('NODE_COMPLETED');
  });
});
