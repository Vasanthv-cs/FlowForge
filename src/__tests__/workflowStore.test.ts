import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../store/workflowStore';

describe('WorkflowStore Stage 2 — Custom Node System', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      workflowName: 'Test Workflow',
      isSaved: true,
      nodes: [],
      edges: [],
      selectedNodeId: null,
      undoStack: [],
      redoStack: [],
      logs: [],
      validationErrors: [],
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      bottomPanelOpen: false,
      bottomTab: 'logs',
    });
  });

  const coreNodeTypes = [
    'manual-trigger',
    'http-request',
    'transform-data',
    'condition',
    'delay',
    'console-output',
  ];

  it('can instantiate each of the 6 core node types with unique IDs', () => {
    const { addNode } = useWorkflowStore.getState();

    coreNodeTypes.forEach((type, idx) => {
      addNode(type, { x: 100 * idx, y: 100 * idx });
    });

    const state = useWorkflowStore.getState();
    expect(state.nodes).toHaveLength(6);

    // Verify all IDs are strictly unique
    const idSet = new Set(state.nodes.map((n) => n.id));
    expect(idSet.size).toBe(6);

    // Verify each node has correct type and default configuration
    state.nodes.forEach((node) => {
      expect(coreNodeTypes).toContain(node.data.type);
      expect(node.data.config).toBeDefined();
      expect(typeof node.data.config).toBe('object');
      expect(node.data.status).toBe('idle');
    });
  });

  it('updates node label and preserves configuration', () => {
    const { addNode, updateNodeLabel } = useWorkflowStore.getState();
    addNode('http-request', { x: 100, y: 100 });
    const nodeId = useWorkflowStore.getState().nodes[0].id;

    updateNodeLabel(nodeId, 'Fetch GitHub User');
    const updated = useWorkflowStore.getState().nodes[0];
    expect(updated.data.label).toBe('Fetch GitHub User');
  });

  it('updates visual execution status', () => {
    const { addNode, updateNodeStatus } = useWorkflowStore.getState();
    addNode('delay', { x: 100, y: 100 });
    const nodeId = useWorkflowStore.getState().nodes[0].id;

    updateNodeStatus(nodeId, 'running');
    expect(useWorkflowStore.getState().nodes[0].data.status).toBe('running');

    updateNodeStatus(nodeId, 'success');
    expect(useWorkflowStore.getState().nodes[0].data.status).toBe('success');

    updateNodeStatus(nodeId, 'failed');
    expect(useWorkflowStore.getState().nodes[0].data.status).toBe('failed');
  });

  it('deletes a node and cleans up attached edges', () => {
    const { addNode, onConnect } = useWorkflowStore.getState();
    addNode('manual-trigger', { x: 100, y: 100 });
    addNode('delay', { x: 300, y: 100 });

    let state = useWorkflowStore.getState();
    const [n1, n2] = state.nodes;

    onConnect({
      source: n1.id,
      target: n2.id,
      sourceHandle: 'output',
      targetHandle: 'input',
    });

    state = useWorkflowStore.getState();
    expect(state.edges).toHaveLength(1);

    // Delete node 1
    state.deleteNode(n1.id);

    state = useWorkflowStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(n2.id);
    expect(state.edges).toHaveLength(0);
  });

  it('supports undo and redo of node creation', () => {
    const { addNode } = useWorkflowStore.getState();
    addNode('manual-trigger', { x: 100, y: 100 });
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);

    addNode('console-output', { x: 300, y: 100 });
    expect(useWorkflowStore.getState().nodes).toHaveLength(2);

    useWorkflowStore.getState().undo();
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);

    useWorkflowStore.getState().redo();
    expect(useWorkflowStore.getState().nodes).toHaveLength(2);
  });
});
