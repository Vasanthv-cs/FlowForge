import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../store/workflowStore';

describe('Stage 3 — Workflow Editor Features', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({
      workflowId: 'wf-test-editor',
      workflowName: 'Test Editor Workflow',
      nodes: [],
      edges: [],
      isSaved: true,
      selectedNodeId: null,
      selectedEdgeId: null,
      clipboardNode: null,
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

  describe('Workflow Renaming', () => {
    it('renames workflow and updates isSaved flag', () => {
      expect(useWorkflowStore.getState().workflowName).toBe('Test Editor Workflow');
      useWorkflowStore.getState().setWorkflowName('Updated Pipeline Title');

      expect(useWorkflowStore.getState().workflowName).toBe('Updated Pipeline Title');
      expect(useWorkflowStore.getState().isSaved).toBe(false);
    });
  });

  describe('Node Duplication, Copy and Paste', () => {
    it('duplicates a selected node with offset position and unique ID', () => {
      const { addNode, duplicateNode } = useWorkflowStore.getState();
      const node = addNode('delay', { x: 100, y: 150 });
      expect(node).toBeDefined();

      const duplicated = duplicateNode(node!.id);
      expect(duplicated).toBeDefined();
      expect(duplicated!.id).not.toBe(node!.id);
      expect(duplicated!.position.x).toBe(140);
      expect(duplicated!.position.y).toBe(190);
      expect(duplicated!.data.label).toContain('(Copy)');
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
    });

    it('copies and pastes a node via clipboard', () => {
      const { addNode, copyNode, pasteNode } = useWorkflowStore.getState();
      const original = addNode('http-request', { x: 50, y: 50 })!;

      copyNode(original.id);
      expect(useWorkflowStore.getState().clipboardNode).toBeDefined();
      expect(useWorkflowStore.getState().clipboardNode!.id).toBe(original.id);

      const pasted = pasteNode({ x: 200, y: 300 });
      expect(pasted).toBeDefined();
      expect(pasted!.id).not.toBe(original.id);
      expect(pasted!.position.x).toBe(200);
      expect(pasted!.position.y).toBe(300);
      expect(pasted!.data.label).toContain('(Pasted)');
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
    });
  });

  describe('Selection & Deletion of Elements', () => {
    it('deletes selected node and cleans up connected edges', () => {
      const { addNode, onConnect, setSelectedNodeId, deleteSelected } =
        useWorkflowStore.getState();

      const n1 = addNode('manual-trigger', { x: 0, y: 0 })!;
      const n2 = addNode('delay', { x: 200, y: 0 })!;

      onConnect({
        source: n1.id,
        target: n2.id,
        sourceHandle: 'output',
        targetHandle: 'input',
      });

      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
      expect(useWorkflowStore.getState().edges).toHaveLength(1);

      setSelectedNodeId(n1.id);
      deleteSelected();

      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
      expect(useWorkflowStore.getState().edges).toHaveLength(0);
      expect(useWorkflowStore.getState().selectedNodeId).toBeNull();
    });

    it('deletes selected edge without deleting connected nodes', () => {
      const { addNode, onConnect, setSelectedEdgeId, deleteSelected } =
        useWorkflowStore.getState();

      const n1 = addNode('manual-trigger', { x: 0, y: 0 })!;
      const n2 = addNode('delay', { x: 200, y: 0 })!;

      onConnect({
        source: n1.id,
        target: n2.id,
        sourceHandle: 'output',
        targetHandle: 'input',
      });

      const edgeId = useWorkflowStore.getState().edges[0].id;
      setSelectedEdgeId(edgeId);
      deleteSelected();

      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
      expect(useWorkflowStore.getState().edges).toHaveLength(0);
    });
  });

  describe('Command-Based Undo & Redo', () => {
    it('correctly reverts and reapplies document mutations without affecting UI state', () => {
      const { addNode, undo, redo } = useWorkflowStore.getState();

      // UI state before
      useWorkflowStore.setState({ leftSidebarOpen: false });

      addNode('manual-trigger', { x: 10, y: 10 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);

      addNode('delay', { x: 100, y: 10 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);

      // Undo second node
      undo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
      // UI state must remain untouched by undo
      expect(useWorkflowStore.getState().leftSidebarOpen).toBe(false);

      // Redo second node
      redo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
      expect(useWorkflowStore.getState().leftSidebarOpen).toBe(false);
    });
  });

  describe('Workflow Persistence (Save & Load)', () => {
    it('persists workflow into local repository and loads it back', async () => {
      const { addNode, saveWorkflow, createNewWorkflow, loadWorkflow } =
        useWorkflowStore.getState();

      addNode('manual-trigger', { x: 10, y: 10 });
      addNode('console-output', { x: 150, y: 10 });

      useWorkflowStore.getState().setWorkflowName('Persistent Pipeline');
      await saveWorkflow();

      expect(useWorkflowStore.getState().isSaved).toBe(true);

      const currentId = useWorkflowStore.getState().workflowId;

      // Create new blank workflow
      createNewWorkflow('Empty Scratchpad');
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);
      expect(useWorkflowStore.getState().workflowName).toBe('Empty Scratchpad');

      // Reload saved workflow by ID
      const loaded = loadWorkflow(currentId);
      expect(loaded).toBe(true);
      expect(useWorkflowStore.getState().nodes).toHaveLength(2);
      expect(useWorkflowStore.getState().workflowName).toBe('Persistent Pipeline');
      expect(useWorkflowStore.getState().isSaved).toBe(true);
    });
  });
});
