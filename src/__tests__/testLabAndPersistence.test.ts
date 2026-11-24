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

import {
  evaluateAssertion,
  resolveProperty,
  reconcileScenarioAssertions,
} from '../utils/testAssertionEvaluator';
import type { WorkflowNode } from '../types/workflow';

describe('Stage 6: Test Assertion Logic Evaluator', () => {
  it('evaluates equals and not_equals accurately', () => {
    const asEquals: TestAssertion = {
      id: '1',
      targetNodeId: 'n1',
      targetProperty: 'status',
      operator: 'equals',
      expectedValue: 'active',
    };
    expect(evaluateAssertion('active', asEquals).passed).toBe(true);
    expect(evaluateAssertion('inactive', asEquals).passed).toBe(false);

    const asNotEquals: TestAssertion = {
      id: '2',
      targetNodeId: 'n1',
      targetProperty: 'status',
      operator: 'not_equals',
      expectedValue: 'active',
    };
    expect(evaluateAssertion('pending', asNotEquals).passed).toBe(true);
    expect(evaluateAssertion('active', asNotEquals).passed).toBe(false);
  });

  it('evaluates contains accurately', () => {
    const asContains: TestAssertion = {
      id: '3',
      targetNodeId: 'n1',
      targetProperty: 'text',
      operator: 'contains',
      expectedValue: 'success',
    };
    expect(evaluateAssertion('The request was a success!', asContains).passed).toBe(true);
    expect(evaluateAssertion('Failure detected', asContains).passed).toBe(false);
  });

  it('evaluates numeric comparisons (greater_than and less_than)', () => {
    const asGt: TestAssertion = {
      id: '4',
      targetNodeId: 'n1',
      targetProperty: 'amount',
      operator: 'greater_than',
      expectedValue: '100',
    };
    expect(evaluateAssertion(150, asGt).passed).toBe(true);
    expect(evaluateAssertion(50, asGt).passed).toBe(false);

    const asLt: TestAssertion = {
      id: '5',
      targetNodeId: 'n1',
      targetProperty: 'amount',
      operator: 'less_than',
      expectedValue: '100',
    };
    expect(evaluateAssertion(25, asLt).passed).toBe(true);
    expect(evaluateAssertion(150, asLt).passed).toBe(false);
  });

  it('evaluates exists operator', () => {
    const asExists: TestAssertion = {
      id: '6',
      targetNodeId: 'n1',
      targetProperty: 'token',
      operator: 'exists',
      expectedValue: '',
    };
    expect(evaluateAssertion('abc-123', asExists).passed).toBe(true);
    expect(evaluateAssertion(0, asExists).passed).toBe(true);
    expect(evaluateAssertion(null, asExists).passed).toBe(false);
    expect(evaluateAssertion(undefined, asExists).passed).toBe(false);
  });

  /* ── Regression Suite for Test Lab Assertion Fix ── */
  it('correctly evaluates _condition.branch === false for string and boolean values', () => {
    const asConditionFalse: TestAssertion = {
      id: 'as-false',
      targetNodeId: 'node-cond',
      targetProperty: '_condition.branch',
      operator: 'equals',
      expectedValue: 'false',
    };

    // Evaluated against string 'false' from condition node output
    const resStringFalse = evaluateAssertion('false', asConditionFalse);
    expect(resStringFalse.passed).toBe(true);
    expect(resStringFalse.actualValue).toBe('false');

    // Evaluated against boolean false (e.g., from _condition.passed)
    const resBoolFalse = evaluateAssertion(false, asConditionFalse);
    expect(resBoolFalse.passed).toBe(true);
    expect(resBoolFalse.actualValue).toBe(false);

    // Correctly fails when actual is 'true' or true
    const resFailTrue = evaluateAssertion('true', asConditionFalse);
    expect(resFailTrue.passed).toBe(false);
    expect(resFailTrue.message).toContain('Assertion Failed: Expected false, but got true');
  });

  it('correctly evaluates _condition.branch === true for string and boolean values', () => {
    const asConditionTrue: TestAssertion = {
      id: 'as-true',
      targetNodeId: 'node-cond',
      targetProperty: '_condition.branch',
      operator: 'equals',
      expectedValue: 'true',
    };

    // Passes when actual is 'true'
    expect(evaluateAssertion('true', asConditionTrue).passed).toBe(true);
    // Passes when actual is boolean true
    expect(evaluateAssertion(true, asConditionTrue).passed).toBe(true);

    // Fails when actual is 'false' or false
    const resFail = evaluateAssertion('false', asConditionTrue);
    expect(resFail.passed).toBe(false);
    expect(resFail.message).toContain('Assertion Failed: Expected true, but got false');
  });

  it('handles missing property on node output by returning passed: false and clear message', () => {
    const asMissing: TestAssertion = {
      id: 'as-miss',
      targetNodeId: 'node-cond',
      targetProperty: 'nonExistentProperty.deep',
      operator: 'equals',
      expectedValue: 'something',
    };

    const res = evaluateAssertion(undefined, asMissing);
    expect(res.passed).toBe(false);
    expect(res.actualValue).toBeUndefined();
    expect(res.message).toContain('Property "nonExistentProperty.deep" was not found on node output');
  });

  it('resolves nested dot-notation properties safely using resolveProperty', () => {
    const outputData = {
      user: { id: 101, details: { role: 'admin' } },
      _condition: { branch: 'false', passed: false },
    };

    expect(resolveProperty(outputData, 'user.details.role')).toBe('admin');
    expect(resolveProperty(outputData, '_condition.branch')).toBe('false');
    expect(resolveProperty(outputData, '_condition.passed')).toBe(false);
    expect(resolveProperty(outputData, 'unknown.path')).toBeUndefined();
    expect(resolveProperty(null, '_condition.branch')).toBeUndefined();
  });

  it('reconciles scenario assertions with valid workflow nodes and preserves selection', async () => {
    const mockNodes: WorkflowNode[] = [
      {
        id: 'node-manual-1',
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Manual Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          description: '',
          icon: 'Play',
          color: '#10b981',
          config: {},
          inputs: [],
          outputs: [],
          status: 'idle',
        },
      },
      {
        id: 'node-condition-2',
        type: 'workflowNode',
        position: { x: 200, y: 0 },
        data: {
          label: 'Condition Check',
          type: 'condition',
          category: 'logic',
          description: '',
          icon: 'GitBranch',
          color: '#f59e0b',
          config: {},
          inputs: [],
          outputs: [],
          status: 'idle',
        },
      },
    ];

    // Scenario referencing an obsolete or missing node ID ("node-1")
    const scenarios: TestScenario[] = [
      {
        id: 'sc-1',
        workflowId: 'wf-test',
        name: 'Obsolete Target Scenario',
        description: 'Scenario with invalid targetNodeId',
        triggerPayload: { amount: 50 },
        assertions: [
          {
            id: 'as-1',
            targetNodeId: 'node-1', // obsolete ID not in mockNodes
            targetProperty: '_condition.branch',
            operator: 'equals',
            expectedValue: 'false',
          },
        ],
      },
    ];

    const { reconciled, hasChanges } = reconcileScenarioAssertions(scenarios, mockNodes);
    expect(hasChanges).toBe(true);
    // Condition assertion must automatically reconcile to the existing condition node ID
    expect(reconciled[0].assertions[0].targetNodeId).toBe('node-condition-2');

    // Persist and restore through idbStorage to verify targetNodeId remains intact
    await idbStorage.saveTestScenario(reconciled[0]);
    const retrieved = await idbStorage.listTestScenarios('wf-test');
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].assertions[0].targetNodeId).toBe('node-condition-2');
    expect(retrieved[0].assertions[0].expectedValue).toBe('false');

    // Clean up test DB
    await idbStorage.deleteTestScenario('wf-test', 'sc-1');
  });
});
