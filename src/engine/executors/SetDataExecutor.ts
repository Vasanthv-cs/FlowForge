import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { SetDataConfig } from '@flowforge/workflow-schema';

export class SetDataExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as SetDataConfig;
    const { fields = [], mergeWithIncoming = true } = config || {};
    const input = context.incomingPayload;

    try {
      const outputObj: Record<string, unknown> = mergeWithIncoming && typeof input === 'object' && input !== null
        ? { ...input }
        : {};

      for (const field of fields) {
        if (!field.key || !field.key.trim()) continue;

        let parsedVal: unknown = field.value;
        switch (field.valueType) {
          case 'number': {
            const num = Number(field.value);
            if (isNaN(num)) {
              return {
                success: false,
                error: `Set Data error: Cannot parse "${field.value}" as number for key "${field.key}".`,
              };
            }
            parsedVal = num;
            break;
          }
          case 'boolean': {
            const valLower = String(field.value).toLowerCase().trim();
            parsedVal = valLower === 'true' || valLower === '1' || valLower === 'yes';
            break;
          }
          case 'json': {
            if (typeof field.value === 'string' && field.value.trim()) {
              parsedVal = JSON.parse(field.value);
            } else {
              parsedVal = field.value;
            }
            break;
          }
          case 'string':
          default:
            parsedVal = String(field.value);
            break;
        }

        outputObj[field.key.trim()] = parsedVal;
      }

      context.emitLog('info', `Set Data assigned ${fields.length} field(s).`);
      return {
        success: true,
        output: outputObj,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid field mapping';
      context.emitLog('error', `Set Data failed: ${msg}`);
      return {
        success: false,
        error: `Set Data error: ${msg}`,
      };
    }
  }
}
