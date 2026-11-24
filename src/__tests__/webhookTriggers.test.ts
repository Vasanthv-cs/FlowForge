import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { WebhookService } from '../server/services/webhookService';
import { WebhookTriggerExecutor } from '../engine/executors/WebhookTriggerExecutor';
import { buildApp } from '../server/app';
import type { ExecutionContext } from '../engine/types';

// Mock Supabase admin client
const mockWorkflow = {
  id: 'wf-11111111-2222-3333-4444-555555555555',
  workspace_id: 'ws-11111111-2222-3333-4444-555555555555',
  name: 'Webhook Ingest Pipeline',
  is_active: true,
};

let mockWebhookRow: {
  id: string;
  workflow_id: string;
  workspace_id: string;
  node_id: string;
  path: string;
  http_method: string;
  auth_type: string;
  secret_token: string | null;
  header_name: string;
  respond_mode: string;
  workflows: typeof mockWorkflow;
} | null = null;

vi.mock('../server/supabase', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'workflow_webhooks') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: mockWebhookRow,
                error: null,
              }),
            }),
          }),
          upsert: async () => ({ error: null }),
          delete: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    },
  }),
}));

// Mock execution engine service
vi.mock('../server/services/executionEngineService', () => ({
  executionEngineService: {
    startWorkflowExecution: vi.fn().mockImplementation(async (params: { waitForCompletion?: boolean }) => ({
      executionId: 'exec-mock-webhook-123',
      status: params.waitForCompletion ? 'success' : 'running',
      startedAt: new Date().toISOString(),
      result: params.waitForCompletion
        ? {
            executionId: 'exec-mock-webhook-123',
            success: true,
            status: 'success',
            durationMs: 42,
            nodeRecords: {},
          }
        : undefined,
    })),
  },
}));

