import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { WebhookTriggerConfig } from '@/types/nodeConfigs';

export interface WebhookTriggerOutput {
  payload: Record<string, unknown> | unknown;
  headers: Record<string, string>;
  query: Record<string, string>;
  method: string;
  triggeredAt: number;
  path?: string;
}

export class WebhookTriggerExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as WebhookTriggerConfig;
    const triggerData = ((context.triggerPayload || context.incomingPayload || {}) as {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string>;
      method?: string;
      timestamp?: number;
    });

    const payload = triggerData.body !== undefined ? triggerData.body : {};
    const headers = triggerData.headers || {};
    const query = triggerData.query || {};
    const method = triggerData.method || config.httpMethod || 'POST';
    const triggeredAt = triggerData.timestamp || Date.now();

    const propCount =
      typeof payload === 'object' && payload !== null
        ? Object.keys(payload).length
        : 1;

    context.emitLog(
      'info',
      `Webhook Trigger activated [${method}]: received ${propCount} payload property(ies) on path "${config.path || 'unknown'}".`
    );

    return {
      success: true,
      output: {
        payload,
        headers,
        query,
        method,
        triggeredAt,
        path: config.path,
      },
    };
  }
}
