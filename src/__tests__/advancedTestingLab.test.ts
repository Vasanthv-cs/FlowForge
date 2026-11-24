import { describe, it, expect, vi } from 'vitest';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import type {
  TestScenario,
  TestAssertion,
} from '@/types/testLab';
import {
  evaluateAssertion,
  resolveProperty,
  reconcileScenarioAssertions,
  deepEqual,
} from '@/utils/testAssertionEvaluator';
import { validateWorkflowForTesting } from '@/utils/workflowValidator';
import { WorkflowEngine } from '@/engine/WorkflowEngine';

function getDefaultConfig(type: string): Record<string, unknown> {
  switch (type) {
    case 'manual-trigger':
      return { payload: '{}' };
    case 'http-request':
      return { method: 'GET', url: 'https://example.com/api', timeoutMs: 5000, headers: {}, body: '' };
    case 'condition':
      return { leftOperand: 'status', operator: 'equals', rightOperand: 'active' };
    case 'transform-data':
      return { mode: 'property-path', propertyPath: 'data', outputKey: 'result' };
    default:
      return {};
  }
}

function buildMockNode(
  id: string,
  type: string,
  category: 'trigger' | 'data' | 'logic' | 'utility',
  label: string,
  config: Record<string, unknown> = {}
): WorkflowNode {
  return {
    id,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: {
      label,
      type,
      category,
      description: `Test ${label}`,
      icon: 'Box',
      color: '#ffffff',
      inputs: category === 'trigger' ? [] : [{ id: 'input', label: 'In', type: 'any' }],
      outputs: type === 'condition'
        ? [
            { id: 'true', label: 'True', type: 'any' },
            { id: 'false', label: 'False', type: 'any' },
          ]
        : [{ id: 'output', label: 'Out', type: 'any' }],
      config: { ...getDefaultConfig(type), ...config },
    },
  };
}

