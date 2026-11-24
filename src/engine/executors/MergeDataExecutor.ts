import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { MergeDataConfig, ConflictResolution } from '@flowforge/workflow-schema';

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  conflictResolution: ConflictResolution
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, sourceVal] of Object.entries(source)) {
    if (key in result) {
      if (conflictResolution === 'error') {
        throw new Error(`Merge conflict: key "${key}" exists in both objects.`);
      }
      if (conflictResolution === 'keep_original') {
        continue;
      }
    }

    const targetVal = result[key];
    if (
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal) &&
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
        conflictResolution
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

export class MergeDataExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as MergeDataConfig;
    const {
      strategy = 'shallow',
      conflictResolution = 'overwrite',
      secondaryData = '',
    } = config || {};
    const input = context.incomingPayload;

    try {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return {
          success: false,
          error: 'Merge Data error: Incoming payload must be an object.',
        };
      }

      let parsedSecondary: Record<string, unknown> = {};
      if (secondaryData && secondaryData.trim()) {
        const parsed = JSON.parse(secondaryData);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return {
            success: false,
            error: 'Merge Data error: Secondary data must be a valid JSON object.',
          };
        }
        parsedSecondary = parsed as Record<string, unknown>;
      }

      let merged: Record<string, unknown>;
      if (strategy === 'deep') {
        merged = deepMerge(input, parsedSecondary, conflictResolution);
      } else {
        // Shallow merge
        merged = { ...input };
        for (const [key, val] of Object.entries(parsedSecondary)) {
          if (key in merged) {
            if (conflictResolution === 'error') {
              return {
                success: false,
                error: `Merge Data error: Conflict detected on key "${key}".`,
              };
            }
            if (conflictResolution === 'keep_original') {
              continue;
            }
          }
          merged[key] = val;
        }
      }

      context.emitLog('info', `Merge Data completed using ${strategy} strategy.`);
      return {
        success: true,
        output: merged,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Merge failed';
      context.emitLog('error', `Merge Data failed: ${msg}`);
      return {
        success: false,
        error: `Merge Data error: ${msg}`,
      };
    }
  }
}
