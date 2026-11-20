import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { TransformDataConfig } from '@/types/nodeConfigs';

/**
 * Safely extracts a nested property using dot/bracket notation without eval.
 */
function getNestedProperty(obj: unknown, path: string): unknown {
  if (!obj || !path || path.trim() === '') return obj;

  // Normalize array access e.g. "users[0].name" -> ["users", "0", "name"]
  const keys = path
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

export class TransformExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as TransformDataConfig;
    const { mode = 'property-path', propertyPath = '', outputKey = 'result' } = config;
    const input = context.incomingPayload;

    try {
      let transformed: unknown;

      switch (mode) {
        case 'property-path': {
          transformed = propertyPath ? getNestedProperty(input, propertyPath) : input;
          break;
        }

        case 'json-parse': {
          // If input is an object containing text, or directly a string
          const targetStr =
            typeof input === 'string'
              ? input
              : typeof input.text === 'string'
                ? input.text
                : JSON.stringify(input);

          transformed = JSON.parse(targetStr);
          break;
        }

        case 'json-stringify': {
          transformed = JSON.stringify(input, null, 2);
          break;
        }

        case 'uppercase': {
          const raw = String(propertyPath ? getNestedProperty(input, propertyPath) ?? '' : JSON.stringify(input));
          transformed = raw.toUpperCase();
          break;
        }

        case 'lowercase': {
          const raw = String(propertyPath ? getNestedProperty(input, propertyPath) ?? '' : JSON.stringify(input));
          transformed = raw.toLowerCase();
          break;
        }

        case 'trim': {
          const raw = String(propertyPath ? getNestedProperty(input, propertyPath) ?? '' : JSON.stringify(input));
          transformed = raw.trim();
          break;
        }

        default:
          transformed = input;
          break;
      }

      context.emitLog(
        'info',
        `Transformed data using mode "${mode}". Output stored under key "${outputKey}".`,
      );

      return {
        success: true,
        output: {
          ...input,
          [outputKey]: transformed,
        },
      };
    } catch (err) {
      const errorMsg = `Transform error (${mode}): ${err instanceof Error ? err.message : 'Transformation failed'}`;
      context.emitLog('error', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
