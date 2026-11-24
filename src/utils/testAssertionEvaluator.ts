import type {
  TestAssertion,
  AssertionResult,
  TestScenario,
} from '@/types/testLab';
import type { WorkflowNode } from '@/types/workflow';

/**
 * Safely extracts a nested property using dot and bracket notation without eval.
 * Example: "items[0].user.name" or "_condition.branch"
 */
export function resolveProperty(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || !path || path.trim() === '') return undefined;

  const keys = path
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  let cur: unknown = obj;
  for (const key of keys) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return cur;
}

/**
 * Performs deep equality comparison between two arbitrary values without eval.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }

  return true;
}

/**
 * Evaluates a single assertion against actual output data with strict type awareness.
 *
 * Rules:
 * - Boolean false is NEVER treated as missing or empty.
 * - Numbers and numeric strings (e.g. 42 vs "42") are preserved as distinct types.
 * - No silent type coercion unless explicitly specified or compatible with the operator.
 */
export function evaluateAssertion(actual: unknown, assertion: TestAssertion): AssertionResult {
  const { operator, expectedValue, expectedType, targetProperty } = assertion;

  // 1. Operator: exists
  if (operator === 'exists') {
    const passed = actual !== undefined && actual !== null;
    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: Property "${targetProperty}" exists (value: ${JSON.stringify(actual)}).`
        : `Assertion Failed: Expected property "${targetProperty}" to exist, but got ${actual === undefined ? 'undefined' : 'null'}.`,
    };
  }

  // 2. Operator: not_exists
  if (operator === 'not_exists') {
    const passed = actual === undefined || actual === null;
    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: Property "${targetProperty}" does not exist.`
        : `Assertion Failed: Expected property "${targetProperty}" to not exist, but received value: ${JSON.stringify(actual)}.`,
    };
  }

  // 3. If property does not exist on target for any other operator
  if (actual === undefined) {
    return {
      assertion,
      passed: false,
      actualValue: undefined,
      message: `Assertion Failed: Property "${targetProperty}" was not found on node output (got undefined).`,
    };
  }

  // 4. Operator: is_true
  if (operator === 'is_true') {
    const passed = actual === true;
    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" is true.`
        : `Assertion Failed: Expected boolean true, but got ${typeof actual} ${JSON.stringify(actual)}.`,
    };
  }

  // 5. Operator: is_false
  if (operator === 'is_false') {
    const passed = actual === false;
    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" is false.`
        : `Assertion Failed: Expected boolean false, but got ${typeof actual} ${JSON.stringify(actual)}.`,
    };
  }

  // 6. Array / String Length Operators: length_equals, length_greater_than, length_less_than
  if (
    operator === 'length_equals' ||
    operator === 'length_greater_than' ||
    operator === 'length_less_than'
  ) {
    const expectedLen = Number(expectedValue);
    if (isNaN(expectedLen)) {
      return {
        assertion,
        passed: false,
        actualValue: actual,
        message: `Assertion Failed: Expected length must be a valid number, got "${expectedValue}".`,
      };
    }

    let actualLen: number | undefined;
    if (Array.isArray(actual)) {
      actualLen = actual.length;
    } else if (typeof actual === 'string') {
      actualLen = actual.length;
    } else if (typeof actual === 'object' && actual !== null) {
      actualLen = Object.keys(actual).length;
    }

    if (actualLen === undefined) {
      return {
        assertion,
        passed: false,
        actualValue: actual,
        message: `Assertion Failed: Cannot check length on type ${typeof actual} (expected Array, String, or Object).`,
      };
    }

    let passed = false;
    if (operator === 'length_equals') passed = actualLen === expectedLen;
    else if (operator === 'length_greater_than') passed = actualLen > expectedLen;
    else if (operator === 'length_less_than') passed = actualLen < expectedLen;

    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" length (${actualLen}) ${operator} ${expectedLen}.`
        : `Assertion Failed: Expected length to be ${operator} ${expectedLen}, but got length ${actualLen}.`,
    };
  }

  // 7. Operator: contains / not_contains
  if (operator === 'contains' || operator === 'not_contains') {
    let containsMatch: boolean;

    if (Array.isArray(actual)) {
      // Check if array has an element matching expected value
      containsMatch = actual.some((item) => {
        if (typeof item === 'string') {
          return item.toLowerCase().includes(expectedValue.toLowerCase());
        }
        return String(item) === expectedValue;
      });
    } else if (typeof actual === 'string') {
      containsMatch = actual.toLowerCase().includes(expectedValue.toLowerCase());
    } else if (typeof actual === 'object' && actual !== null) {
      // Check key existence in object
      containsMatch = Object.prototype.hasOwnProperty.call(actual, expectedValue);
    } else {
      containsMatch = String(actual).toLowerCase().includes(expectedValue.toLowerCase());
    }

    const passed = operator === 'contains' ? containsMatch : !containsMatch;
    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" ${operator === 'contains' ? 'contains' : 'does not contain'} "${expectedValue}".`
        : `Assertion Failed: Expected "${targetProperty}" to ${operator === 'contains' ? 'contain' : 'not contain'} "${expectedValue}", but actual value was ${JSON.stringify(actual)}.`,
    };
  }

  // 8. Relational Operators: greater_than, less_than, greater_than_or_equal, less_than_or_equal
  if (
    operator === 'greater_than' ||
    operator === 'less_than' ||
    operator === 'greater_than_or_equal' ||
    operator === 'less_than_or_equal'
  ) {
    const actNum = typeof actual === 'number' ? actual : Number(actual);
    const expNum = Number(expectedValue);

    if (isNaN(actNum) || isNaN(expNum) || typeof actual === 'boolean') {
      return {
        assertion,
        passed: false,
        actualValue: actual,
        message: `Assertion Failed: Relational operator "${operator}" requires numeric values. Received actual (${typeof actual}: ${JSON.stringify(actual)}) and expected ("${expectedValue}").`,
      };
    }

    let passed = false;
    switch (operator) {
      case 'greater_than':
        passed = actNum > expNum;
        break;
      case 'less_than':
        passed = actNum < expNum;
        break;
      case 'greater_than_or_equal':
        passed = actNum >= expNum;
        break;
      case 'less_than_or_equal':
        passed = actNum <= expNum;
        break;
    }

    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" (${actNum}) ${operator} ${expNum}.`
        : `Assertion Failed: Expected "${targetProperty}" (${actNum}) to be ${operator} ${expNum}.`,
    };
  }

  // 9. Operator: equals / not_equals with Strict Type Preservation
  if (operator === 'equals' || operator === 'not_equals') {
    // A. Explicit expectedType provided by user
    if (expectedType) {
      if (expectedType === 'number') {
        const expNum = Number(expectedValue);
        if (typeof actual !== 'number') {
          const passed = operator === 'not_equals';
          return {
            assertion,
            passed,
            actualValue: actual,
            message: passed
              ? `Passed: "${targetProperty}" is not number ${expNum} (actual type is ${typeof actual}).`
              : `Assertion Failed: Type mismatch. Expected number ${expNum}, but received ${typeof actual} ${JSON.stringify(actual)}.`,
          };
        }
        const passed = operator === 'equals' ? actual === expNum : actual !== expNum;
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" == ${actual}.`
            : `Assertion Failed: Expected number ${expNum}, but got ${actual}.`,
        };
      }

      if (expectedType === 'string') {
        if (typeof actual !== 'string') {
          const passed = operator === 'not_equals';
          return {
            assertion,
            passed,
            actualValue: actual,
            message: passed
              ? `Passed: "${targetProperty}" is not string "${expectedValue}" (actual type is ${typeof actual}).`
              : `Assertion Failed: Type mismatch. Expected string "${expectedValue}", but received ${typeof actual} ${JSON.stringify(actual)}.`,
          };
        }
        const passed = operator === 'equals' ? actual === expectedValue : actual !== expectedValue;
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" == "${actual}".`
            : `Assertion Failed: Expected string "${expectedValue}", but got "${actual}".`,
        };
      }

      if (expectedType === 'boolean') {
        const expBool = expectedValue.trim().toLowerCase() === 'true';
        if (typeof actual !== 'boolean') {
          const passed = operator === 'not_equals';
          return {
            assertion,
            passed,
            actualValue: actual,
            message: passed
              ? `Passed: "${targetProperty}" is not boolean ${expBool} (actual type is ${typeof actual}).`
              : `Assertion Failed: Type mismatch. Expected boolean ${expBool}, but received ${typeof actual} ${JSON.stringify(actual)}.`,
          };
        }
        const passed = operator === 'equals' ? actual === expBool : actual !== expBool;
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" == ${actual}.`
            : `Assertion Failed: Expected boolean ${expBool}, but got ${actual}.`,
        };
      }

      if (expectedType === 'json') {
        let expObj: unknown;
        try {
          expObj = JSON.parse(expectedValue);
        } catch {
          return {
            assertion,
            passed: false,
            actualValue: actual,
            message: `Assertion Failed: Expected value is not valid JSON ("${expectedValue}").`,
          };
        }
        const isEqual = deepEqual(actual, expObj);
        const passed = operator === 'equals' ? isEqual : !isEqual;
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" matches expected JSON structure.`
            : `Assertion Failed: Object structure does not match expected JSON.`,
        };
      }
    }

    // B. Infer from actual value type when expectedType is not explicitly declared
    const isActualBool = typeof actual === 'boolean' || actual === 'true' || actual === 'false';
    const expectedLower = String(expectedValue).trim().toLowerCase();
    const isExpectedBool = expectedLower === 'true' || expectedLower === 'false';

    if (isActualBool && isExpectedBool) {
      const actBool = actual === true || actual === 'true';
      const expBool = expectedLower === 'true';

      let passed = false;
      if (operator === 'equals') passed = actBool === expBool;
      else if (operator === 'not_equals') passed = actBool !== expBool;

      return {
        assertion,
        passed,
        actualValue: actual,
        message: passed
          ? `Passed: "${targetProperty}" == ${actual}`
          : `Assertion Failed: Expected ${expBool}, but got ${actBool}`,
      };
    }

    if (typeof actual === 'boolean') {
      const passed = operator === 'not_equals';
      return {
        assertion,
        passed,
        actualValue: actual,
        message: passed
          ? `Passed: "${targetProperty}" (${actual}) != "${expectedValue}".`
          : `Assertion Failed: Expected "${expectedValue}" (non-boolean), but actual property is boolean ${actual}.`,
      };
    }

    if (typeof actual === 'number') {
      const expTrim = String(expectedValue).trim();
      const expNum = Number(expTrim);

      // If expectedValue is not a valid number or empty, fail type check on equals
      if (isNaN(expNum) || expTrim === '') {
        const passed = operator === 'not_equals';
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" (${actual}) != "${expectedValue}".`
            : `Assertion Failed: Expected non-numeric string "${expectedValue}", but got number ${actual}.`,
        };
      }

      const passed = operator === 'equals' ? actual === expNum : actual !== expNum;
      return {
        assertion,
        passed,
        actualValue: actual,
        message: passed
          ? `Passed: "${targetProperty}" (${actual}) ${operator === 'equals' ? '==' : '!='} ${expectedValue}.`
          : `Assertion Failed: Expected number ${expNum}, but got number ${actual}.`,
      };
    }

    if (typeof actual === 'object' && actual !== null) {
      try {
        const parsedExpected = JSON.parse(expectedValue);
        const isEqual = deepEqual(actual, parsedExpected);
        const passed = operator === 'equals' ? isEqual : !isEqual;
        return {
          assertion,
          passed,
          actualValue: actual,
          message: passed
            ? `Passed: "${targetProperty}" matches expected object structure.`
            : `Assertion Failed: Expected object to match, but received: ${JSON.stringify(actual)}.`,
        };
      } catch {
        // Fall through to string comparison
      }
    }

    // Default: string equality
    const actStr = String(actual);
    const expStr = String(expectedValue);
    const isEqual = actStr === expStr || actStr.trim().toLowerCase() === expStr.trim().toLowerCase();
    const passed = operator === 'equals' ? isEqual : !isEqual;

    return {
      assertion,
      passed,
      actualValue: actual,
      message: passed
        ? `Passed: "${targetProperty}" == "${actual}".`
        : `Assertion Failed: Expected "${expectedValue}", but got "${actual}".`,
    };
  }

  return {
    assertion,
    passed: false,
    actualValue: actual,
    message: `Unsupported assertion operator: "${operator}".`,
  };
}

