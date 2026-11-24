import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { StringOperationsConfig } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

export class StringOperationsExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as StringOperationsConfig;
    const {
      operation = 'trim',
      inputPath = '',
      outputKey = 'result',
      findText = '',
      replaceWith = '',
      separator = ',',
    } = config || {};
    const input = context.incomingPayload;

    try {
      const raw = inputPath ? getNestedProperty(input, inputPath) : input;

      let result: unknown;
      switch (operation) {
        case 'trim': {
          result = String(raw ?? '').trim();
          break;
        }
        case 'uppercase': {
          result = String(raw ?? '').toUpperCase();
          break;
        }
        case 'lowercase': {
          result = String(raw ?? '').toLowerCase();
          break;
        }
        case 'replace': {
          const str = String(raw ?? '');
          // Literal replacement without ReDoS regex
          result = str.split(findText).join(replaceWith);
          break;
        }
        case 'split': {
          const str = String(raw ?? '');
          result = str.split(separator);
          break;
        }
        case 'join': {
          if (!Array.isArray(raw)) {
            return {
              success: false,
              error: `String Operations error: Join requires an array, received ${typeof raw}.`,
            };
          }
          result = raw.map(String).join(separator);
          break;
        }
        default: {
          return {
            success: false,
            error: `String Operations error: Unsupported operation "${operation}".`,
          };
        }
      }

      context.emitLog('info', `String Operation "${operation}" executed successfully.`);
      return {
        success: true,
        output: {
          [outputKey]: result,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      context.emitLog('error', `String Operations failed: ${msg}`);
      return {
        success: false,
        error: `String Operations error: ${msg}`,
      };
    }
  }
}
