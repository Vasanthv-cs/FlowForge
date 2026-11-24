import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { JsonParseConfig } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

export class JsonParseExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as JsonParseConfig;
    const { inputPath = '', outputKey = 'parsed' } = config || {};
    const input = context.incomingPayload;

    try {
      const rawValue = inputPath ? getNestedProperty(input, inputPath) : input;

      if (rawValue === undefined || rawValue === null) {
        return {
          success: false,
          error: `JSON Parse error: No data found at path "${inputPath}".`,
        };
      }

      let parsed: unknown;
      if (typeof rawValue === 'object') {
        // Already structured data
        parsed = rawValue;
      } else if (typeof rawValue === 'string') {
        if (!rawValue.trim()) {
          return {
            success: false,
            error: 'JSON Parse error: Cannot parse empty string.',
          };
        }
        parsed = JSON.parse(rawValue);
      } else {
        return {
          success: false,
          error: `JSON Parse error: Expected string or object at path "${inputPath}", received ${typeof rawValue}.`,
        };
      }

      context.emitLog('info', `JSON Parse parsed data into "${outputKey}".`);
      return {
        success: true,
        output: {
          [outputKey]: parsed,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON string';
      context.emitLog('error', `JSON Parse failed: ${msg}`);
      return {
        success: false,
        error: `JSON Parse error: ${msg}`,
      };
    }
  }
}
