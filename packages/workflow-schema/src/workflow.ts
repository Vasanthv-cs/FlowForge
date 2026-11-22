import type { BaseWorkflowNode } from './nodes';

/* ── Workflow Edge ──────────────────────────────────── */
export interface BaseWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  selected?: boolean;
  [key: string]: unknown;
}

/* ── Validation Error ───────────────────────────────── */
export interface ValidationError {
  id: string;
  nodeId?: string;
  nodeLabel?: string;
  message: string;
  severity: 'error' | 'warning';
}

/* ── Execution Log ──────────────────────────────────── */
export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'log';

export interface ExecutionLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  nodeId?: string;
  nodeLabel?: string;
  message: string;
}

/* ── Saved Workflow Document ────────────────────────── */
export interface SavedWorkflow<
  TNode = BaseWorkflowNode,
  TEdge = BaseWorkflowEdge,
> {
  id: string;
  name: string;
  nodes: TNode[];
  edges: TEdge[];
  createdAt: number;
  updatedAt: number;
}
