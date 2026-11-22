import { z } from 'zod';

/* ── Node Category ──────────────────────────────────── */
export type NodeCategory = 'trigger' | 'data' | 'logic' | 'utility';

export const nodeCategorySchema = z.enum(['trigger', 'data', 'logic', 'utility']);

/* ── Port Definition ────────────────────────────────── */
export type PortDataType = 'string' | 'number' | 'boolean' | 'any' | 'object' | 'array';

export interface NodePortDefinition {
  id: string;
  label: string;
  type: PortDataType;
}

export const nodePortSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'any', 'object', 'array']),
});

/* ── Execution Status ───────────────────────────────── */
export type NodeStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export const nodeStatusSchema = z.enum([
  'idle',
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
]);

/* ── Node Metadata Catalog ──────────────────────────── */
export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  icon: string;
  color: string;
  inputs: NodePortDefinition[];
  outputs: NodePortDefinition[];
  defaultConfig: Record<string, unknown>;
}

/* ── Node Payload Data ──────────────────────────────── */
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

export interface XYPosition {
  x: number;
  y: number;
}

export type FlowPosition = 'left' | 'right' | 'top' | 'bottom';

/**
 * Base node interface independent of React Flow.
 */
export interface BaseWorkflowNode<TData = WorkflowNodeData> {
  id: string;
  position: XYPosition;
  data: TData;
  type?: string;
  sourcePosition?: FlowPosition;
  targetPosition?: FlowPosition;
  hidden?: boolean;
  selected?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  selectable?: boolean;
  deletable?: boolean;
  [key: string]: unknown;
}