describe('Batch 13: Advanced Testing Lab & Workflow Validation', () => {
  describe('1. Reliable Assertion Builder & Boolean Safety', () => {
    it('never treats boolean false as missing or empty', () => {
      const assertionExists: TestAssertion = {
        id: 'as-ex',
        targetNodeId: 'node-1',
        targetProperty: 'active',
        operator: 'exists',
        expectedValue: '',
      };

      const resBoolFalse = evaluateAssertion(false, assertionExists);
      expect(resBoolFalse.passed).toBe(true);
      expect(resBoolFalse.actualValue).toBe(false);

      const resZero = evaluateAssertion(0, assertionExists);
      expect(resZero.passed).toBe(true);

      const resEmptyStr = evaluateAssertion('', assertionExists);
      expect(resEmptyStr.passed).toBe(true);
    });

    it('evaluates is_true and is_false strictly on boolean values', () => {
      const asIsTrue: TestAssertion = {
        id: 'as-t',
        targetNodeId: 'node-1',
        targetProperty: 'flag',
        operator: 'is_true',
        expectedValue: '',
      };
      const asIsFalse: TestAssertion = {
        id: 'as-f',
        targetNodeId: 'node-1',
        targetProperty: 'flag',
        operator: 'is_false',
        expectedValue: '',
      };

      // Strict booleans
      expect(evaluateAssertion(true, asIsTrue).passed).toBe(true);
      expect(evaluateAssertion(false, asIsTrue).passed).toBe(false);
      expect(evaluateAssertion('true', asIsTrue).passed).toBe(false); // String 'true' is not boolean true

      expect(evaluateAssertion(false, asIsFalse).passed).toBe(true);
      expect(evaluateAssertion(true, asIsFalse).passed).toBe(false);
      expect(evaluateAssertion('false', asIsFalse).passed).toBe(false); // String 'false' is not boolean false
    });

    it('evaluates exists and not_exists operators accurately', () => {
      const asExists: TestAssertion = {
        id: 'as-e',
        targetNodeId: 'n1',
        targetProperty: 'user',
        operator: 'exists',
        expectedValue: '',
      };
      const asNotExists: TestAssertion = {
        id: 'as-ne',
        targetNodeId: 'n1',
        targetProperty: 'deletedUser',
        operator: 'not_exists',
        expectedValue: '',
      };

      expect(evaluateAssertion({ name: 'Bob' }, asExists).passed).toBe(true);
      expect(evaluateAssertion(null, asExists).passed).toBe(false);
      expect(evaluateAssertion(undefined, asExists).passed).toBe(false);

      expect(evaluateAssertion(undefined, asNotExists).passed).toBe(true);
      expect(evaluateAssertion(null, asNotExists).passed).toBe(true);
      expect(evaluateAssertion('value', asNotExists).passed).toBe(false);
    });
  });

  describe('2. Type Preservation & Strict Value Comparison', () => {
    it('preserves the distinction between numbers and numeric strings when typed', () => {
      const asNumberType: TestAssertion = {
        id: 'as-num',
        targetNodeId: 'n1',
        targetProperty: 'code',
        operator: 'equals',
        expectedValue: '200',
        expectedType: 'number',
      };

      // Actual is number 200 -> pass
      expect(evaluateAssertion(200, asNumberType).passed).toBe(true);

      // Actual is string "200" -> fails with explicit type mismatch error
      const resMismatch = evaluateAssertion('200', asNumberType);
      expect(resMismatch.passed).toBe(false);
      expect(resMismatch.message).toContain('Type mismatch');
      expect(resMismatch.message).toContain('Expected number 200');
    });

    it('evaluates string type-strictly when expectedType is string', () => {
      const asStringType: TestAssertion = {
        id: 'as-str',
        targetNodeId: 'n1',
        targetProperty: 'id',
        operator: 'equals',
        expectedValue: '123',
        expectedType: 'string',
      };

      expect(evaluateAssertion('123', asStringType).passed).toBe(true);
      const resFail = evaluateAssertion(123, asStringType);
      expect(resFail.passed).toBe(false);
      expect(resFail.message).toContain('Type mismatch');
    });

    it('evaluates contains and not_contains for arrays and strings', () => {
      const asContainsStr: TestAssertion = {
        id: 'as-c1',
        targetNodeId: 'n1',
        targetProperty: 'msg',
        operator: 'contains',
        expectedValue: 'World',
      };
      expect(evaluateAssertion('Hello World!', asContainsStr).passed).toBe(true);
      expect(evaluateAssertion('Hello Universe!', asContainsStr).passed).toBe(false);

      const asContainsArr: TestAssertion = {
        id: 'as-c2',
        targetNodeId: 'n1',
        targetProperty: 'roles',
        operator: 'contains',
        expectedValue: 'admin',
      };
      expect(evaluateAssertion(['viewer', 'admin'], asContainsArr).passed).toBe(true);
      expect(evaluateAssertion(['viewer', 'editor'], asContainsArr).passed).toBe(false);

      const asNotContainsArr: TestAssertion = {
        id: 'as-nc',
        targetNodeId: 'n1',
        targetProperty: 'roles',
        operator: 'not_contains',
        expectedValue: 'root',
      };
      expect(evaluateAssertion(['viewer', 'admin'], asNotContainsArr).passed).toBe(true);
      expect(evaluateAssertion(['viewer', 'root'], asNotContainsArr).passed).toBe(false);
    });

    it('evaluates length operators (length_equals, length_greater_than, length_less_than)', () => {
      const asLenEq: TestAssertion = {
        id: 'as-l1',
        targetNodeId: 'n1',
        targetProperty: 'items',
        operator: 'length_equals',
        expectedValue: '3',
      };
      expect(evaluateAssertion(['a', 'b', 'c'], asLenEq).passed).toBe(true);
      expect(evaluateAssertion(['a', 'b'], asLenEq).passed).toBe(false);

      const asLenGt: TestAssertion = {
        id: 'as-l2',
        targetNodeId: 'n1',
        targetProperty: 'items',
        operator: 'length_greater_than',
        expectedValue: '2',
      };
      expect(evaluateAssertion(['a', 'b', 'c'], asLenGt).passed).toBe(true);
      expect(evaluateAssertion(['a', 'b'], asLenGt).passed).toBe(false);
    });

    it('evaluates relational operators (>=, <=) on numbers and rejects invalid operands', () => {
      const asGte: TestAssertion = {
        id: 'as-gte',
        targetNodeId: 'n1',
        targetProperty: 'score',
        operator: 'greater_than_or_equal',
        expectedValue: '50',
      };
      expect(evaluateAssertion(50, asGte).passed).toBe(true);
      expect(evaluateAssertion(51, asGte).passed).toBe(true);
      expect(evaluateAssertion(49, asGte).passed).toBe(false);

      // Non-numeric actual should fail cleanly
      const invalidRes = evaluateAssertion('not_a_number', asGte);
      expect(invalidRes.passed).toBe(false);
      expect(invalidRes.message).toContain('requires numeric values');
    });

    it('evaluates deep equality for JSON objects using deepEqual', () => {
      expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
      expect(deepEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 4] })).toBe(false);

      const asJson: TestAssertion = {
        id: 'as-json',
        targetNodeId: 'n1',
        targetProperty: 'profile',
        operator: 'equals',
        expectedValue: '{"theme": "dark", "notifications": true}',
        expectedType: 'json',
      };
      expect(
        evaluateAssertion({ theme: 'dark', notifications: true }, asJson).passed
      ).toBe(true);
      expect(
        evaluateAssertion({ theme: 'light', notifications: true }, asJson).passed
      ).toBe(false);
    });
  });

  describe('3. Target Node Dropdown Population & Safe Reconciliation', () => {
    it('populates valid target nodes and resolves blank/orphan node IDs safely', () => {
      const mockNodes: WorkflowNode[] = [
        buildMockNode('trig-1', 'manual-trigger', 'trigger', 'Trigger Node'),
        buildMockNode('cond-1', 'condition', 'logic', 'Check Status'),
        buildMockNode('http-1', 'http-request', 'data', 'Call API'),
      ];

      // Scenario with orphan/missing node reference
      const scenarios: TestScenario[] = [
        {
          id: 'sc-1',
          workflowId: 'wf-test',
          name: 'Orphan Reference Test',
          description: 'Tests reconciliation',
          triggerPayload: {},
          assertions: [
            {
              id: 'as-1',
              targetNodeId: 'obsolete-deleted-id',
              targetProperty: '_condition.branch',
              operator: 'equals',
              expectedValue: 'true',
            },
            {
              id: 'as-2',
              targetNodeId: 'obsolete-deleted-id-2',
              targetProperty: 'status',
              operator: 'equals',
              expectedValue: '200',
            },
          ],
        },
      ];

      const { reconciled, hasChanges } = reconcileScenarioAssertions(scenarios, mockNodes);
      expect(hasChanges).toBe(true);
      // _condition.branch is intelligently reconciled to condition node
      expect(reconciled[0].assertions[0].targetNodeId).toBe('cond-1');
      // status on data property is reconciled to http node
      expect(reconciled[0].assertions[1].targetNodeId).toBe('http-1');
    });

    it('preserves valid targetNodeIds without changes when nodes exist', () => {
      const mockNodes: WorkflowNode[] = [
        buildMockNode('cond-1', 'condition', 'logic', 'Check Status'),
      ];
      const scenarios: TestScenario[] = [
        {
          id: 'sc-1',
          workflowId: 'wf-test',
          name: 'Valid Target',
          description: 'Valid',
          triggerPayload: {},
          assertions: [
            {
              id: 'as-1',
              targetNodeId: 'cond-1',
              targetProperty: '_condition.branch',
              operator: 'equals',
              expectedValue: 'true',
            },
          ],
        },
      ];

      const { reconciled, hasChanges } = reconcileScenarioAssertions(scenarios, mockNodes);
      expect(hasChanges).toBe(false);
      expect(reconciled[0].assertions[0].targetNodeId).toBe('cond-1');
    });
  });

  describe('4. Deterministic Test Mode & HTTP Request Mocking', () => {
    it('executes workflow using mocked HTTP responses without external network dispatch', async () => {
      const triggerNode = buildMockNode('trig-1', 'manual-trigger', 'trigger', 'Trigger');
      const httpNode = buildMockNode('http-1', 'http-request', 'data', 'Get Users', {
        method: 'GET',
        url: 'https://example.com/api/users',
        timeoutMs: 5000,
      });

      const nodes = [triggerNode, httpNode];
      const edges: WorkflowEdge[] = [{ id: 'e1', source: 'trig-1', target: 'http-1' }];

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-mock-test', nodes, edges, {
        testMode: true,
        mockResponses: {
          'http-1': {
            enabled: true,
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: { users: [{ id: 1, name: 'Mocked User' }] },
          },
        },
      });

      // Fetch must NOT be called when mock is active
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();

      expect(result.success).toBe(true);
      const httpRecord = result.nodeRecords['http-1'];
      expect(httpRecord.state).toBe('success');
      expect(httpRecord.isMocked).toBe(true);
      expect(httpRecord.outputData).toEqual({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { users: [{ id: 1, name: 'Mocked User' }] },
        ok: true,
        isMocked: true,
      });
    });

    it('correctly simulates non-200 mocked HTTP errors', async () => {
      const triggerNode = buildMockNode('trig-1', 'manual-trigger', 'trigger', 'Trigger');
      const httpNode = buildMockNode('http-1', 'http-request', 'data', 'Call Service', {
        method: 'POST',
        url: 'https://example.com/api/resource',
        timeoutMs: 5000,
      });

      const nodes = [triggerNode, httpNode];
      const edges: WorkflowEdge[] = [{ id: 'e1', source: 'trig-1', target: 'http-1' }];

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-mock-error', nodes, edges, {
        testMode: true,
        mockResponses: {
          'http-1': {
            enabled: true,
            statusCode: 404,
            body: { error: 'Not Found' },
          },
        },
      });

      // Fails cleanly due to 404 status
      expect(result.success).toBe(false);
      expect(result.nodeRecords['http-1'].isMocked).toBe(true);
      expect(result.nodeRecords['http-1'].outputData).toEqual({
        status: 404,
        statusText: 'Mocked Response',
        headers: { 'content-type': 'application/json' },
        data: { error: 'Not Found' },
        ok: false,
        isMocked: true,
      });
    });
  });

  describe('5. Pre-Test Workflow Validation', () => {
    it('detects missing trigger nodes and reports actionable fix suggestions', () => {
      const nodes: WorkflowNode[] = [
        buildMockNode('http-1', 'http-request', 'data', 'Fetch', { url: 'https://example.com' }),
      ];
      const edges: WorkflowEdge[] = [];

      const report = validateWorkflowForTesting(nodes, edges);
      expect(report.isValid).toBe(false);
      expect(report.errors.some((e) => e.id === 'val-no-triggers')).toBe(true);
      expect(report.errors[0].fixSuggestion).toContain('Add a "Manual Trigger"');
    });

    it('detects missing required node configurations (e.g. empty HTTP url)', () => {
      const nodes: WorkflowNode[] = [
        buildMockNode('trig-1', 'manual-trigger', 'trigger', 'Trigger'),
        buildMockNode('http-1', 'http-request', 'data', 'Empty URL HTTP', { url: '' }),
      ];
      const edges: WorkflowEdge[] = [{ id: 'e1', source: 'trig-1', target: 'http-1' }];

      const report = validateWorkflowForTesting(nodes, edges);
      expect(report.isValid).toBe(false);
      expect(report.errors.some((e) => e.message.includes('endpoint URL is empty'))).toBe(true);
    });

    it('detects assertions pointing to missing nodes or empty property paths', () => {
      const nodes: WorkflowNode[] = [
        buildMockNode('trig-1', 'manual-trigger', 'trigger', 'Trigger'),
      ];
      const edges: WorkflowEdge[] = [];

      const scenario: TestScenario = {
        id: 'sc-val',
        workflowId: 'wf-val',
        name: 'Invalid Assertion Scenario',
        description: 'Test',
        triggerPayload: {},
        assertions: [
          {
            id: 'as-1',
            targetNodeId: 'non-existent-id',
            targetProperty: '',
            operator: 'equals',
            expectedValue: 'true',
          },
        ],
      };

      const report = validateWorkflowForTesting(nodes, edges, scenario);
      expect(report.isValid).toBe(false);
      expect(report.errors.some((e) => e.message.includes('non-existent node'))).toBe(true);
      expect(report.errors.some((e) => e.message.includes('empty target property path'))).toBe(true);
    });
  });

  describe('6. Full End-to-End Test Suite Execution Pipeline', () => {
    it('executes a scenario suite, evaluates assertions, and aggregates metrics', async () => {
      const trigger = buildMockNode('trig', 'manual-trigger', 'trigger', 'Trigger');
      const condition = buildMockNode('cond', 'condition', 'logic', 'Check Tier', {
        leftOperand: 'payload.tier',
        operator: 'equals',
        rightOperand: 'gold',
      });
      const transform = buildMockNode('trans', 'transform-data', 'data', 'Transform', {
        mode: 'property-path',
        propertyPath: 'payload.tier',
        outputKey: 'userTier',
      });

      const nodes = [trigger, condition, transform];
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trig', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'trans', sourceHandle: 'true' },
      ];

      // Scenario A: Gold user -> passes condition and flows to transform
      const scenarioA: TestScenario = {
        id: 'sc-gold',
        workflowId: 'wf-suite',
        name: 'Gold Tier Scenario',
        description: 'Verifies true branch and output key',
        triggerPayload: { tier: 'gold' },
        assertions: [
          {
            id: 'as-1',
            targetNodeId: 'cond',
            targetProperty: '_condition.branch',
            operator: 'equals',
            expectedValue: 'true',
          },
          {
            id: 'as-2',
            targetNodeId: 'trans',
            targetProperty: 'userTier',
            operator: 'equals',
            expectedValue: 'gold',
          },
        ],
      };

      // Scenario B: Silver user -> evaluates to false branch
      const scenarioB: TestScenario = {
        id: 'sc-silver',
        workflowId: 'wf-suite',
        name: 'Silver Tier Scenario',
        description: 'Verifies false branch routing',
        triggerPayload: { tier: 'silver' },
        assertions: [
          {
            id: 'as-3',
            targetNodeId: 'cond',
            targetProperty: '_condition.branch',
            operator: 'equals',
            expectedValue: 'false',
          },
        ],
      };

      const engine = new WorkflowEngine();

      // Run Scenario A
      const resA = await engine.executeWorkflow('wf-suite', nodes, edges, {
        overrideTriggerPayload: scenarioA.triggerPayload,
      });
      expect(resA.success).toBe(true);

      const assertionsA = scenarioA.assertions.map((as) => {
        const actual = resolveProperty(resA.nodeRecords[as.targetNodeId]?.outputData, as.targetProperty);
        return evaluateAssertion(actual, as);
      });
      expect(assertionsA.every((a) => a.passed)).toBe(true);

      // Run Scenario B
      const resB = await engine.executeWorkflow('wf-suite', nodes, edges, {
        overrideTriggerPayload: scenarioB.triggerPayload,
      });
      expect(resB.success).toBe(true);

      const assertionsB = scenarioB.assertions.map((as) => {
        const actual = resolveProperty(resB.nodeRecords[as.targetNodeId]?.outputData, as.targetProperty);
        return evaluateAssertion(actual, as);
      });
      expect(assertionsB.every((a) => a.passed)).toBe(true);
    });
  });
});
