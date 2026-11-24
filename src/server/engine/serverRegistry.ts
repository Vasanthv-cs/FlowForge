import type { NodeExecutor, INodeRegistry } from '@flowforge/node-sdk';
import { ManualTriggerExecutor } from '../../engine/executors/ManualTriggerExecutor';
import { WebhookTriggerExecutor } from '../../engine/executors/WebhookTriggerExecutor';
import { ScheduleTriggerExecutor } from '../../engine/executors/ScheduleTriggerExecutor';
import { ServerHttpRequestExecutor } from './ServerHttpRequestExecutor';
import { TransformExecutor } from '../../engine/executors/TransformExecutor';
import { ConditionExecutor } from '../../engine/executors/ConditionExecutor';
import { DelayExecutor } from '../../engine/executors/DelayExecutor';
import { ConsoleOutputExecutor } from '../../engine/executors/ConsoleOutputExecutor';
import { JsonParseExecutor } from '../../engine/executors/JsonParseExecutor';
import { JsonStringifyExecutor } from '../../engine/executors/JsonStringifyExecutor';
import { SetDataExecutor } from '../../engine/executors/SetDataExecutor';
import { MergeDataExecutor } from '../../engine/executors/MergeDataExecutor';
import { FilterDataExecutor } from '../../engine/executors/FilterDataExecutor';
import { MapDataExecutor } from '../../engine/executors/MapDataExecutor';
import { StringOperationsExecutor } from '../../engine/executors/StringOperationsExecutor';
import { DateTimeExecutor } from '../../engine/executors/DateTimeExecutor';
import { MathOperationsExecutor } from '../../engine/executors/MathOperationsExecutor';
import { WebhookResponseExecutor } from '../../engine/executors/WebhookResponseExecutor';

export class ServerNodeRegistry implements INodeRegistry {
  private executors: Map<string, NodeExecutor> = new Map([
    ['manual-trigger', new ManualTriggerExecutor()],
    ['webhook-trigger', new WebhookTriggerExecutor()],
    ['schedule-trigger', new ScheduleTriggerExecutor()],
    ['http-request', new ServerHttpRequestExecutor()],
    ['transform-data', new TransformExecutor()],
    ['condition', new ConditionExecutor()],
    ['delay', new DelayExecutor()],
    ['console-output', new ConsoleOutputExecutor()],
    ['json-parse', new JsonParseExecutor()],
    ['json-stringify', new JsonStringifyExecutor()],
    ['set-data', new SetDataExecutor()],
    ['merge-data', new MergeDataExecutor()],
    ['filter-data', new FilterDataExecutor()],
    ['map-data', new MapDataExecutor()],
    ['string-operations', new StringOperationsExecutor()],
    ['date-time', new DateTimeExecutor()],
    ['math-operations', new MathOperationsExecutor()],
    ['webhook-response', new WebhookResponseExecutor()],
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
