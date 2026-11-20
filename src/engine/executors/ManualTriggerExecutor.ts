import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { ManualTriggerConfig } from '@/types/nodeConfigs';

export class ManualTriggerExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as ManualTriggerConfig;
    let payload: Record<string, unknown> = {};

    if (config.payload && config.payload.trim()) {
      try {
        payload = JSON.parse(config.payload);
      } catch (err) {
        const errorMsg = `Manual Trigger JSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`;
        context.emitLog('error', errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }
    }

    context.emitLog(
      'info',
      `Manual Trigger activated with ${Object.keys(payload).length} payload property(ies).`,
    );

    return {
      success: true,
      output: {
        payload,
        triggeredAt: Date.now(),
      },
    };
  }
}
