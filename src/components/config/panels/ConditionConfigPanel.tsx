import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import type { WorkflowNode } from '@/types/workflow';
import type { ConditionConfig, ConditionOperator } from '@/types/nodeConfigs';

interface ConditionConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<ConditionConfig>) => void;
}

const operatorOptions = [
  { value: 'equals', label: '== Equals' },
  { value: 'not_equals', label: '!= Does Not Equal' },
  { value: 'greater_than', label: '> Greater Than (Numeric)' },
  { value: 'less_than', label: '< Less Than (Numeric)' },
  { value: 'contains', label: 'Contains (Substring / Array)' },
  { value: 'starts_with', label: 'Starts With (String)' },
  { value: 'is_empty', label: 'Is Empty / Null / Falsy' },
  { value: 'is_not_empty', label: 'Is Not Empty / Truthy' },
];

export function ConditionConfigPanel({
  node,
  onUpdate,
}: ConditionConfigPanelProps) {
  const config = node.data.config as unknown as ConditionConfig;
  const hideRightOperand =
    config.operator === 'is_empty' || config.operator === 'is_not_empty';

  return (
    <div className="space-y-4">
      <InputField
        label="Left Operand"
        description="Property or path from input data (e.g. status or code)"
        value={config.leftOperand ?? ''}
        onChange={(e) => onUpdate({ leftOperand: e.target.value })}
        placeholder="status"
        required
      />

      <SelectField
        label="Comparison Operator"
        value={config.operator ?? 'equals'}
        onChange={(e) => onUpdate({ operator: e.target.value as ConditionOperator })}
        options={operatorOptions}
        required
      />

      {!hideRightOperand && (
        <InputField
          label="Right Operand"
          description="Comparison target value"
          value={config.rightOperand ?? ''}
          onChange={(e) => onUpdate({ rightOperand: e.target.value })}
          placeholder="active"
        />
      )}

      {/* Output branch legend */}
      <div className="space-y-2 rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-medium text-emerald-400">True Branch:</span>
          <span className="text-[11px] text-gray-400">Fires when condition passes</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="font-medium text-rose-400">False Branch:</span>
          <span className="text-[11px] text-gray-400">Fires when condition fails</span>
        </div>
      </div>
    </div>
  );
}
