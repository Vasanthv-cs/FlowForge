import { InputField } from '../fields/InputField';
import { SelectField } from '../fields/SelectField';
import type { WorkflowNode } from '@/types/workflow';
import type { FilterDataConfig } from '@/types/nodeConfigs';

interface FilterDataConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<FilterDataConfig>) => void;
}

const operatorOptions = [
  { value: 'equals', label: '== Equals' },
  { value: 'not_equals', label: '!= Not Equals' },
  { value: 'greater_than', label: '> Greater Than (Numeric)' },
  { value: 'less_than', label: '< Less Than (Numeric)' },
  { value: 'contains', label: 'Contains (Substring / Sub-element)' },
  { value: 'is_empty', label: 'Is Empty / Null' },
  { value: 'is_not_empty', label: 'Is Not Empty / Populated' },
];

export function FilterDataConfigPanel({
  node,
  onUpdate,
}: FilterDataConfigPanelProps) {
  const config = node.data.config as unknown as FilterDataConfig;
  const operator = config.operator ?? 'equals';
  const needsTargetValue = !['is_empty', 'is_not_empty'].includes(operator);

  return (
    <div className="space-y-4">
      <InputField
        label="Array Path"
        description="Path to target array in incoming data (leave empty if input root is array)"
        value={config.arrayPath ?? ''}
        onChange={(e) => onUpdate({ arrayPath: e.target.value })}
        placeholder="e.g. items or users.list"
      />

      <InputField
        label="Item Field"
        description="Object property within each item to test (leave empty for primitive arrays)"
        value={config.itemField ?? ''}
        onChange={(e) => onUpdate({ itemField: e.target.value })}
        placeholder="e.g. status or score"
      />

      <SelectField
        label="Filter Operator"
        description="Comparison check to determine if an item is kept"
        value={operator}
        onChange={(e) =>
          onUpdate({ operator: e.target.value as FilterDataConfig['operator'] })
        }
        options={operatorOptions}
        required
      />

      {needsTargetValue && (
        <InputField
          label="Target Value"
          description="Value to compare against"
          value={config.targetValue ?? ''}
          onChange={(e) => onUpdate({ targetValue: e.target.value })}
          placeholder="e.g. active or 100"
          required
        />
      )}

      <InputField
        label="Output Key"
        description="Key name where the filtered array will be placed in output"
        value={config.outputKey ?? 'filtered'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="filtered"
        required
      />
    </div>
  );
}
