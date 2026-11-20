import { create } from 'zustand';
import {
  addEdge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/system';
import type {
  WorkflowNode,
  WorkflowEdge,
  ExecutionLog,
  ValidationError,
  NodeStatus,
} from '@/types/workflow';
import { nodeDefinitions } from '@/data/nodeDefinitions';
import { validateWorkflowGraph } from '@/lib/nodeValidation';
import { validateConnection } from '@/lib/connectionValidation';
import { WorkflowEngine } from '@/engine/WorkflowEngine';
import type { NodeExecutionRecord, WorkflowRunResult } from '@/engine/types';
import { WorkflowPersistence, type SavedWorkflow } from './persistence';

/* ── 1. Document State Slice (Persisted & Versioned) ── */
export interface DocumentState {
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isSaved: boolean;
  undoStack: Array<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>;
  redoStack: Array<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }>;
}

/* ── 2. UI State Slice (Transient Editor State) ─────── */
export interface UIState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  clipboardNode: WorkflowNode | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  bottomPanelOpen: boolean;
  bottomTab: 'logs' | 'timeline' | 'errors' | 'history';
  validationErrors: ValidationError[];
}

/* ── 3. Execution State Slice (Runtime Engine State) ── */
export interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  nodeRecords: Record<string, NodeExecutionRecord>;
  logs: ExecutionLog[];
  executionHistory: WorkflowRunResult[];
}

/* ── Combined Store Actions ─────────────────────────── */
export interface WorkflowStoreActions {
  // Document actions
  setWorkflowName: (name: string) => void;
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  onNodesChange: OnNodesChange<WorkflowNode>;
  onEdgesChange: OnEdgesChange<WorkflowEdge>;
  onConnect: (connection: Connection) => boolean;
  addNode: (type: string, position: { x: number; y: number }) => WorkflowNode | undefined;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => WorkflowNode | undefined;
  copyNode: (id: string) => void;
  pasteNode: (position?: { x: number; y: number }) => WorkflowNode | undefined;
  deleteSelected: () => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeStatus: (id: string, status: NodeStatus) => void;

  // History (pure document state undo/redo)
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Persistence
  saveWorkflow: () => Promise<void>;
  loadWorkflow: (id: string) => boolean;
  loadWorkflowFromData: (data: SavedWorkflow) => void;
  createNewWorkflow: (name?: string) => void;

  // UI actions
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleBottomPanel: () => void;
  setBottomTab: (tab: 'logs' | 'timeline' | 'errors' | 'history') => void;
  setValidationErrors: (errors: ValidationError[]) => void;

  // Execution actions
  runWorkflow: () => Promise<WorkflowRunResult>;
  cancelExecution: () => void;
  clearLogs: () => void;
  addLog: (log: Omit<ExecutionLog, 'id' | 'timestamp'>) => void;
  validate: () => ValidationError[];
}

export type FullWorkflowStore = DocumentState & UIState & ExecutionState & WorkflowStoreActions;

let activeEngine: WorkflowEngine | null = null;
let nodeCounter = 0;

