import type { NodeExecutor } from './executors/BaseExecutor';
import { ManualTriggerExecutor } from './executors/ManualTriggerExecutor';
import { HttpRequestExecutor } from './executors/HttpRequestExecutor';
import { TransformExecutor } from './executors/TransformExecutor';
import { ConditionExecutor } from './executors/ConditionExecutor';
import { DelayExecutor } from './executors/DelayExecutor';
import { ConsoleOutputExecutor } from './executors/ConsoleOutputExecutor';

export class NodeRegistry {
  private static executors: Map<string, NodeExecutor> = new Map([
    ['manual-trigger', new ManualTriggerExecutor()],
    ['http-request', new HttpRequestExecutor()],
    ['transform-data', new TransformExecutor()],
    ['condition', new ConditionExecutor()],
    ['delay', new DelayExecutor()],
    ['console-output', new ConsoleOutputExecutor()],
  ]);

  public static getExecutor(type: string): NodeExecutor {
    const executor = this.executors.get(type);
    if (!executor) {
      throw new Error(`No executor registered for node type: "${type}"`);
    }
    return executor;
  }

  public static registerExecutor(type: string, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  public static hasExecutor(type: string): boolean {
    return this.executors.has(type);
  }
}
