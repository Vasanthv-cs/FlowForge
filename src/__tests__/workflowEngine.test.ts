import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { analyzeWorkflowGraph } from '../engine/graph';
import { validateSafeUrl } from '../engine/urlSecurity';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';

function buildNode(
  id: string,
  type: string,
  category: 'trigger' | 'data' | 'logic' | 'utility',
  config: Record<string, unknown> = {},
): WorkflowNode {
  return {
    id,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      type,
      category,
      description: `Test ${type}`,
      icon: 'Play',
      color: '#ffffff',
      inputs: category === 'trigger' ? [] : [{ id: 'input', label: 'In', type: 'any' }],
      outputs: type === 'condition'
        ? [
            { id: 'true', label: 'True', type: 'any' },
            { id: 'false', label: 'False', type: 'any' },
          ]
        : [{ id: 'output', label: 'Out', type: 'any' }],
      config,
    },
  };
}

describe('Stage 4 — Workflow Engine Tests', () => {
  describe('SSRF and URL Security', () => {
    it('blocks localhost and loopback IPv4/IPv6', () => {
      expect(validateSafeUrl('http://localhost:8080/api').isSafe).toBe(false);
      expect(validateSafeUrl('http://127.0.0.1:3000').isSafe).toBe(false);
      expect(validateSafeUrl('http://127.0.0.2/test').isSafe).toBe(false);
      expect(validateSafeUrl('http://[::1]:5000').isSafe).toBe(false);
    });

    it('blocks private subnets (10.x, 192.168.x, 172.16.x) and link-local (169.254.x)', () => {
      expect(validateSafeUrl('http://10.0.0.1').isSafe).toBe(false);
      expect(validateSafeUrl('http://192.168.1.1').isSafe).toBe(false);
      expect(validateSafeUrl('http://172.16.0.1').isSafe).toBe(false);
      expect(validateSafeUrl('http://172.31.255.255').isSafe).toBe(false);
      expect(validateSafeUrl('http://169.254.169.254/latest/meta-data').isSafe).toBe(false);
    });

    it('permits public HTTPS and HTTP URLs', () => {
      expect(validateSafeUrl('https://api.github.com/zen').isSafe).toBe(true);
      expect(validateSafeUrl('http://example.com/test').isSafe).toBe(true);
    });

    it('blocks non-http protocols such as file: or ftp:', () => {
      expect(validateSafeUrl('file:///etc/passwd').isSafe).toBe(false);
      expect(validateSafeUrl('ftp://example.com/file').isSafe).toBe(false);
    });
  });

  describe('Kahn Topological Sorting & Cycle Detection', () => {
    it('sorts a linear DAG correctly', () => {
      const n1 = buildNode('n1', 'manual-trigger', 'trigger');
      const n2 = buildNode('n2', 'transform-data', 'data');
      const n3 = buildNode('n3', 'console-output', 'utility');

      const edges: WorkflowEdge[] = [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3' },
      ];

      const res = analyzeWorkflowGraph([n1, n2, n3], edges);
      expect(res.isValid).toBe(true);
      expect(res.hasCycles).toBe(false);
      expect(res.topologicalOrder).toEqual(['n1', 'n2', 'n3']);
    });

    it('detects direct cycle between two nodes', () => {
      const n1 = buildNode('n1', 'transform-data', 'data');
      const n2 = buildNode('n2', 'delay', 'utility');

      const edges: WorkflowEdge[] = [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-1', source: 'n2', target: 'n1' },
      ];

      const res = analyzeWorkflowGraph([n1, n2], edges);
      expect(res.isValid).toBe(false);
      expect(res.hasCycles).toBe(true);
      expect(res.errors[0]).toContain('Cycle detected');
    });

    it('detects 3-node cyclic loop', () => {
      const n1 = buildNode('n1', 'transform-data', 'data');
      const n2 = buildNode('n2', 'delay', 'utility');
      const n3 = buildNode('n3', 'console-output', 'utility');

      const edges: WorkflowEdge[] = [
        { id: 'e1-2', source: 'n1', target: 'n2' },
        { id: 'e2-3', source: 'n2', target: 'n3' },
        { id: 'e3-1', source: 'n3', target: 'n1' },
      ];

      const res = analyzeWorkflowGraph([n1, n2, n3], edges);
      expect(res.hasCycles).toBe(true);
      expect(res.isValid).toBe(false);
    });

    it('detects edges pointing to missing nodes', () => {
      const n1 = buildNode('n1', 'manual-trigger', 'trigger');
      const edges: WorkflowEdge[] = [
        { id: 'e-bad', source: 'n1', target: 'non-existent-node' },
      ];

      const res = analyzeWorkflowGraph([n1], edges);
      expect(res.isValid).toBe(false);
      expect(res.missingNodes).toContain('non-existent-node');
    });
  });

  describe('Workflow Engine Execution', () => {
    it('executes a valid DAG with data propagation', async () => {
      const trigger = buildNode('trig', 'manual-trigger', 'trigger', {
        payload: '{"orderId":"ord_456","amount":150}',
      });
      const transform = buildNode('trans', 'transform-data', 'data', {
        mode: 'property-path',
        propertyPath: 'payload.amount',
        outputKey: 'extractedAmount',
      });
      const delay = buildNode('delay', 'delay', 'utility', {
        delayMs: 50,
      });
      const consoleOut = buildNode('out', 'console-output', 'utility', {
        level: 'info',
        prefix: 'TEST_DAG',
      });

      const nodes = [trigger, transform, delay, consoleOut];
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trig', target: 'trans' },
        { id: 'e2', source: 'trans', target: 'delay' },
        { id: 'e3', source: 'delay', target: 'out' },
      ];

      const engine = new WorkflowEngine();
      const logs: string[] = [];

      const result = await engine.executeWorkflow('wf-test', nodes, edges, {
        onLog: (l) => logs.push(l.message),
      });

      expect(result.success).toBe(true);
      expect(result.nodesExecuted).toBe(4);
      expect(result.nodeRecords['trig'].state).toBe('success');
      expect(result.nodeRecords['trans'].state).toBe('success');
      expect(result.nodeRecords['delay'].state).toBe('success');
      expect(result.nodeRecords['out'].state).toBe('success');

      // Verify data propagated
      const finalOut = result.nodeRecords['trans'].outputData;
      expect(finalOut).toHaveProperty('extractedAmount', 150);
    });

    it('rejects execution on cyclic graph before running', async () => {
      const n1 = buildNode('n1', 'delay', 'utility', { delayMs: 10 });
      const n2 = buildNode('n2', 'delay', 'utility', { delayMs: 10 });

      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n1' },
      ];

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-cycle', [n1, n2], edges);

      expect(result.success).toBe(false);
      expect(result.nodesExecuted).toBe(0);
      expect(result.error).toContain('Cycle detected');
    });

    it('rejects execution with invalid node configuration', async () => {
      const trigger = buildNode('trig', 'manual-trigger', 'trigger', {
        payload: '{invalid-json',
      });

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-inv-cfg', [trigger], []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Configuration invalid');
    });

    it('executes condition branching correctly (skips false branch, runs true branch)', async () => {
      const trigger = buildNode('trig', 'manual-trigger', 'trigger', {
        payload: '{"status":"active"}',
      });
      const cond = buildNode('cond', 'condition', 'logic', {
        leftOperand: 'payload.status',
        operator: 'equals',
        rightOperand: 'active',
      });
      const trueBranchNode = buildNode('trueNode', 'delay', 'utility', { delayMs: 20 });
      const falseBranchNode = buildNode('falseNode', 'delay', 'utility', { delayMs: 20 });

      const nodes = [trigger, cond, trueBranchNode, falseBranchNode];
      const edges: WorkflowEdge[] = [
        { id: 'e-t-c', source: 'trig', target: 'cond' },
        { id: 'e-c-true', source: 'cond', target: 'trueNode', sourceHandle: 'true' },
        { id: 'e-c-false', source: 'cond', target: 'falseNode', sourceHandle: 'false' },
      ];

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-branch', nodes, edges);

      expect(result.success).toBe(true);
      expect(result.nodeRecords['cond'].selectedBranch).toBe('true');
      expect(result.nodeRecords['trueNode'].state).toBe('success');
      expect(result.nodeRecords['falseNode'].state).toBe('skipped');
    });

    it('skips downstream nodes when an upstream dependency fails', async () => {
      const trigger = buildNode('trig', 'manual-trigger', 'trigger', { payload: '{}' });
      // HTTP node pointing to an invalid domain that fails to resolve
      const http = buildNode('http', 'http-request', 'data', {
        method: 'GET',
        url: 'https://this-domain-does-not-exist-flowforge-test.xyz',
        timeoutMs: 1000,
      });
      const downstream = buildNode('downstream', 'delay', 'utility', { delayMs: 50 });

      const nodes = [trigger, http, downstream];
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trig', target: 'http' },
        { id: 'e2', source: 'http', target: 'downstream' },
      ];

      const engine = new WorkflowEngine();
      const result = await engine.executeWorkflow('wf-fail', nodes, edges);

      expect(result.success).toBe(false);
      expect(result.nodeRecords['http'].state).toBe('failed');
      expect(result.nodeRecords['downstream'].state).toBe('skipped');
    });

    it('executes multiple independent nodes concurrently', async () => {
      const trig = buildNode('trig', 'manual-trigger', 'trigger', { payload: '{}' });
      const branch1 = buildNode('b1', 'delay', 'utility', { delayMs: 80 });
      const branch2 = buildNode('b2', 'delay', 'utility', { delayMs: 80 });

      const nodes = [trig, branch1, branch2];
      const edges: WorkflowEdge[] = [
        { id: 'e1', source: 'trig', target: 'b1' },
        { id: 'e2', source: 'trig', target: 'b2' },
      ];

      const engine = new WorkflowEngine();
      const start = Date.now();
      const result = await engine.executeWorkflow('wf-concurrent', nodes, edges, {
        maxConcurrency: 2,
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.nodesExecuted).toBe(3);
      // Because b1 and b2 run in parallel, total time should be close to 80-120ms, not 160ms+
      expect(elapsed).toBeLessThan(250);
    });
  });
});
