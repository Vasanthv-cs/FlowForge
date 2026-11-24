import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { MathOperationsConfig } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

function resolveNumber(val: unknown, fallbackStr: string, inputPayload: Record<string, unknown>): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.trim()) {
    // Check if it's a property path in inputPayload
    const nested = getNestedProperty(inputPayload, val);
    if (typeof nested === 'number') return nested;
    const fromNested = Number(nested);
    if (!isNaN(fromNested)) return fromNested;

    const parsed = Number(val);
    if (!isNaN(parsed)) return parsed;
  }
  const fallbackNum = Number(fallbackStr);
  return isNaN(fallbackNum) ? 0 : fallbackNum;
}

export class MathOperationsExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as MathOperationsConfig;
    const {
      operation = 'add',
      leftOperand = '0',
      rightOperand = '0',
      precision = 2,
      outputKey = 'result',
    } = config || {};
    const input = context.incomingPayload;

    try {
      const leftVal = getNestedProperty(input, leftOperand);
      const left = resolveNumber(leftVal, leftOperand, input);

      const rightVal = rightOperand ? getNestedProperty(input, rightOperand) : undefined;
      const right = resolveNumber(rightVal, rightOperand || '0', input);

      let calcResult: number;
      switch (operation) {
        case 'add':
          calcResult = left + right;
          break;
        case 'subtract':
          calcResult = left - right;
          break;
        case 'multiply':
          calcResult = left * right;
          break;
        case 'divide':
          if (right === 0) {
            return {
              success: false,
              error: 'Math Operations error: Division by zero is undefined.',
            };
          }
          calcResult = left / right;
          break;
        case 'round':
          calcResult = Number(left.toFixed(precision));
          break;
        case 'min':
          calcResult = Math.min(left, right);
          break;
        case 'max':
          calcResult = Math.max(left, right);
          break;
        default:
          return {
            success: false,
            error: `Math Operations error: Unsupported operation "${operation}".`,
          };
      }

      // Apply rounding if floating point
      const factor = Math.pow(10, Math.min(Math.max(precision, 0), 10));
      const rounded = Math.round(calcResult * factor) / factor;

      context.emitLog('info', `Math Operation "${operation}" evaluated to ${rounded}.`);
      return {
        success: true,
        output: {
          [outputKey]: rounded,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Math evaluation failed';
      context.emitLog('error', `Math Operations failed: ${msg}`);
      return {
        success: false,
        error: `Math Operations error: ${msg}`,
      };
    }
  }
}