describe('Batch 10: Webhook Triggers & Public Ingestion Endpoints', () => {
  const service = new WebhookService();

  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookRow = {
      id: 'whk-entry-1',
      workflow_id: mockWorkflow.id,
      workspace_id: mockWorkflow.workspace_id,
      node_id: 'node-webhook-1',
      path: 'order-created',
      http_method: 'POST',
      auth_type: 'none',
      secret_token: null,
      header_name: 'X-Webhook-Secret',
      respond_mode: 'immediate',
      workflows: { ...mockWorkflow },
    };
  });

  describe('1. Authentication Verification Logic', () => {
    it('allows all requests when authType is none', () => {
      const allowed = service.verifyAuth({
        authType: 'none',
        headers: {},
      });
      expect(allowed).toBe(true);
    });

    it('rejects header-secret authentication if token is missing or incorrect', () => {
      const secret = 'my-secret-key-123';

      // Missing header
      expect(
        service.verifyAuth({
          authType: 'header-secret',
          secretToken: secret,
          headers: {},
        })
      ).toBe(false);

      // Wrong token
      expect(
        service.verifyAuth({
          authType: 'header-secret',
          secretToken: secret,
          headers: { 'x-webhook-secret': 'wrong-token' },
        })
      ).toBe(false);

      // Correct token
      expect(
        service.verifyAuth({
          authType: 'header-secret',
          secretToken: secret,
          headers: { 'x-webhook-secret': secret },
        })
      ).toBe(true);
    });

    it('verifies bearer token in Authorization header', () => {
      const secret = 'bearer_token_xyz';

      expect(
        service.verifyAuth({
          authType: 'bearer-token',
          secretToken: secret,
          headers: { authorization: `Bearer ${secret}` },
        })
      ).toBe(true);

      expect(
        service.verifyAuth({
          authType: 'bearer-token',
          secretToken: secret,
          headers: { authorization: 'Bearer wrong_token' },
        })
      ).toBe(false);

      expect(
        service.verifyAuth({
          authType: 'bearer-token',
          secretToken: secret,
          headers: { authorization: 'Basic dXNlcjpwYXNz' },
        })
      ).toBe(false);
    });

    it('verifies HMAC-SHA256 signature with raw and sha256= prefixes', () => {
      const secret = 'stripe_webhook_secret_key';
      const body = { orderId: 999, amount: 250 };
      const rawBody = JSON.stringify(body);

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const signature = hmac.digest('hex');

      // Valid plain hex signature
      expect(
        service.verifyAuth({
          authType: 'hmac-sha256',
          secretToken: secret,
          headers: { 'x-hub-signature-256': signature },
          rawBody,
          body,
        })
      ).toBe(true);

      // Valid with sha256= prefix (GitHub format)
      expect(
        service.verifyAuth({
          authType: 'hmac-sha256',
          secretToken: secret,
          headers: { 'x-hub-signature-256': `sha256=${signature}` },
          rawBody,
          body,
        })
      ).toBe(true);

      // Invalid signature
      expect(
        service.verifyAuth({
          authType: 'hmac-sha256',
          secretToken: secret,
          headers: { 'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000' },
          rawBody,
          body,
        })
      ).toBe(false);
    });
  });

  describe('2. WebhookTriggerExecutor Engine Node', () => {
    it('executes and emits incoming payload and request metadata', async () => {
      const executor = new WebhookTriggerExecutor();
      const logs: string[] = [];

      const mockContext: ExecutionContext = {
        executionId: 'exec-test-1',
        workflowId: 'wf-test-1',
        node: {
          id: 'node-webhook-1',
          type: 'workflowNode',
          position: { x: 0, y: 0 },
          data: {
            label: 'Webhook Trigger',
            type: 'webhook-trigger',
            category: 'trigger',
            description: '',
            icon: 'Webhook',
            color: '#059669',
            inputs: [],
            outputs: [{ id: 'output', label: 'Payload', type: 'object' }],
            config: {
              path: 'order-created',
              httpMethod: 'POST',
              authType: 'none',
              secret: '',
              headerName: 'X-Webhook-Secret',
              respondMode: 'immediate',
            },
          },
        },
        upstreamOutputs: {},
        incomingPayload: {},
        triggerPayload: {
          body: { customer: 'Alice', items: [1, 2, 3] },
          headers: { 'content-type': 'application/json' },
          query: { source: 'shopify' },
          method: 'POST',
          timestamp: 1700000000000,
        },
        emitLog: (_level, msg) => logs.push(msg),
      };

      const result = await executor.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output?.payload).toEqual({ customer: 'Alice', items: [1, 2, 3] });
      expect(result.output?.method).toBe('POST');
      expect(result.output?.query).toEqual({ source: 'shopify' });
      expect(logs.some((l) => l.includes('Webhook Trigger activated'))).toBe(true);
    });
  });

  describe('3. Fastify Webhook Public Endpoints', () => {
    it('returns 404 for unknown webhook paths', async () => {
      mockWebhookRow = null; // No match
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/unknown-slug',
        payload: { test: true },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error).toContain('not found');
      await app.close();
    });

    it('returns 405 if HTTP method is not allowed', async () => {
      mockWebhookRow = {
        ...mockWebhookRow!,
        http_method: 'POST',
      };
      const app = await buildApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/webhooks/order-created',
      });

      expect(response.statusCode).toBe(405);
      const json = response.json();
      expect(json.error).toContain('Method GET not allowed');
      await app.close();
    });

    it('returns 422 if workflow is inactive', async () => {
      mockWebhookRow = {
        ...mockWebhookRow!,
        workflows: {
          ...mockWorkflow,
          is_active: false,
        },
      };
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/order-created',
        payload: { test: true },
      });

      expect(response.statusCode).toBe(422);
      const json = response.json();
      expect(json.error).toContain('inactive');
      await app.close();
    });

    it('returns 401 when header-secret authentication fails', async () => {
      mockWebhookRow = {
        ...mockWebhookRow!,
        auth_type: 'header-secret',
        secret_token: 'secret-auth-key',
        header_name: 'X-Webhook-Secret',
      };
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/order-created',
        headers: { 'x-webhook-secret': 'wrong-secret' },
        payload: { event: 'user_signup' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('accepts valid webhook and returns 202 Accepted in immediate mode', async () => {
      mockWebhookRow = {
        ...mockWebhookRow!,
        auth_type: 'header-secret',
        secret_token: 'super-secret',
        respond_mode: 'immediate',
      };
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/order-created',
        headers: { 'x-webhook-secret': 'super-secret' },
        payload: { orderId: 'ord_9988', total: 149.99 },
      });

      expect(response.statusCode).toBe(202);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.executionId).toBe('exec-mock-webhook-123');
      expect(json.status).toBe('running');
      await app.close();
    });

    it('waits and returns 200 OK with result in sync mode', async () => {
      mockWebhookRow = {
        ...mockWebhookRow!,
        auth_type: 'none',
        respond_mode: 'sync',
      };
      const app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/order-created',
        payload: { syncQuery: 'ping' },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.result).toBeDefined();
      expect(json.result.durationMs).toBe(42);
      await app.close();
    });
  });
});
