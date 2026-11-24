import crypto from 'node:crypto';
import { getSupabaseAdminClient } from '../supabase';
import { executionEngineService } from './executionEngineService';
import type { WorkflowRunResult } from '../../engine/types';

export interface WebhookIngestParams {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
  rawBody?: string;
}

export interface WebhookIngestResult {
  executionId: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  respondMode: 'immediate' | 'sync';
  runResult?: WorkflowRunResult;
}

export class WebhookService {
  /**
   * Verifies incoming webhook request authentication.
   */
  public verifyAuth(params: {
    authType: 'none' | 'header-secret' | 'bearer-token' | 'hmac-sha256';
    secretToken?: string | null;
    headerName?: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody?: string;
    body?: unknown;
  }): boolean {
    const { authType, secretToken, headerName = 'X-Webhook-Secret', headers, rawBody, body } = params;

    if (authType === 'none') {
      return true;
    }

    if (!secretToken) {
      // If authType is configured but secret is not set, reject for safety
      return false;
    }

    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string') {
        normalizedHeaders[k.toLowerCase()] = v;
      } else if (Array.isArray(v) && v.length > 0) {
        normalizedHeaders[k.toLowerCase()] = v[0];
      }
    }

    switch (authType) {
      case 'header-secret': {
        const received = normalizedHeaders[headerName.toLowerCase()];
        if (!received) return false;
        try {
          return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(secretToken));
        } catch {
          return false;
        }
      }

      case 'bearer-token': {
        const authHeader = normalizedHeaders['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return false;
        }
        const token = authHeader.substring(7).trim();
        try {
          return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secretToken));
        } catch {
          return false;
        }
      }

      case 'hmac-sha256': {
        const receivedSignature =
          normalizedHeaders[headerName.toLowerCase()] ||
          normalizedHeaders['x-hub-signature-256'] ||
          normalizedHeaders['x-signature-256'];
        if (!receivedSignature) return false;

        const payloadToSign =
          rawBody !== undefined
            ? rawBody
            : typeof body === 'string'
              ? body
              : JSON.stringify(body || {});

        const hmac = crypto.createHmac('sha256', secretToken);
        hmac.update(payloadToSign);
        const expectedSignature = hmac.digest('hex');

        // Check raw hex or "sha256=..." prefix
        const cleanReceived = receivedSignature.startsWith('sha256=')
          ? receivedSignature.substring(7)
          : receivedSignature;

        if (cleanReceived.length !== expectedSignature.length) {
          return false;
        }

        try {
          return crypto.timingSafeEqual(
            Buffer.from(cleanReceived),
            Buffer.from(expectedSignature)
          );
        } catch {
          return false;
        }
      }

      default:
        return false;
    }
  }

  /**
   * Processes an incoming webhook request and enqueues workflow execution.
   */
  public async handleWebhook(params: WebhookIngestParams): Promise<WebhookIngestResult> {
    const { path, method, headers, query, body, rawBody } = params;
    const supabase = getSupabaseAdminClient();

    // 1. Find matching webhook configuration
    const { data: webhookRow, error: findError } = await supabase
      .from('workflow_webhooks')
      .select('*, workflows!inner(id, workspace_id, is_active, name)')
      .eq('path', path)
      .maybeSingle();

    if (findError || !webhookRow) {
      const err = new Error(`Webhook endpoint "${path}" not found.`);
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    // 2. Validate HTTP Method
    const allowedMethod = webhookRow.http_method || 'POST';
    if (allowedMethod !== 'ALL' && allowedMethod.toUpperCase() !== method.toUpperCase()) {
      const err = new Error(
        `Method ${method} not allowed for this webhook. Expected ${allowedMethod}.`
      );
      (err as { statusCode?: number }).statusCode = 405;
      throw err;
    }

    // 3. Verify Workflow Active State
    const workflow = webhookRow.workflows as unknown as {
      id: string;
      workspace_id: string;
      is_active: boolean;
      name: string;
    };
    if (workflow.is_active === false) {
      const err = new Error(
        `Workflow "${workflow.name}" is currently inactive. Webhook execution skipped.`
      );
      (err as { statusCode?: number }).statusCode = 422;
      throw err;
    }

    // 4. Verify Authentication
    const isAuthorized = this.verifyAuth({
      authType: webhookRow.auth_type,
      secretToken: webhookRow.secret_token,
      headerName: webhookRow.header_name,
      headers,
      rawBody,
      body,
    });

    if (!isAuthorized) {
      const err = new Error('Unauthorized: Invalid or missing webhook credentials/signature.');
      (err as { statusCode?: number }).statusCode = 401;
      throw err;
    }

    // 5. Build trigger payload
    const triggerPayload = {
      body,
      headers: Object.fromEntries(
        Object.entries(headers).filter(
          ([k]) => !['authorization', 'cookie'].includes(k.toLowerCase())
        )
      ),
      query,
      method,
      path,
      timestamp: Date.now(),
    };

    const respondMode = (webhookRow.respond_mode || 'immediate') as 'immediate' | 'sync';

    // 6. Enqueue or Execute Workflow
    const execution = await executionEngineService.startWorkflowExecution({
      workspaceId: webhookRow.workspace_id,
      workflowId: webhookRow.workflow_id,
      triggerPayload,
      waitForCompletion: respondMode === 'sync',
    });

    return {
      executionId: execution.executionId,
      status: execution.status,
      respondMode,
      runResult: execution.result,
    };
  }

  /**
   * Synchronizes webhooks defined in a workflow graph to the database.
   */
  public async syncWorkflowWebhooks(
    workspaceId: string,
    workflowId: string,
    nodes: Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }>
  ): Promise<void> {
    const supabase = getSupabaseAdminClient();
    const webhookNodes = nodes.filter((n) => n.type === 'webhook-trigger');

    if (webhookNodes.length === 0) {
      // Remove any previously registered webhooks for this workflow
      const builder = supabase.from('workflow_webhooks');
      if (builder && typeof builder.delete === 'function') {
        await builder.delete().eq('workflow_id', workflowId);
      }
      return;
    }

    for (const node of webhookNodes) {
      const config = (node.data?.config || {}) as {
        path?: string;
        httpMethod?: 'POST' | 'GET' | 'PUT' | 'ALL';
        authType?: 'none' | 'header-secret' | 'bearer-token' | 'hmac-sha256';
        secret?: string;
        headerName?: string;
        respondMode?: 'immediate' | 'sync';
      };

      const path = config.path || `whk_${workflowId.substring(0, 8)}_${node.id}`;

      await supabase.from('workflow_webhooks').upsert(
        {
          workflow_id: workflowId,
          workspace_id: workspaceId,
          node_id: node.id,
          path,
          http_method: config.httpMethod || 'POST',
          auth_type: config.authType || 'none',
          secret_token: config.secret || null,
          header_name: config.headerName || 'X-Webhook-Secret',
          respond_mode: config.respondMode || 'immediate',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workflow_id,node_id' }
      );
    }
  }
}

export const webhookService = new WebhookService();
