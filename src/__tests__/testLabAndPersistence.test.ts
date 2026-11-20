import { describe, it, expect, beforeEach } from 'vitest';
import { validateImportedWorkflow } from '../lib/workflowImportSchema';
import { idbStorage } from '../lib/indexedDb';
import type { TestScenario, TestAssertion, WorkflowVersion } from '../types/testLab';

describe('Stage 6: Workflow Import Schema Validation', () => {
  it('should accept a valid workflow export object', () => {
    const validData = {
      id: 'wf-123',
      name: 'Test Workflow',
      nodes: [
        {
          id: 'n-1',
          type: 'workflowNode',
          position: { x: 100, y: 100 },
          data: {
            label: 'Trigger Node',
            type: 'manual-trigger',
            category: 'trigger',
            description: 'Trigger',
            icon: 'Play',
            color: '#10b981',
            config: { payload: '{"msg": "hi"}' },
            inputs: [],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
            status: 'idle',
          },
        },
      ],
      edges: [
        {
          id: 'e-1',
          source: 'n-1',
          target: 'n-2',
        },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    };

    const result = validateImportedWorkflow(validData);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toBe('wf-123');
    expect(result.data?.nodes).toHaveLength(1);
    expect(result.data?.edges).toHaveLength(1);
  });

  it('should safely reject invalid JSON structures without crashing', () => {
    const invalidData1 = null;
    const invalidData2 = 'just a string';
    const invalidData3 = { nodes: 'not an array', edges: [] };
    const invalidData4 = {
      name: 'Bad Nodes',
      nodes: [{ id: '' }], // missing position and data
      edges: [],
    };

    expect(validateImportedWorkflow(invalidData1).success).toBe(false);
    expect(validateImportedWorkflow(invalidData2).success).toBe(false);
    expect(validateImportedWorkflow(invalidData3).success).toBe(false);
    expect(validateImportedWorkflow(invalidData4).success).toBe(false);
  });

  it('should report meaningful error messages on invalid input', () => {
    const invalidData = {
      nodes: [{ id: '1' }], // missing position & data
      edges: [],
    };

    const result = validateImportedWorkflow(invalidData);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid workflow schema');
  });
});

describe('Stage 6: IndexedDB Storage & Local Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should persist and retrieve workflow version snapshots', async () => {
    const version: WorkflowVersion = {
      id: 'ver-test-1',
      workflowId: 'wf-abc',
      versionTag: 'v1.0.0',
      description: 'Initial release',
      nodesCount: 3,
      edgesCount: 2,
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      savedAt: 12345678,
    };

    await idbStorage.saveVersion(version);
    const versions = await idbStorage.listVersions('wf-abc');

    expect(versions).toHaveLength(1);
    expect(versions[0].versionTag).toBe('v1.0.0');
    expect(versions[0].description).toBe('Initial release');
    expect(versions[0].nodesCount).toBe(3);
  });

  it('should persist, retrieve, and delete test scenarios', async () => {
    const scenario: TestScenario = {
      id: 'sc-1',
      workflowId: 'wf-abc',
      name: 'VIP User Flow',
      description: 'Tests vip branch',
      triggerPayload: { tier: 'vip', balance: 500 },
      assertions: [
        {
          id: 'as-1',
          targetNodeId: 'cond-node',
          targetProperty: 'branch',
          operator: 'equals',
          expectedValue: 'true',
        },
      ],
    };

    await idbStorage.saveTestScenario(scenario);
    let scenarios = await idbStorage.listTestScenarios('wf-abc');
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].name).toBe('VIP User Flow');

    // Delete scenario
    await idbStorage.deleteTestScenario('wf-abc', 'sc-1');
    scenarios = await idbStorage.listTestScenarios('wf-abc');
    expect(scenarios).toHaveLength(0);
  });
});

describe('Stage 6: Test Assertion Logic Evaluator', () => {
  const evaluateAssertion = (
    actual: unknown,
    assertion: TestAssertion,
  ): boolean => {
    switch (assertion.operator) {
      case 'equals':
        return String(actual).trim() === String(assertion.expectedValue).trim();
      case 'not_equals':
        return String(actual).trim() !== String(assertion.expectedValue).trim();
      case 'contains':
        return String(actual).includes(String(assertion.expectedValue));
      case 'greater_than':
        return Number(actual) > Number(assertion.expectedValue);
      case 'less_than':
        return Number(actual) < Number(assertion.expectedValue);
      case 'exists':
        return actual !== undefined && actual !== null;
      default:
        return false;
    }
  };

  it('evaluates equals and not_equals accurately', () => {
    const asEquals: TestAssertion = {
      id: '1',
      targetNodeId: 'n1',
      targetProperty: 'status',
      operator: 'equals',
      expectedValue: 'active',
    };
    expect(evaluateAssertion('active', asEquals)).toBe(true);
    expect(evaluateAssertion('inactive', asEquals)).toBe(false);

    const asNotEquals: TestAssertion = {
      id: '2',
      targetNodeId: 'n1',
      targetProperty: 'status',
      operator: 'not_equals',
      expectedValue: 'active',
    };
    expect(evaluateAssertion('pending', asNotEquals)).toBe(true);
    expect(evaluateAssertion('active', asNotEquals)).toBe(false);
  });

  it('evaluates contains accurately', () => {
    const asContains: TestAssertion = {
      id: '3',
      targetNodeId: 'n1',
      targetProperty: 'text',
      operator: 'contains',
      expectedValue: 'success',
    };
    expect(evaluateAssertion('The request was a success!', asContains)).toBe(true);
    expect(evaluateAssertion('Failure detected', asContains)).toBe(false);
  });

  it('evaluates numeric comparisons (greater_than and less_than)', () => {
    const asGt: TestAssertion = {
      id: '4',
      targetNodeId: 'n1',
      targetProperty: 'amount',
      operator: 'greater_than',
      expectedValue: '100',
    };
    expect(evaluateAssertion(150, asGt)).toBe(true);
    expect(evaluateAssertion(50, asGt)).toBe(false);

    const asLt: TestAssertion = {
      id: '5',
      targetNodeId: 'n1',
      targetProperty: 'amount',
      operator: 'less_than',
      expectedValue: '100',
    };
    expect(evaluateAssertion(25, asLt)).toBe(true);
    expect(evaluateAssertion(150, asLt)).toBe(false);
  });

  it('evaluates exists operator', () => {
    const asExists: TestAssertion = {
      id: '6',
      targetNodeId: 'n1',
      targetProperty: 'token',
      operator: 'exists',
      expectedValue: '',
    };
    expect(evaluateAssertion('abc-123', asExists)).toBe(true);
    expect(evaluateAssertion(0, asExists)).toBe(true);
    expect(evaluateAssertion(null, asExists)).toBe(false);
    expect(evaluateAssertion(undefined, asExists)).toBe(false);
  });
});
