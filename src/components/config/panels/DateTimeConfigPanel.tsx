import { InputField } from '../fields/InputField';
import { SelectField } from '../fields/SelectField';
import { NumberField } from '../fields/NumberField';
import type { WorkflowNode } from '@/types/workflow';
import type { DateTimeConfig } from '@/types/nodeConfigs';

interface DateTimeConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<DateTimeConfig>) => void;
}

const operationOptions = [
  { value: 'current_timestamp', label: 'Current Timestamp (Now)' },
  { value: 'format', label: 'Format Existing Date' },
  { value: 'add', label: 'Add Time Interval' },
  { value: 'subtract', label: 'Subtract Time Interval' },
];

const formatOptions = [
  { value: 'iso', label: 'ISO 8601 (e.g. 2026-11-24T12:00:00.000Z)' },
  { value: 'utc_string', label: 'UTC String (e.g. Tue, 24 Nov 2026 12:00:00 GMT)' },
  { value: 'timestamp_ms', label: 'Unix Timestamp in Milliseconds (e.g. 1795400000000)' },
  { value: 'date_only', label: 'Date Only YYYY-MM-DD (e.g. 2026-11-24)' },
  { value: 'time_only', label: 'Time Only HH:MM:SS (e.g. 12:00:00)' },
];

const unitOptions = [
  { value: 'milliseconds', label: 'Milliseconds' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

export function DateTimeConfigPanel({
  node,
  onUpdate,
}: DateTimeConfigPanelProps) {
  const config = node.data.config as unknown as DateTimeConfig;
  const op = config.operation ?? 'current_timestamp';
  const needsInputDate = op !== 'current_timestamp';
  const needsArithmetic = op === 'add' || op === 'subtract';

  return (
    <div className="space-y-4">
      <SelectField
        label="Date/Time Operation"
        description="Choose date transformation or calculation"
        value={op}
        onChange={(e) =>
          onUpdate({
            operation: e.target.value as DateTimeConfig['operation'],
          })
        }
        options={operationOptions}
        required
      />

      {needsInputDate && (
        <InputField
          label="Input Date / Path"
          description="ISO date string, epoch ms, or payload property path (leave empty for payload root)"
          value={config.inputDate ?? ''}
          onChange={(e) => onUpdate({ inputDate: e.target.value })}
          placeholder="e.g. 2026-11-24 or order.createdAt"
        />
      )}

      {needsArithmetic && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Amount"
            description="Value to adjust by"
            value={config.amount ?? 1}
            onChange={(val) => onUpdate({ amount: val })}
            min={0}
            step={1}
            required
          />
          <SelectField
            label="Time Unit"
            value={config.unit ?? 'days'}
            onChange={(e) =>
              onUpdate({
                unit: e.target.value as DateTimeConfig['unit'],
              })
            }
            options={unitOptions}
            required
          />
        </div>
      )}

      <SelectField
        label="Output Format"
        description="Format representation for output value"
        value={config.outputFormat ?? 'iso'}
        onChange={(e) =>
          onUpdate({
            outputFormat: e.target.value as DateTimeConfig['outputFormat'],
          })
        }
        options={formatOptions}
        required
      />

      <InputField
        label="Output Key"
        description="Key name where the date will be placed in output"
        value={config.outputKey ?? 'timestamp'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="timestamp"
        required
      />
    </div>
  );
}
