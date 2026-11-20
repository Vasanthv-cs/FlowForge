import { describe, it, expect } from 'vitest';
import { validateNodeConfig, validateWorkflowGraph } from '../lib/nodeValidation';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';

function createMockNode(type: string, config: Record<string, unknown>): WorkflowNode {
  return {
    id: `node-${type}-1`,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: {
      label: type,
      type,
      category: type === 'manual-trigger' ? 'trigger' : 'data',
      description: 'test',
      icon: 'Play',
      color: '#ffffff',
      inputs: [],
      outputs: [],
      config,
    },
  };
}

describe('Node Validation Engine', () => {
  describe('Manual Trigger Validation', () => {
    it('passes with valid JSON payload', () => {
      const node = createMockNode('manual-trigger', { payload: '{"message":"hello"}' });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('passes with empty payload', () => {
      const node = createMockNode('manual-trigger', { payload: '' });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails with invalid JSON payload', () => {
      const node = createMockNode('manual-trigger', { payload: '{invalid-json' });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('valid JSON');
    });
  });

  describe('HTTP Request Validation', () => {
    it('passes with valid HTTP URL, method, and timeout', () => {
      const node = createMockNode('http-request', {
        method: 'GET',
        url: 'https://api.github.com/zen',
        headers: {},
        body: '',
        timeoutMs: 5000,
      });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails when URL is missing or invalid protocol', () => {
      const node = createMockNode('http-request', {
        method: 'GET',
        url: 'not-a-valid-url',
        headers: {},
        body: '',
        timeoutMs: 5000,
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('valid HTTP or HTTPS');
    });

    it('fails when timeout exceeds 60,000ms safe limit', () => {
      const node = createMockNode('http-request', {
        method: 'GET',
        url: 'https://api.example.com',
        headers: {},
        body: '',
        timeoutMs: 999999,
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('60,000ms');
    });

    it('fails when timeout is less than 100ms', () => {
      const node = createMockNode('http-request', {
        method: 'GET',
        url: 'https://api.example.com',
        headers: {},
        body: '',
        timeoutMs: 10,
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('at least 100ms');
    });
  });

  describe('Transform Data Validation', () => {
    it('passes with valid transform configuration', () => {
      const node = createMockNode('transform-data', {
        mode: 'property-path',
        propertyPath: 'data.user',
        outputKey: 'result',
      });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails with invalid transform mode', () => {
      const node = createMockNode('transform-data', {
        mode: 'arbitrary-eval',
        propertyPath: 'data',
        outputKey: 'result',
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Condition Validation', () => {
    it('passes with left operand, valid operator, and right operand', () => {
      const node = createMockNode('condition', {
        leftOperand: 'status',
        operator: 'equals',
        rightOperand: '200',
      });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails when left operand is missing', () => {
      const node = createMockNode('condition', {
        leftOperand: '',
        operator: 'equals',
        rightOperand: '200',
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Left operand is required');
    });
  });

  describe('Delay Validation', () => {
    it('passes with safe delay within bounds', () => {
      const node = createMockNode('delay', { delayMs: 2500 });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails when delay exceeds 60,000ms safe maximum', () => {
      const node = createMockNode('delay', { delayMs: 65000 });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('cannot exceed 60,000ms');
    });

    it('fails when delay is negative', () => {
      const node = createMockNode('delay', { delayMs: -500 });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('at least 0ms');
    });
  });

  describe('Console Output Validation', () => {
    it('passes with valid log level', () => {
      const node = createMockNode('console-output', {
        level: 'warn',
        prefix: 'DEBUG',
      });
      expect(validateNodeConfig(node)).toHaveLength(0);
    });

    it('fails with invalid log level', () => {
      const node = createMockNode('console-output', {
        level: 'critical-fatal',
        prefix: 'TEST',
      });
      const errors = validateNodeConfig(node);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow Graph Validation', () => {
    it('detects empty workflow', () => {
      const errors = validateWorkflowGraph([], []);
      expect(errors.some((e) => e.id === 'v-empty')).toBe(true);
    });

    it('detects workflow missing trigger node', () => {
      const node = createMockNode('delay', { delayMs: 1000 });
      const errors = validateWorkflowGraph([node], []);
      expect(errors.some((e) => e.id === 'v-no-trigger')).toBe(true);
    });

    it('detects disconnected orphan nodes', () => {
      const trigger = createMockNode('manual-trigger', { payload: '{}' });
      trigger.data.category = 'trigger';
      const delay = createMockNode('delay', { delayMs: 1000 });
      const errors = validateWorkflowGraph([trigger, delay], []);
      expect(errors.some((e) => e.id.startsWith('v-orphan-'))).toBe(true);
    });

    it('passes when valid workflow is connected', () => {
      const trigger = createMockNode('manual-trigger', { payload: '{}' });
      trigger.data.category = 'trigger';
      const delay = createMockNode('delay', { delayMs: 1000 });
      delay.data.category = 'utility';

      const edge: WorkflowEdge = {
        id: 'e1-2',
        source: trigger.id,
        target: delay.id,
      };

      const errors = validateWorkflowGraph([trigger, delay], [edge]);
      expect(errors).toHaveLength(0);
    });
  });
});
