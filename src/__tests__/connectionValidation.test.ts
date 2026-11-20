import { describe, it, expect } from 'vitest';
import { validateConnection } from '../lib/connectionValidation';
import type { WorkflowNode, WorkflowEdge } from '../types/workflow';

function createNode(id: string, category: 'trigger' | 'data' | 'logic' | 'utility'): WorkflowNode {
  return {
    id,
    type: 'workflowNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      type: id,
      category,
      description: 'test',
      icon: 'Play',
      color: '#fff',
      inputs: [],
      outputs: [],
      config: {},
    },
  };
}

describe('Connection Validation Engine', () => {
  const triggerNode = createNode('node-trigger', 'trigger');
  const dataNode = createNode('node-data', 'data');
  const conditionNode = createNode('node-cond', 'logic');
  const delayNode = createNode('node-delay', 'utility');

  const nodes = [triggerNode, dataNode, conditionNode, delayNode];

  it('rejects self-connection', () => {
    const res = validateConnection(
      {
        source: 'node-data',
        target: 'node-data',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
      nodes,
      [],
    );
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('Cannot connect a node to itself');
  });

  it('rejects connecting to a trigger node as the target', () => {
    const res = validateConnection(
      {
        source: 'node-data',
        target: 'node-trigger',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
      nodes,
      [],
    );
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('Trigger nodes cannot receive inputs');
  });

  it('rejects duplicate connections between identical handles', () => {
    const existingEdges: WorkflowEdge[] = [
      {
        id: 'e1',
        source: 'node-trigger',
        target: 'node-data',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
    ];

    const res = validateConnection(
      {
        source: 'node-trigger',
        target: 'node-data',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
      nodes,
      existingEdges,
    );
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('already exists');
  });

  it('allows valid connection from trigger output to data input', () => {
    const res = validateConnection(
      {
        source: 'node-trigger',
        target: 'node-data',
        sourceHandle: 'output',
        targetHandle: 'input',
      },
      nodes,
      [],
    );
    expect(res.isValid).toBe(true);
  });

  it('allows branching connections from condition true and false handles', () => {
    const resTrue = validateConnection(
      {
        source: 'node-cond',
        target: 'node-data',
        sourceHandle: 'true',
        targetHandle: 'input',
      },
      nodes,
      [],
    );
    expect(resTrue.isValid).toBe(true);

    const resFalse = validateConnection(
      {
        source: 'node-cond',
        target: 'node-delay',
        sourceHandle: 'false',
        targetHandle: 'input',
      },
      nodes,
      [],
    );
    expect(resFalse.isValid).toBe(true);
  });
});
