import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from './types';
import type { BaseWorkflowNode, BaseWorkflowEdge } from '@flowforge/workflow-schema';

export abstract class BaseExecutor<
  TNode extends BaseWorkflowNode = BaseWorkflowNode,
  TEdge extends BaseWorkflowEdge = BaseWorkflowEdge,
> implements NodeExecutor<TNode, TEdge> {
  abstract execute(context: ExecutionContext<TNode, TEdge>): Promise<NodeExecutionResult>;

  protected success(output: Record<string, unknown> = {}, selectedBranch?: 'true' | 'false'): NodeExecutionResult {
    return {
      success: true,
      output,
      selectedBranch,
    };
  }

  protected failure(error: string): NodeExecutionResult {
    return {
      success: false,
      error,
    };
  }
}
