import type { Node, Edge } from '@xyflow/react';

/* ── Node Category ──────────────────────────────────── */
export type NodeCategory = 'trigger' | 'data' | 'logic' | 'utility';

export interface NodePortDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'any' | 'object' | 'array';
}

export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string; // lucide icon name
  color: string; // tailwind color class
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  defaultConfig: Record<string, unknown>;
}

/* ── Workflow Node Execution Status ─────────────────── */
export type NodeStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

/* ── Workflow Node Data ─────────────────────────────── */
export interface WorkflowNodeData {
  label: string;
  type: string;
  category: NodeCategory;
  description: string;
  icon: string;
  color: string;
  config: Record<string, unknown>;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  status?: NodeStatus;
  [key: string]: unknown;
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

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

/* ── Validation Error ───────────────────────────────── */
export interface ValidationError {
  id: string;
  nodeId?: string;
  nodeLabel?: string;
  message: string;
  severity: 'error' | 'warning';
}

/* ── Workflow ───────────────────────────────────────── */
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}
