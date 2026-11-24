import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { JsonStringifyConfig } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

export class JsonStringifyExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as JsonStringifyConfig;
    const {
      inputPath = '',
      outputKey = 'jsonString',
      prettyPrint = false,
      indentSpaces = 2,
    } = config || {};
    const input = context.incomingPayload;

    try {
      const target = inputPath ? getNestedProperty(input, inputPath) : input;
      const indent = prettyPrint ? Math.min(Math.max(indentSpaces, 0), 8) : undefined;
      const serialized = JSON.stringify(target, null, indent);

      if (serialized === undefined) {
        return {
          success: false,
          error: `JSON Stringify error: Value at path "${inputPath}" cannot be serialized to JSON.`,
        };
      }

      context.emitLog('info', `JSON Stringify serialized data into "${outputKey}".`);
      return {
        success: true,
        output: {
          [outputKey]: serialized,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Serialization error';
      context.emitLog('error', `JSON Stringify failed: ${msg}`);
      return {
        success: false,
        error: `JSON Stringify error: ${msg}`,
      };
    }
  }
}
