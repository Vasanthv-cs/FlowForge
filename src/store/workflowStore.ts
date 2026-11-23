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
import { cloudWorkflowService, isUUID, generateUUID } from '@/services/cloudWorkflowService';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAuthStore } from '@/store/authStore';
import { idbStorage } from '@/lib/indexedDb';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

/* ── 1. Document State Slice (Persisted & Versioned) ── */
export interface DocumentState {
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isSaved: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  saveError: string | null;
  isCloudWorkflow: boolean;
  workspaceId: string | null;
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
  saveWorkflow: (forceCloud?: boolean) => Promise<boolean>;
  loadWorkflow: (id: string) => boolean;
  loadWorkflowFromData: (
    data: SavedWorkflow,
    options?: { isCloud?: boolean; workspaceId?: string | null }
  ) => void;
  createNewWorkflow: (
    name?: string,
    options?: { isCloud?: boolean; workspaceId?: string | null }
  ) => void;
  loadCloudWorkflow: (id: string) => Promise<boolean>;
  deleteCloudWorkflow: (id: string) => Promise<boolean>;
  importLocalWorkflowToCloud: (localId: string, workspaceId: string) => Promise<string | null>;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  setWorkspaceId: (workspaceId: string | null) => void;
  setIsCloudWorkflow: (isCloud: boolean) => void;

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
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let isSaveInProgress = false;
let dirtyWhileSaving = false;
let saveSequence = 0;

export function cancelPendingAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

export function triggerDebouncedAutosave() {
  cancelPendingAutosave();
  autosaveTimer = setTimeout(() => {
    const state = useWorkflowStore.getState();
    if (!state.isSaved || state.saveStatus === 'unsaved') {
      state.saveWorkflow();
    }
  }, 1500);
}

function markDocumentDirty(set: (fn: (prev: FullWorkflowStore) => Partial<FullWorkflowStore>) => void) {
  if (isSaveInProgress) {
    dirtyWhileSaving = true;
  }
  set(() => ({
    isSaved: false,
    saveStatus: 'unsaved',
    saveError: null,
  }));
  triggerDebouncedAutosave();
}

export const useWorkflowStore = create<FullWorkflowStore>((set, get) => ({
  /* ── 1. Document State Initial ───────────────────── */
  workflowId: `wf-${Date.now().toString(36)}`,
  workflowName: 'Customer Onboarding Workflow',
  nodes: [],
  edges: [],
  isSaved: true,
  saveStatus: 'saved',
  lastSavedAt: null,
  saveError: null,
  isCloudWorkflow: false,
  workspaceId: null,
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
    set({ workflowName: name });
    markDocumentDirty(set);
  },

  setNodes: (nodes) => {
    set({ nodes });
    markDocumentDirty(set);
  },

  setEdges: (edges) => {
    set({ edges });
    markDocumentDirty(set);
  },

  onNodesChange: (changes) => {
    const state = get();
    set({
      nodes: applyNodeChanges(state.nodes, changes),
    });
    // If changes affected node positions, selections, or removal
    markDocumentDirty(set);
  },

  onEdgesChange: (changes) => {
    const state = get();
    set({
      edges: applyEdgeChanges(state.edges, changes),
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
    return newNode;
  },

  deleteNode: (id) => {
    const state = get();
    state.pushSnapshot();
    set({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
      });
      markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
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
    });
    markDocumentDirty(set);
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  /* ── Persistence ─────────────────────────────────── */
  setSaveStatus: (status, error = null) => {
    set({
      saveStatus: status,
      isSaved: status === 'saved',
      saveError: error,
    });
  },

  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setIsCloudWorkflow: (isCloud) => set({ isCloudWorkflow: isCloud }),

  saveWorkflow: async (forceCloud?: boolean): Promise<boolean> => {
    const state = get();
    if (isSaveInProgress) {
      dirtyWhileSaving = true;
      return false;
    }

    cancelPendingAutosave();
    isSaveInProgress = true;
    const currentSeq = ++saveSequence;

    set({ saveStatus: 'saving', saveError: null });

    const isCloud = forceCloud ?? state.isCloudWorkflow;
    const targetWorkspaceId = state.workspaceId || useWorkspaceStore.getState().activeWorkspaceId;

    const currentWorkflowData: SavedWorkflow = {
      id: state.workflowId,
      name: state.workflowName,
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      if (isCloud && targetWorkspaceId) {
        if (isUUID(state.workflowId)) {
          const { error } = await cloudWorkflowService.saveWorkflow(
            state.workflowId,
            state.workflowName,
            currentWorkflowData
          );
          if (error) throw new Error(error);
        } else {
          const { data: newId, error } = await cloudWorkflowService.createWorkflow(
            targetWorkspaceId,
            state.workflowName,
            currentWorkflowData
          );
          if (error || !newId) throw new Error(error || 'Failed to create cloud workflow');
          currentWorkflowData.id = newId;
          set({
            workflowId: newId,
            isCloudWorkflow: true,
            workspaceId: targetWorkspaceId,
          });
        }

        // Dual write to local storage cache
        await WorkflowPersistence.saveWorkflow(currentWorkflowData);
        await idbStorage.saveWorkflow(currentWorkflowData);
      } else {
        // Local persistence
        await WorkflowPersistence.saveWorkflow(currentWorkflowData);
        await idbStorage.saveWorkflow(currentWorkflowData);
      }

      if (currentSeq === saveSequence && !dirtyWhileSaving) {
        set({
          isSaved: true,
          saveStatus: 'saved',
          lastSavedAt: Date.now(),
          saveError: null,
        });
        state.addLog({
          level: 'success',
          message: `Workflow "${state.workflowName}" saved successfully${isCloud ? ' (Cloud)' : ''}.`,
        });
        return true;
      } else {
        dirtyWhileSaving = false;
        triggerDebouncedAutosave();
        return true;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save workflow';
      set({
        saveStatus: 'error',
        saveError: errorMsg,
        isSaved: false,
      });
      state.addLog({
        level: 'error',
        message: `Save failed: ${errorMsg}`,
      });
      return false;
    } finally {
      isSaveInProgress = false;
    }
  },

  loadWorkflow: (id: string) => {
    const loaded = WorkflowPersistence.getWorkflow(id);
    if (!loaded) return false;
    get().loadWorkflowFromData(loaded, { isCloud: false, workspaceId: null });
    return true;
  },

  loadCloudWorkflow: async (id: string): Promise<boolean> => {
    cancelPendingAutosave();
    const { data, error } = await cloudWorkflowService.getWorkflow(id);
    if (error || !data) {
      get().addLog({
        level: 'error',
        message: `Failed to load cloud workflow: ${error || 'Not found'}`,
      });
      return false;
    }

    const def = data.definition;
    set({
      workflowId: data.id,
      workflowName: data.name,
      workspaceId: data.workspaceId,
      isCloudWorkflow: true,
      nodes: def.nodes || [],
      edges: def.edges || [],
      isSaved: true,
      saveStatus: 'saved',
      lastSavedAt: Date.now(),
      saveError: null,
      selectedNodeId: null,
      selectedEdgeId: null,
      undoStack: [],
      redoStack: [],
    });

    // Dual write cache
    await WorkflowPersistence.saveWorkflow(def);
    await idbStorage.saveWorkflow(def);

    get().addLog({
      level: 'info',
      message: `Loaded cloud workflow "${data.name}" (${def.nodes?.length || 0} nodes).`,
    });
    return true;
  },

  deleteCloudWorkflow: async (id: string): Promise<boolean> => {
    const { error } = await cloudWorkflowService.deleteWorkflow(id);
    if (error) {
      get().addLog({
        level: 'error',
        message: `Failed to delete cloud workflow: ${error}`,
      });
      return false;
    }

    if (get().workflowId === id) {
      get().createNewWorkflow('Untitled Workflow', {
        isCloud: true,
        workspaceId: get().workspaceId,
      });
    }

    get().addLog({
      level: 'info',
      message: 'Deleted cloud workflow successfully.',
    });
    return true;
  },

  importLocalWorkflowToCloud: async (localId: string, targetWorkspaceId: string): Promise<string | null> => {
    const local = WorkflowPersistence.getWorkflow(localId);
    if (!local) {
      get().addLog({ level: 'error', message: 'Local workflow not found.' });
      return null;
    }

    const { data: newCloudId, error } = await cloudWorkflowService.createWorkflow(
      targetWorkspaceId,
      local.name,
      local
    );

    if (error || !newCloudId) {
      get().addLog({ level: 'error', message: `Cloud import failed: ${error || 'Unknown error'}` });
      return null;
    }

    get().addLog({
      level: 'success',
      message: `Imported "${local.name}" to cloud workspace successfully.`,
    });
    return newCloudId;
  },

  loadWorkflowFromData: (
    data: SavedWorkflow,
    options?: { isCloud?: boolean; workspaceId?: string | null }
  ) => {
    cancelPendingAutosave();
    const isCloud = options?.isCloud ?? isUUID(data.id);
    set({
      workflowId: data.id,
      workflowName: data.name,
      nodes: data.nodes || [],
      edges: data.edges || [],
      isSaved: true,
      saveStatus: 'saved',
      lastSavedAt: Date.now(),
      saveError: null,
      isCloudWorkflow: isCloud,
      workspaceId: options?.workspaceId ?? (isCloud ? get().workspaceId : null),
      selectedNodeId: null,
      selectedEdgeId: null,
      undoStack: [],
      redoStack: [],
    });
    get().addLog({
      level: 'info',
      message: `Loaded workflow "${data.name}" (${data.nodes?.length || 0} nodes).`,
    });
  },

  createNewWorkflow: (
    name = 'New Workflow',
    options?: { isCloud?: boolean; workspaceId?: string | null }
  ) => {
    cancelPendingAutosave();
    const isCloud = options?.isCloud ?? false;
    const newId = isCloud ? generateUUID() : `wf-${Date.now().toString(36)}`;
    set({
      workflowId: newId,
      workflowName: name,
      nodes: [],
      edges: [],
      isSaved: true,
      saveStatus: 'saved',
      lastSavedAt: null,
      saveError: null,
      isCloudWorkflow: isCloud,
      workspaceId: options?.workspaceId ?? null,
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

  /* ── Execution Actions (Stage 4 Engine Integration & Batch 5 Persistence) ─ */
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

    // 2. Open bottom logs panel & generate execution ID
    const executionId = generateUUID();
    set({ isRunning: true, executionId, bottomTab: 'logs' });
    if (!state.bottomPanelOpen) set({ bottomPanelOpen: true });

    // 3. Reset all nodes to idle
    set({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, status: 'idle' },
      })),
      nodeRecords: {},
    });

    const isCloud = state.isCloudWorkflow && isUUID(state.workflowId);
    const session = useAuthStore.getState().session;

    // 4. Cloud Workflow: Execute on Fastify Backend API with SSRF protection when signed in
    if (isCloud && state.workspaceId && session?.access_token) {
      if (!state.isSaved || state.saveStatus === 'unsaved') {
        await state.saveWorkflow();
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

      try {
        const executeRes = await fetch(
          `${apiUrl}/api/workspaces/${state.workspaceId}/workflows/${state.workflowId}/execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ triggerPayload: {} }),
          }
        );

        if (!executeRes.ok) {
          const errData = await executeRes.json().catch(() => ({}));
          const errMsg = (errData as { message?: string }).message || `Execution initiation failed (status ${executeRes.status})`;
          state.addLog({ level: 'error', message: `[Server API] ${errMsg}` });
          set({ isRunning: false });
          throw new Error(errMsg);
        }

        const { executionId: serverExecId } = await executeRes.json();
        set({ executionId: serverExecId });
        state.addLog({
          level: 'info',
          message: `[Server API] Workflow execution initiated on server (ID: ${serverExecId}).`,
        });

        // Poll execution details until terminal state
        let isDone = false;
        let attempts = 0;
        const maxAttempts = 75; // 60s max
        let finalResult: WorkflowRunResult | null = null;

        while (!isDone && attempts < maxAttempts) {
          await new Promise((res) => setTimeout(res, 800));
          attempts++;

          if (!get().isRunning) break;

          try {
            const detailRes = await fetch(
              `${apiUrl}/api/workspaces/${state.workspaceId}/executions/${serverExecId}`,
              {
                headers: { Authorization: `Bearer ${session.access_token}` },
              }
            );

            if (!detailRes.ok) continue;

            const { execution } = await detailRes.json();
            if (!execution) continue;

            // Update canvas node states
            if (Array.isArray(execution.nodeExecutions)) {
              const records: Record<string, NodeExecutionRecord> = {};
              const nodeStatusMap = new Map<string, string>();

              for (const ne of execution.nodeExecutions) {
                nodeStatusMap.set(ne.nodeId, ne.status);
                records[ne.nodeId] = {
                  nodeId: ne.nodeId,
                  nodeType: ne.nodeType,
                  nodeLabel: ne.nodeLabel,
                  state: ne.status,
                  inputData: ne.inputPayload,
                  outputData: ne.outputPayload,
                  error: ne.errorMessage,
                  durationMs: ne.durationMs,
                  startedAt: ne.startedAt ? new Date(ne.startedAt).getTime() : undefined,
                  completedAt: ne.finishedAt ? new Date(ne.finishedAt).getTime() : undefined,
                };
              }

              set((s) => ({
                nodes: s.nodes.map((n) => {
                  const st = nodeStatusMap.get(n.id);
                  return st ? { ...n, data: { ...n.data, status: st as NodeStatus } } : n;
                }),
                nodeRecords: { ...s.nodeRecords, ...records },
              }));
            }

            if (['success', 'failed', 'cancelled'].includes(execution.status)) {
              isDone = true;
              const isSuccess = execution.status === 'success';
              set({ isRunning: false });

              get().addLog({
                level: isSuccess ? 'info' : 'error',
                message: `[Server API] Workflow finished with status "${execution.status}"${
                  execution.errorMessage ? `: ${execution.errorMessage}` : ''
                }.`,
              });

              const completedRunResult: WorkflowRunResult = {
                executionId: serverExecId,
                success: isSuccess,
                startedAt: execution.startedAt ? new Date(execution.startedAt).getTime() : Date.now(),
                completedAt: execution.finishedAt ? new Date(execution.finishedAt).getTime() : Date.now(),
                durationMs: execution.durationMs || 0,
                nodesExecuted: execution.nodeExecutions?.length || 0,
                nodeRecords: get().nodeRecords,
                finalOutputs: ((execution.outputPayload as Record<string, unknown>) || {}) as Record<string, unknown>,
                timeline: (
                  (execution.events || []) as Array<{
                    id: string | number;
                    eventType: string;
                    createdAt: string;
                    message: string;
                    nodeId?: string | null;
                  }>
                ).map((ev) => ({
                  id: String(ev.id),
                  type: (ev.eventType || 'node_completed') as import('@flowforge/workflow-core').TimelineEvent['type'],
                  timestamp: new Date(ev.createdAt).getTime(),
                  message: ev.message,
                  nodeId: ev.nodeId ?? undefined,
                })),
                error: execution.errorMessage,
              };

              finalResult = completedRunResult;

              set((s) => ({
                executionHistory: [completedRunResult, ...s.executionHistory.slice(0, 19)],
              }));

              return completedRunResult;
            }
          } catch (pollErr) {
            console.warn('[WorkflowStore] Polling execution failed:', pollErr);
          }
        }

        set({ isRunning: false });
        if (finalResult) return finalResult;

        const timeoutResult: WorkflowRunResult = {
          executionId: serverExecId,
          success: false,
          startedAt: Date.now() - attempts * 800,
          completedAt: Date.now(),
          durationMs: attempts * 800,
          nodesExecuted: Object.keys(get().nodeRecords).length,
          nodeRecords: get().nodeRecords,
          finalOutputs: {},
          timeline: [],
          error: 'Execution polling timed out after 60 seconds',
        };
        return timeoutResult;
      } catch (cloudErr: unknown) {
        if (cloudErr instanceof Error && cloudErr.message.includes('status')) {
          set({ isRunning: false });
          throw cloudErr;
        }
        state.addLog({
          level: 'warn',
          message: `[Server API] Backend execution service unreachable (${cloudErr instanceof Error ? cloudErr.message : 'offline'}). Falling back to in-browser execution.`,
        });
      }
    }

    // 5. Local/Offline Workflow: In-browser execution engine
    activeEngine = new WorkflowEngine();

    let result: WorkflowRunResult;
    try {
      result = await activeEngine.executeWorkflow(
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
    } catch (runErr) {
      activeEngine = null;
      set({ isRunning: false });
      throw runErr;
    }

    activeEngine = null;

    set((s) => ({
      isRunning: false,
      executionHistory: [result, ...s.executionHistory.slice(0, 19)],
    }));

    return result;
  },

  cancelExecution: () => {
    const state = get();
    if (activeEngine) {
      activeEngine.abort();
      activeEngine = null;
    }
    const isCloud = state.isCloudWorkflow && isUUID(state.workflowId);
    if (isCloud && state.executionId && state.workspaceId) {
      const session = useAuthStore.getState().session;
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      if (session?.access_token) {
        fetch(
          `${apiUrl}/api/workspaces/${state.workspaceId}/executions/${state.executionId}/cancel`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        ).catch(() => {});
      }
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
