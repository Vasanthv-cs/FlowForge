import type { ExecutionContext, NodeExecutionResult } from '../types';

export interface NodeExecutor {
  execute(context: ExecutionContext): Promise<NodeExecutionResult>;
}
