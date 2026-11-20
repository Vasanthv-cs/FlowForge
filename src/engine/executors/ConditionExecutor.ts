import type { NodeExecutor } from './BaseExecutor';
import type { ExecutionContext, NodeExecutionResult } from '../types';
import type { ConditionConfig } from '@/types/nodeConfigs';

export class ConditionExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as ConditionConfig;
    const { leftOperand = '', operator = 'equals', rightOperand = '' } = config;
    const input = context.incomingPayload;

    // Resolve left value from incoming data payload or literal
    let leftValue: unknown = input[leftOperand];
    if (leftValue === undefined && typeof input === 'object' && input !== null) {
      // Check if leftOperand is dot-notation path
      const parts = leftOperand.split('.');
      let cur: unknown = input;
      for (const p of parts) {
        if (cur && typeof cur === 'object') {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          cur = undefined;
          break;
        }
      }
      leftValue = cur !== undefined ? cur : leftOperand;
    } else if (leftValue === undefined) {
      leftValue = leftOperand;
    }

    let isMatch: boolean;

    switch (operator) {
      case 'equals': {
        // Support numeric and string equivalence
        isMatch =
          String(leftValue).trim().toLowerCase() ===
          String(rightOperand).trim().toLowerCase();
        break;
      }

      case 'not_equals': {
        isMatch =
          String(leftValue).trim().toLowerCase() !==
          String(rightOperand).trim().toLowerCase();
        break;
      }

      case 'greater_than': {
        const numLeft = Number(leftValue);
        const numRight = Number(rightOperand);
        isMatch = !isNaN(numLeft) && !isNaN(numRight) && numLeft > numRight;
        break;
      }

      case 'less_than': {
        const numLeft = Number(leftValue);
        const numRight = Number(rightOperand);
        isMatch = !isNaN(numLeft) && !isNaN(numRight) && numLeft < numRight;
        break;
      }

      case 'contains': {
        if (Array.isArray(leftValue)) {
          isMatch = leftValue.some(
            (item) => String(item).toLowerCase() === String(rightOperand).toLowerCase(),
          );
        } else {
          isMatch = String(leftValue)
            .toLowerCase()
            .includes(String(rightOperand).toLowerCase());
        }
        break;
      }

      case 'starts_with': {
        isMatch = String(leftValue)
          .toLowerCase()
          .startsWith(String(rightOperand).toLowerCase());
        break;
      }

      case 'is_empty': {
        isMatch =
          leftValue === null ||
          leftValue === undefined ||
          leftValue === '' ||
          (Array.isArray(leftValue) && leftValue.length === 0) ||
          (typeof leftValue === 'object' && Object.keys(leftValue).length === 0);
        break;
      }

      case 'is_not_empty': {
        isMatch = !(
          leftValue === null ||
          leftValue === undefined ||
          leftValue === '' ||
          (Array.isArray(leftValue) && leftValue.length === 0) ||
          (typeof leftValue === 'object' && Object.keys(leftValue).length === 0)
        );
        break;
      }

      default:
        isMatch = false;
        break;
    }

    const branch = isMatch ? 'true' : 'false';
    context.emitLog(
      'info',
      `Condition evaluated "${leftOperand}" (${JSON.stringify(leftValue)}) ${operator} "${rightOperand}" → ${branch.toUpperCase()} branch.`,
    );

    return {
      success: true,
      selectedBranch: branch,
      output: {
        ...input,
        _condition: {
          evaluatedLeft: leftValue,
          operator,
          evaluatedRight: rightOperand,
          passed: isMatch,
          branch,
        },
      },
    };
  }
}
