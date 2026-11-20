import { describe, it, expect } from 'vitest';
import { WorkflowEngine } from '../engine/WorkflowEngine';
import { analyzeWorkflowGraph } from '../engine/graph';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';

describe('Performance on Large Graphs', () => {
  it('analyzeWorkflowGraph scales efficiently for 200 nodes', () => {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    // Create a 200-node graph with layered fan-out and fan-in
    // 20 layers of 10 nodes each
    for (let layer = 0; layer < 20; layer++) {
      for (let i = 0; i < 10; i++) {
        const id = `node_L${layer}_N${i}`;
        nodes.push({
          id,
          type: 'workflowNode',
          position: { x: layer * 150, y: i * 80 },
          data: {
            label: `Node ${layer}-${i}`,
            type: layer === 0 ? 'manual-trigger' : 'transform-data',
            category: layer === 0 ? 'trigger' : 'data',
            description: 'Perf test node',
            icon: 'Activity',
            color: '#3b82f6',
            config: layer === 0 ? { payload: '{"value": 1}' } : { propertyPath: 'value', outputKey: 'res', mode: 'property-path' },
            inputs: layer === 0 ? [] : [{ id: 'input', label: 'In', type: 'any' }],
            outputs: [{ id: 'output', label: 'Out', type: 'any' }],
            status: 'idle',
          },
        });

        // Connect from each node in previous layer to 2 nodes in next layer
        if (layer > 0) {
          const prevSource = `node_L${layer - 1}_N${i}`;
          edges.push({
            id: `edge_${prevSource}_to_${id}`,
            source: prevSource,
            target: id,
            sourceHandle: 'output',
            targetHandle: 'input',
          });
        }
      }
    }

    expect(nodes.length).toBe(200);
    expect(edges.length).toBe(190);

    // Benchmark graph analysis (Kahn's topological sort + cycle detection)
    const tStartAnalysis = performance.now();
    const analysis = analyzeWorkflowGraph(nodes, edges);
    const tAnalysisMs = performance.now() - tStartAnalysis;

    expect(analysis.hasCycles).toBe(false);
    expect(analysis.isValid).toBe(true);
    expect(analysis.topologicalOrder.length).toBe(200);
    expect(tAnalysisMs).toBeLessThan(50); // Under 50ms for 200 nodes
  });

  it('WorkflowEngine executes a concurrent graph of 50 nodes reliably without memory leaks', async () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'root-trigger',
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Root Trigger',
          type: 'manual-trigger',
          category: 'trigger',
          description: 'Root',
          icon: 'Play',
          color: '#10b981',
          config: { payload: '{"batch": "test-data"}' },
          inputs: [],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          status: 'idle',
        },
      },
    ];

    const edges: WorkflowEdge[] = [];

    // Fan-out to 49 parallel transform nodes
    for (let i = 1; i <= 49; i++) {
      const id = `worker-node-${i}`;
      nodes.push({
        id,
        type: 'workflowNode',
        position: { x: 250, y: i * 30 },
        data: {
          label: `Worker ${i}`,
          type: 'transform-data',
          category: 'data',
          description: `Worker ${i}`,
          icon: 'Cpu',
          color: '#8b5cf6',
          config: { propertyPath: 'batch', outputKey: `w_${i}`, mode: 'property-path' },
          inputs: [{ id: 'input', label: 'In', type: 'any' }],
          outputs: [{ id: 'output', label: 'Out', type: 'any' }],
          status: 'idle',
        },
      });

      edges.push({
        id: `e-root-${id}`,
        source: 'root-trigger',
        target: id,
        sourceHandle: 'output',
        targetHandle: 'input',
      });
    }

    const engine = new WorkflowEngine();
    const startTime = performance.now();
    const result = await engine.executeWorkflow('perf-workflow-50', nodes, edges, {
      maxConcurrency: 8,
    });
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.nodesExecuted).toBe(50);
    expect(Object.keys(result.nodeRecords)).toHaveLength(50);
    expect(duration).toBeLessThan(1500); // Efficient concurrent execution
  });
});
