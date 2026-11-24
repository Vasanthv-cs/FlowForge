import { InputField } from '../fields/InputField';
import { SelectField } from '../fields/SelectField';
import { NumberField } from '../fields/NumberField';
import type { WorkflowNode } from '@/types/workflow';
import type { MathOperationsConfig } from '@/types/nodeConfigs';

interface MathOperationsConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<MathOperationsConfig>) => void;
}

const operationOptions = [
  { value: 'add', label: '+ Add (Left + Right)' },
  { value: 'subtract', label: '- Subtract (Left - Right)' },
  { value: 'multiply', label: '* Multiply (Left * Right)' },
  { value: 'divide', label: '/ Divide (Left / Right)' },
  { value: 'round', label: 'Round (Left to N decimal places)' },
  { value: 'min', label: 'Minimum (Min of Left and Right)' },
  { value: 'max', label: 'Maximum (Max of Left and Right)' },
];

export function MathOperationsConfigPanel({
  node,
  onUpdate,
}: MathOperationsConfigPanelProps) {
  const config = node.data.config as unknown as MathOperationsConfig;
  const op = config.operation ?? 'add';
  const needsRightOperand = op !== 'round';

  return (
    <div className="space-y-4">
      <SelectField
        label="Math Operation"
        description="Choose mathematical operation"
        value={op}
        onChange={(e) =>
          onUpdate({
            operation: e.target.value as MathOperationsConfig['operation'],
          })
        }
        options={operationOptions}
        required
      />

      <InputField
        label="Left Operand"
        description="Number literal or property path in incoming payload"
        value={config.leftOperand ?? '0'}
        onChange={(e) => onUpdate({ leftOperand: e.target.value })}
        placeholder="e.g. 100 or item.price"
        required
      />

      {needsRightOperand && (
        <InputField
          label="Right Operand"
          description="Number literal or property path in incoming payload"
          value={config.rightOperand ?? '0'}
          onChange={(e) => onUpdate({ rightOperand: e.target.value })}
          placeholder="e.g. 10 or item.tax"
          required
        />
      )}

      {op === 'round' && (
        <NumberField
          label="Decimal Precision"
          description="Number of decimal places (0 to 10)"
          value={config.precision ?? 0}
          onChange={(val) => onUpdate({ precision: val })}
          min={0}
          max={10}
          step={1}
        />
      )}

      <InputField
        label="Output Key"
        description="Key name where the numeric result will be placed"
        value={config.outputKey ?? 'result'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="result"
        required
      />
    </div>
  );
}
