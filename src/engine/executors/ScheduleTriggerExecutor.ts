import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { ScheduleTriggerConfig } from '@/types/nodeConfigs';

export interface ScheduleTriggerOutput {
  payload: Record<string, unknown> | unknown;
  scheduledTime: string;
  cron: string;
  timezone: string;
  triggeredAt: number;
}

export class ScheduleTriggerExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as ScheduleTriggerConfig;
    const triggerData = ((context.triggerPayload || context.incomingPayload || {}) as {
      scheduledTime?: string;
      cron?: string;
      payload?: unknown;
      timestamp?: number;
    });

    let defaultPayloadData: Record<string, unknown> = {};
    if (config.defaultPayload && config.defaultPayload.trim()) {
      try {
        defaultPayloadData = JSON.parse(config.defaultPayload);
      } catch (err) {
        context.emitLog(
          'warn',
          `Schedule default payload JSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}. Proceeding with empty payload.`
        );
      }
    }

    const payload = triggerData.payload !== undefined ? triggerData.payload : defaultPayloadData;
    const scheduledTime = triggerData.scheduledTime || new Date().toISOString();
    const cron = triggerData.cron || config.cron || '0 * * * *';
    const timezone = config.timezone || 'UTC';
    const triggeredAt = triggerData.timestamp || Date.now();

    context.emitLog(
      'info',
      `Schedule Trigger activated for cron "${cron}" (${timezone}) at ${scheduledTime}.`
    );

    return {
      success: true,
      output: {
        payload,
        scheduledTime,
        cron,
        timezone,
        triggeredAt,
      },
    };
  }
}
