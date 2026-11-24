import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { DateTimeConfig, DateFormat } from '@flowforge/workflow-schema';
import { getNestedProperty } from '../propertyHelper';

function formatDate(date: Date, format: DateFormat): string | number {
  switch (format) {
    case 'timestamp_ms':
      return date.getTime();
    case 'utc_string':
      return date.toUTCString();
    case 'date_only':
      return date.toISOString().split('T')[0];
    case 'time_only':
      return date.toISOString().split('T')[1].replace('Z', '');
    case 'iso':
    default:
      return date.toISOString();
  }
}

export class DateTimeExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as DateTimeConfig;
    const {
      operation = 'current_timestamp',
      inputDate = '',
      outputFormat = 'iso',
      amount = 0,
      unit = 'hours',
      outputKey = 'timestamp',
    } = config || {};
    const input = context.incomingPayload;

    try {
      let baseDate: Date;

      if (operation === 'current_timestamp' || !inputDate.trim()) {
        baseDate = new Date();
      } else {
        const resolved = getNestedProperty(input, inputDate);
        const dateInput = resolved !== undefined ? resolved : inputDate;
        baseDate = new Date(dateInput as string | number);
      }

      if (isNaN(baseDate.getTime())) {
        return {
          success: false,
          error: `Date and Time error: Invalid date string "${inputDate}".`,
        };
      }

      if (operation === 'add' || operation === 'subtract') {
        const multiplier = operation === 'add' ? 1 : -1;
        const delta = amount * multiplier;

        switch (unit) {
          case 'seconds':
            baseDate.setUTCSeconds(baseDate.getUTCSeconds() + delta);
            break;
          case 'minutes':
            baseDate.setUTCMinutes(baseDate.getUTCMinutes() + delta);
            break;
          case 'hours':
            baseDate.setUTCHours(baseDate.getUTCHours() + delta);
            break;
          case 'days':
            baseDate.setUTCDate(baseDate.getUTCDate() + delta);
            break;
        }
      }

      const formatted = formatDate(baseDate, outputFormat);

      context.emitLog('info', `Date and Time operation "${operation}" formatted to "${outputFormat}".`);
      return {
        success: true,
        output: {
          [outputKey]: formatted,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Date operation failed';
      context.emitLog('error', `Date and Time failed: ${msg}`);
      return {
        success: false,
        error: `Date and Time error: ${msg}`,
      };
    }
  }
}
