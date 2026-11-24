import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { FilterDataConfig, FilterOperator } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

const MAX_ARRAY_ITEMS = 50000;

function evaluateFilterCondition(val: unknown, operator: FilterOperator, target: string): boolean {
  if (operator === 'is_empty') {
    return val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
  }
  if (operator === 'is_not_empty') {
    return val !== null && val !== undefined && val !== '' && (!Array.isArray(val) || val.length > 0);
  }

  // Boolean comparison
  if (typeof val === 'boolean') {
    const targetBool = target.toLowerCase() === 'true' || target === '1';
    return operator === 'equals' ? val === targetBool : val !== targetBool;
  }

  // Numeric comparison
  if (typeof val === 'number') {
    const targetNum = Number(target);
    if (!isNaN(targetNum)) {
      switch (operator) {
        case 'equals': return val === targetNum;
        case 'not_equals': return val !== targetNum;
        case 'greater_than': return val > targetNum;
        case 'greater_than_or_equal': return val >= targetNum;
        case 'less_than': return val < targetNum;
        case 'less_than_or_equal': return val <= targetNum;
        default: break;
      }
    }
  }

  // String comparison
  const strVal = String(val ?? '');
  switch (operator) {
    case 'equals': return strVal.toLowerCase() === target.toLowerCase();
    case 'not_equals': return strVal.toLowerCase() !== target.toLowerCase();
    case 'contains': return strVal.toLowerCase().includes(target.toLowerCase());
    case 'starts_with': return strVal.toLowerCase().startsWith(target.toLowerCase());
    case 'greater_than': return strVal > target;
    case 'less_than': return strVal < target;
    default: return false;
  }
}

export class FilterDataExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as FilterDataConfig;
    const {
      arrayPath = '',
      itemField = '',
      operator = 'equals',
      targetValue = '',
      outputKey = 'filtered',
    } = config || {};
    const input = context.incomingPayload;

    try {
      const target = arrayPath ? getNestedProperty(input, arrayPath) : input;

      if (!Array.isArray(target)) {
        return {
          success: false,
          error: `Filter Data error: Expected an array at path "${arrayPath || 'payload'}", received ${typeof target}.`,
        };
      }

      if (target.length > MAX_ARRAY_ITEMS) {
        return {
          success: false,
          error: `Filter Data error: Array length (${target.length}) exceeds safe maximum of ${MAX_ARRAY_ITEMS} items.`,
        };
      }

      const filtered = target.filter((item) => {
        const value = itemField ? getNestedProperty(item, itemField) : item;
        return evaluateFilterCondition(value, operator, targetValue);
      });

      context.emitLog(
        'info',
        `Filter Data matched ${filtered.length} of ${target.length} items (Operator: ${operator}).`
      );

      return {
        success: true,
        output: {
          [outputKey]: filtered,
          totalInputItems: target.length,
          matchedItems: filtered.length,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Filter failed';
      context.emitLog('error', `Filter Data failed: ${msg}`);
      return {
        success: false,
        error: `Filter Data error: ${msg}`,
      };
    }
  }
}
