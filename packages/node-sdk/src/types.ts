import type {
  BaseWorkflowNode,
  BaseWorkflowEdge,
  NodeStatus,
} from '@flowforge/workflow-schema';

export type NodeExecutionState = NodeStatus;

export interface NodeExecutionRecord {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  state: NodeExecutionState;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  error?: string;
  selectedBranch?: 'true' | 'false';
}

export interface NodeExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  selectedBranch?: 'true' | 'false';
}

export interface ExecutionContext<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
> {
  executionId: string;
  workflowId: string;
  node: TNode;
  upstreamOutputs: Record<string, Record<string, unknown>>;
  incomingPayload: Record<string, unknown>;
  incomingEdge?: TEdge;
  emitLog: (level: 'info' | 'warn' | 'error' | 'log', message: string) => void;
  signal?: AbortSignal;
}

export interface NodeExecutor<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
> {
  execute(context: ExecutionContext<TNode, TEdge>): Promise<NodeExecutionResult>;
}

export interface INodeRegistry {
  getExecutor(type: string): NodeExecutor;
  registerExecutor(type: string, executor: NodeExecutor): void;
  hasExecutor(type: string): boolean;
}
