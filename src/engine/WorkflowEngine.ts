import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import type {
  WorkflowRunResult,
  EngineRunOptions,
} from '@flowforge/workflow-core';
import { WorkflowEngine as CoreWorkflowEngine } from '@flowforge/workflow-core';
import { defaultNodeRegistry } from './registry';

/**
 * WorkflowEngine for studio client execution, backed by @flowforge/workflow-core.
 */
export class WorkflowEngine {
  private readonly coreEngine: CoreWorkflowEngine<WorkflowNode, WorkflowEdge>;

  constructor() {
    this.coreEngine = new CoreWorkflowEngine<WorkflowNode, WorkflowEdge>(defaultNodeRegistry);
  }

  public executeWorkflow(
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    options: EngineRunOptions = {},
  ): Promise<WorkflowRunResult> {
    return this.coreEngine.executeWorkflow(workflowId, nodes, edges, options);
  }

  public abort(): void {
    this.coreEngine.abort();
  }
}
