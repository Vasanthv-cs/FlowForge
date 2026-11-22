import type { Node, Edge } from '@xyflow/react';
import type {
  WorkflowNodeData as BaseWorkflowNodeData,
  SavedWorkflow,
} from '@flowforge/workflow-schema';

export * from '@flowforge/workflow-schema';

export type WorkflowNode = Node<BaseWorkflowNodeData>;
export type WorkflowEdge = Edge;
export type Workflow = SavedWorkflow<WorkflowNode, WorkflowEdge>;