/**
 * Reconciles scenario assertions with the currently loaded workflow nodes.
 * Fixes broken, blank, or obsolete targetNodeIds.
 *
 * Guarantees:
 * 1. If an assertion's targetNodeId is not found in nodes, automatically matches by node type (e.g. condition),
 *    or links to the first valid node.
 * 2. Never leaves targetNodeId blank if nodes are present.
 * 3. Preserves valid selected nodes across scenarios and modal reopening.
 */
export function reconcileScenarioAssertions(
  scenarios: TestScenario[],
  nodes: WorkflowNode[],
): { reconciled: TestScenario[]; hasChanges: boolean } {
  if (nodes.length === 0) {
    return { reconciled: scenarios, hasChanges: false };
  }

  let hasChanges = false;
  const conditionNode = nodes.find((n) => n.data.type === 'condition');
  const fallbackNodeId = conditionNode ? conditionNode.id : nodes[0].id;

  const reconciled = scenarios.map((sc) => {
    let scChanged = false;
    const assertions = sc.assertions.map((as) => {
      const nodeExists = nodes.some((n) => n.id === as.targetNodeId);
      if (!nodeExists || !as.targetNodeId) {
        scChanged = true;
        hasChanges = true;

        // Auto-reconcile targetNodeId intelligently based on property or type
        let targetId = fallbackNodeId;
        if (as.targetProperty.startsWith('_condition') && conditionNode) {
          targetId = conditionNode.id;
        } else if (as.targetProperty.startsWith('status') || as.targetProperty.startsWith('data')) {
          const httpOrDataNode = nodes.find(
            (n) => n.data.type === 'http-request' || n.data.category === 'data',
          );
          if (httpOrDataNode) targetId = httpOrDataNode.id;
        }

        return { ...as, targetNodeId: targetId };
      }
      return as;
    });

    if (scChanged) {
      return { ...sc, assertions };
    }
    return sc;
  });

  return { reconciled, hasChanges };
}
