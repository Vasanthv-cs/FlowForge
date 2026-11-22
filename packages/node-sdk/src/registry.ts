import type { NodeExecutor, INodeRegistry } from './types';

export class NodeRegistry implements INodeRegistry {
  private executors: Map<string, NodeExecutor> = new Map();

  constructor(initialExecutors?: Record<string, NodeExecutor>) {
    if (initialExecutors) {
      for (const [type, executor] of Object.entries(initialExecutors)) {
        this.executors.set(type, executor);
      }
    }
  }

  public getExecutor(type: string): NodeExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for node type: "${type}"`);
    }
    return executor;
  }

  public registerExecutor(type: string, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  public hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }

  public getAllRegisteredTypes(): string[] {
    return Array.from(this.executors.keys());
  }
}
