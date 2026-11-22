import type {
  NodeExecutionRecord,
} from '@flowforge/node-sdk';

/* ── Timeline Events for Debugger ───────────────────── */
export type TimelineEventType =
  | 'workflow_started'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_skipped'
  | 'workflow_completed';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: number;
  nodeId?: string;
  nodeLabel?: string;
  durationMs?: number;
  message: string;
  details?: Record<string, unknown>;
}

/* ── Engine Run Options ─────────────────────────────── */
export interface EngineRunOptions {
  maxConcurrency?: number; // default: 4
  timeoutMs?: number;      // default: 300,000 (5 minutes)
  overrideTriggerPayload?: Record<string, unknown>; // For Testing Lab
  onNodeStateChange?: (record: NodeExecutionRecord) => void;
  onTimelineEvent?: (event: TimelineEvent) => void;
  onLog?: (log: { level: 'info' | 'warn' | 'error' | 'log'; nodeId?: string; nodeLabel?: string; message: string }) => void;
}

/* ── Workflow Run Result ────────────────────────────── */
export interface WorkflowRunResult {
  executionId: string;
  success: boolean;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  nodesExecuted: number;
  nodeRecords: Record<string, NodeExecutionRecord>;
  timeline: TimelineEvent[];
  finalOutputs: Record<string, unknown>;
  error?: string;
}

/* ── Graph Analysis Result ──────────────────────────── */
export interface GraphAnalysisResult {
  isValid: boolean;
  hasCycles: boolean;
  cycleNodes?: string[];
  topologicalOrder: string[]; // Node IDs in Kahn order
  dependencyMap: Record<string, string[]>; // nodeId -> upstream nodeIds
  dependentMap: Record<string, string[]>;  // nodeId -> downstream nodeIds
  missingNodes: string[];
  orphanNodes: string[];
  errors: string[];
}
