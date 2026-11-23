import type { NodeExecutor, INodeRegistry } from '@flowforge/node-sdk';
import { ManualTriggerExecutor } from '../../engine/executors/ManualTriggerExecutor';
import { ServerHttpRequestExecutor } from './ServerHttpRequestExecutor';
import { TransformExecutor } from '../../engine/executors/TransformExecutor';
import { ConditionExecutor } from '../../engine/executors/ConditionExecutor';
import { DelayExecutor } from '../../engine/executors/DelayExecutor';
import { ConsoleOutputExecutor } from '../../engine/executors/ConsoleOutputExecutor';

export class ServerNodeRegistry implements INodeRegistry {
  private executors: Map<string, NodeExecutor> = new Map([
    ['manual-trigger', new ManualTriggerExecutor()],
    ['http-request', new ServerHttpRequestExecutor()],
    ['transform-data', new TransformExecutor()],
    ['condition', new ConditionExecutor()],
    ['delay', new DelayExecutor()],
    ['console-output', new ConsoleOutputExecutor()],
  ]);

  public getExecutor(type: string): NodeExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`[Server Registry] No executor registered for node type: "${type}"`);
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

export const serverNodeRegistry = new ServerNodeRegistry();