export const useWorkflowStore = create<FullWorkflowStore>((set, get) => ({
  /* ── 1. Document State Initial ───────────────────── */
  workflowId: `wf-${Date.now().toString(36)}`,
  workflowName: 'Customer Onboarding Workflow',
  nodes: [],
  edges: [],
  isSaved: true,
  undoStack: [],
  redoStack: [],

  /* ── 2. UI State Initial ─────────────────────────── */
  selectedNodeId: null,
  selectedEdgeId: null,
  clipboardNode: null,
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  bottomPanelOpen: false,
  bottomTab: 'logs',
  validationErrors: [],

  /* ── 3. Execution State Initial ──────────────────── */
  isRunning: false,
  executionId: null,
  nodeRecords: {},
  logs: [],
  executionHistory: [],

  /* ── Document Actions ────────────────────────────── */
  setWorkflowName: (name) => {
    set({ workflowName: name, isSaved: false });
  },

  setNodes: (nodes) => set({ nodes, isSaved: false }),
  setEdges: (edges) => set({ edges, isSaved: false }),

  onNodesChange: (changes) => {
    const state = get();
    set({
      nodes: applyNodeChanges(state.nodes, changes),
      isSaved: false,
    });
  },

  onEdgesChange: (changes) => {
    const state = get();
    set({
      edges: applyEdgeChanges(state.edges, changes),
      isSaved: false,
    });
  },

  onConnect: (connection) => {
    const state = get();
    const validation = validateConnection(connection, state.nodes, state.edges);
    if (!validation.isValid) {
      state.addLog({
        level: 'warn',
        message: `Connection rejected: ${validation.reason ?? 'Invalid connection'}`,
      });
      return false;
    }

    state.pushSnapshot();
    set({
      edges: addEdge(
        {
          ...connection,
          type: 'smoothstep',
          animated: true,
        },
        state.edges,
      ),
      isSaved: false,
    });
    return true;
  },

  addNode: (type, position) => {
    const def = nodeDefinitions.find((d) => d.type === type);
    if (!def) return undefined;

    const state = get();
    state.pushSnapshot();
    nodeCounter++;
    const id = `node-${type}-${Date.now().toString(36)}-${nodeCounter}`;

    const newNode: WorkflowNode = {
      id,
      type: 'workflowNode',
      position,
      data: {
        label: def.label,
        type: def.type,
        category: def.category,
        description: def.description,
        icon: def.icon,
        color: def.color,
        config: JSON.parse(JSON.stringify(def.defaultConfig)),
        inputs: def.inputs,
        outputs: def.outputs,
        status: 'idle',
      },
    };

    set({
      nodes: [...state.nodes, newNode],
      selectedNodeId: id,
      isSaved: false,
    });
    return newNode;
  },

  deleteNode: (id) => {
    const state = get();
    state.pushSnapshot();
    set({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
      isSaved: false,
    });
  },

  duplicateNode: (id) => {
    const state = get();
    const target = state.nodes.find((n) => n.id === id);
    if (!target) return undefined;

    state.pushSnapshot();
    nodeCounter++;
    const newId = `node-${target.data.type}-${Date.now().toString(36)}-${nodeCounter}`;

    const duplicated: WorkflowNode = {
      id: newId,
      type: target.type,
      position: {
        x: target.position.x + 40,
        y: target.position.y + 40,
      },
      data: {
        ...target.data,
        label: `${target.data.label} (Copy)`,
        config: JSON.parse(JSON.stringify(target.data.config)),
        status: 'idle',
      },
    };

    set({
      nodes: [...state.nodes, duplicated],
      selectedNodeId: newId,
      isSaved: false,
    });
    state.addLog({
      level: 'info',
      message: `Duplicated node "${target.data.label}" → "${duplicated.data.label}".`,
    });
    return duplicated;
  },

  copyNode: (id) => {
    const state = get();
    const target = state.nodes.find((n) => n.id === id);
    if (target) {
      set({ clipboardNode: JSON.parse(JSON.stringify(target)) });
      state.addLog({
        level: 'info',
        message: `Copied node "${target.data.label}" to clipboard.`,
      });
    }
  },

  pasteNode: (position) => {
    const state = get();
    if (!state.clipboardNode) return undefined;

    state.pushSnapshot();
    nodeCounter++;
    const newId = `node-${state.clipboardNode.data.type}-${Date.now().toString(36)}-${nodeCounter}`;

    const pastePos = position ?? {
      x: state.clipboardNode.position.x + 50,
      y: state.clipboardNode.position.y + 50,
    };

    const pasted: WorkflowNode = {
      id: newId,
      type: state.clipboardNode.type,
      position: pastePos,
      data: {
        ...state.clipboardNode.data,
        label: `${state.clipboardNode.data.label} (Pasted)`,
        config: JSON.parse(JSON.stringify(state.clipboardNode.data.config)),
        status: 'idle',
      },
    };

    set({
      nodes: [...state.nodes, pasted],
      selectedNodeId: newId,
      isSaved: false,
    });
    state.addLog({
      level: 'info',
      message: `Pasted node "${pasted.data.label}".`,
    });
    return pasted;
  },

  deleteSelected: () => {
    const state = get();
    if (state.selectedNodeId) {
      state.deleteNode(state.selectedNodeId);
    } else if (state.selectedEdgeId) {
      state.pushSnapshot();
      set({
        edges: state.edges.filter((e) => e.id !== state.selectedEdgeId),
        selectedEdgeId: null,
        isSaved: false,
      });
    }
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                config: { ...n.data.config, ...config },
              },
            }
          : n,
      ),
      isSaved: false,
    });
  },

  updateNodeLabel: (id, label) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                label,
              },
            }
          : n,
      ),
      isSaved: false,
    });
  },

  updateNodeStatus: (id, status) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                status,
              },
            }
          : n,
      ),
    });
  },

  /* ── Pure Document History (Undo / Redo) ─────────── */
  pushSnapshot: () => {
    const { nodes, edges, undoStack } = get();
    const snap = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    set({
      undoStack: [...undoStack.slice(-49), snap],
      redoStack: [],
    });
  },

  undo: () => {
    const { undoStack, nodes, edges } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [
        ...get().redoStack,
        {
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        },
      ],
      nodes: prev.nodes,
      edges: prev.edges,
      isSaved: false,
    });
  },

  redo: () => {
    const { redoStack, nodes, edges } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [
        ...get().undoStack,
        {
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        },
      ],
      nodes: next.nodes,
      edges: next.edges,
      isSaved: false,
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  /* ── Persistence ─────────────────────────────────── */
  saveWorkflow: async () => {
    const state = get();
    const workflow: SavedWorkflow = {
      id: state.workflowId,
      name: state.workflowName,
      nodes: state.nodes,
      edges: state.edges,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await WorkflowPersistence.saveWorkflow(workflow);
    set({ isSaved: true });
    state.addLog({
      level: 'success',
      message: `Workflow "${state.workflowName}" saved successfully.`,
    });
  },

  loadWorkflow: (id: string) => {
    const loaded = WorkflowPersistence.getWorkflow(id);
    if (!loaded) return false;
    get().loadWorkflowFromData(loaded);
    return true;
  },

  loadWorkflowFromData: (data: SavedWorkflow) => {
    set({
      workflowId: data.id,
      workflowName: data.name,
      nodes: data.nodes,
      edges: data.edges,
      isSaved: true,
      selectedNodeId: null,
      selectedEdgeId: null,
      undoStack: [],
      redoStack: [],
    });
    get().addLog({
      level: 'info',
      message: `Loaded workflow "${data.name}" (${data.nodes.length} nodes).`,
    });
  },

  createNewWorkflow: (name = 'New Workflow') => {
    set({
      workflowId: `wf-${Date.now().toString(36)}`,
      workflowName: name,
      nodes: [],
      edges: [],
      isSaved: true,
      selectedNodeId: null,
      selectedEdgeId: null,
      undoStack: [],
      redoStack: [],
    });
    get().addLog({
      level: 'info',
      message: `Created new workflow "${name}".`,
    });
  },

  /* ── UI Actions ──────────────────────────────────── */
  setSelectedNodeId: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  setSelectedEdgeId: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  toggleLeftSidebar: () => set({ leftSidebarOpen: !get().leftSidebarOpen }),
  toggleRightSidebar: () => set({ rightSidebarOpen: !get().rightSidebarOpen }),
  toggleBottomPanel: () => set({ bottomPanelOpen: !get().bottomPanelOpen }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  setValidationErrors: (errors) => set({ validationErrors: errors }),

  /* ── Execution Actions (Stage 4 Engine Integration) ─ */
  runWorkflow: async () => {
    const state = get();

    // 1. Pre-execution graph validation
    const errors = state.validate();
    const hasFatal = errors.some((e) => e.severity === 'error');
    if (hasFatal) {
      set({ bottomTab: 'errors' });
      if (!state.bottomPanelOpen) set({ bottomPanelOpen: true });
      state.addLog({
        level: 'error',
        message: `Execution blocked: ${errors.filter((e) => e.severity === 'error').length} validation error(s) present.`,
      });
      throw new Error('Workflow validation failed');
    }

    // 2. Open bottom logs panel
    set({ isRunning: true, bottomTab: 'logs' });
    if (!state.bottomPanelOpen) set({ bottomPanelOpen: true });

    // 3. Reset all nodes to pending or idle
    set({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' },
      })),
      nodeRecords: {},
    });

    activeEngine = new WorkflowEngine();

    const result = await activeEngine.executeWorkflow(
      state.workflowId,
      state.nodes,
      state.edges,
      {
        maxConcurrency: 4,
        onNodeStateChange: (record) => {
          // Update visual node status on canvas
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === record.nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      status: record.state,
                    },
                  }
                : n,
            ),
            nodeRecords: {
              ...s.nodeRecords,
              [record.nodeId]: record,
            },
          }));
        },
        onLog: (logItem) => {
          get().addLog(logItem);
        },
      },
    );

    activeEngine = null;
    set((s) => ({
      isRunning: false,
      executionHistory: [result, ...s.executionHistory.slice(0, 19)],
    }));

    return result;
  },

  cancelExecution: () => {
    if (activeEngine) {
      activeEngine.abort();
      activeEngine = null;
    }
    set({ isRunning: false });
    get().addLog({ level: 'warn', message: 'Workflow execution cancelled by user.' });
  },

  clearLogs: () => set({ logs: [] }),

  addLog: (log) =>
    set((s) => ({
      logs: [
        ...s.logs,
        {
          ...log,
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
        },
      ],
    })),

  validate: () => {
    const { nodes, edges } = get();
    const errors = validateWorkflowGraph(nodes, edges);
    set({ validationErrors: errors });
    return errors;
  },
}));
