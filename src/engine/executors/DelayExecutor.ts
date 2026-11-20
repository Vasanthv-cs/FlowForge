import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import { type DelayConfig, MAX_SAFE_DELAY_MS, MIN_SAFE_DELAY_MS } from '@/types/nodeConfigs';

export class DelayExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as DelayConfig;
    const rawDelay = typeof config.delayMs === 'number' ? config.delayMs : 1000;
    const delayMs = Math.max(MIN_SAFE_DELAY_MS, Math.min(rawDelay, MAX_SAFE_DELAY_MS));

    context.emitLog('info', `Pausing execution for ${delayMs.toLocaleString()}ms...`);

    const start = Date.now();

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve();
      }, delayMs);

      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Delay cancelled by workflow termination'));
        });
      }
    });

    const elapsed = Date.now() - start;
    context.emitLog('info', `Resumed execution after ${elapsed}ms.`);

    return {
      success: true,
      output: {
        ...context.incomingPayload,
        _delay: {
          requestedMs: delayMs,
          elapsedMs: elapsed,
        },
      },
    };
  }
}
