import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { ConsoleOutputConfig } from '@/types/nodeConfigs';

export class ConsoleOutputExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as ConsoleOutputConfig;
    const level = config.level ?? 'info';
    const prefix = config.prefix?.trim() ? `[${config.prefix.trim()}] ` : '';
    const payload = context.incomingPayload;

    const payloadSummary =
      typeof payload === 'object' && payload !== null
        ? JSON.stringify(payload, null, 2)
        : String(payload);

    context.emitLog(
      level,
      `${prefix}Console Output: ${payloadSummary}`,
    );

    return {
      success: true,
      output: { ...payload },
    };
  }
}
