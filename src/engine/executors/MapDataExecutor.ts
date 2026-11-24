import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { MapDataConfig } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

const MAX_ARRAY_ITEMS = 50000;

export class MapDataExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as MapDataConfig;
    const { arrayPath = '', mappings = [], outputKey = 'mapped' } = config || {};
    const input = context.incomingPayload;

    try {
      const target = arrayPath ? getNestedProperty(input, arrayPath) : input;

      if (!Array.isArray(target)) {
        return {
          success: false,
          error: `Map Data error: Expected an array at path "${arrayPath || 'payload'}", received ${typeof target}.`,
        };
      }

      if (target.length > MAX_ARRAY_ITEMS) {
        return {
          success: false,
          error: `Map Data error: Array length (${target.length}) exceeds safe maximum of ${MAX_ARRAY_ITEMS} items.`,
        };
      }

      const mapped = target.map((item) => {
        if (typeof item !== 'object' || item === null) {
          return item;
        }

        const newItem: Record<string, unknown> = {};
        for (const mapping of mappings) {
          if (!mapping.targetField || !mapping.targetField.trim()) continue;
          newItem[mapping.targetField.trim()] = getNestedProperty(item, mapping.sourceField);
        }

        // If no mappings defined, pass item through
        return mappings.length > 0 ? newItem : item;
      });

      context.emitLog('info', `Map Data transformed ${mapped.length} item(s).`);
      return {
        success: true,
        output: {
          [outputKey]: mapped,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mapping failed';
      context.emitLog('error', `Map Data failed: ${msg}`);
      return {
        success: false,
        error: `Map Data error: ${msg}`,
      };
    }
  }
}
