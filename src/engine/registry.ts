import type { NodeExecutor, INodeRegistry } from '@flowforge/node-sdk';
import { ManualTriggerExecutor } from './executors/ManualTriggerExecutor';
import { HttpRequestExecutor } from './executors/HttpRequestExecutor';
import { TransformExecutor } from './executors/TransformExecutor';
import { ConditionExecutor } from './executors/ConditionExecutor';
import { DelayExecutor } from './executors/DelayExecutor';
import { ConsoleOutputExecutor } from './executors/ConsoleOutputExecutor';

export class DefaultNodeRegistry implements INodeRegistry {
  private executors: Map<string, NodeExecutor> = new Map([
    ['manual-trigger', new ManualTriggerExecutor()],
    ['http-request', new HttpRequestExecutor()],
    ['transform-data', new TransformExecutor()],
    ['condition', new ConditionExecutor()],
    ['delay', new DelayExecutor()],
    ['console-output', new ConsoleOutputExecutor()],
  ]);

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
}

export const defaultNodeRegistry = new DefaultNodeRegistry();

/**
 * Backward-compatible static wrapper
 */
export class NodeRegistry {
  public static getExecutor(type: string): NodeExecutor {
    return defaultNodeRegistry.getExecutor(type);
  }

  public static registerExecutor(type: string, executor: NodeExecutor): void {
    defaultNodeRegistry.registerExecutor(type, executor);
  }

  public static hasExecutor(type: string): boolean {
    return defaultNodeRegistry.hasExecutor(type);
  }
}
