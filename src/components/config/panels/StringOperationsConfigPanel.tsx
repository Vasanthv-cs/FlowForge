import { InputField } from '../fields/InputField';
import { SelectField } from '../fields/SelectField';
import type { WorkflowNode } from '@/types/workflow';
import type { StringOperationsConfig } from '@/types/nodeConfigs';

interface StringOperationsConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<StringOperationsConfig>) => void;
}

const operationOptions = [
  { value: 'trim', label: 'Trim Whitespace' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'replace', label: 'Replace Substring' },
  { value: 'split', label: 'Split into Array' },
  { value: 'join', label: 'Join Array into String' },
];

export function StringOperationsConfigPanel({
  node,
  onUpdate,
}: StringOperationsConfigPanelProps) {
  const config = node.data.config as unknown as StringOperationsConfig;
  const op = config.operation ?? 'trim';

  return (
    <div className="space-y-4">
      <SelectField
        label="String Operation"
        description="Choose string transformation to apply"
        value={op}
        onChange={(e) =>
          onUpdate({
            operation: e.target.value as StringOperationsConfig['operation'],
          })
        }
        options={operationOptions}
        required
      />

      <InputField
        label="Input Property Path"
        description="Path to target string or array (leave empty to use input root)"
        value={config.inputPath ?? ''}
        onChange={(e) => onUpdate({ inputPath: e.target.value })}
        placeholder="e.g. text or user.bio"
      />

      {op === 'replace' && (
        <>
          <InputField
            label="Find Text"
            description="Literal text to search for (exact substring match)"
            value={config.findText ?? ''}
            onChange={(e) => onUpdate({ findText: e.target.value })}
            placeholder="e.g. foo"
            required
          />
          <InputField
            label="Replace With"
            description="Replacement text"
            value={config.replaceWith ?? ''}
            onChange={(e) => onUpdate({ replaceWith: e.target.value })}
            placeholder="e.g. bar"
          />
        </>
      )}

      {(op === 'split' || op === 'join') && (
        <InputField
          label="Delimiter / Separator"
          description={
            op === 'split'
              ? 'Delimiter used to divide the string (e.g. "," or " ")'
              : 'Separator inserted between array elements (e.g. ", ")'
          }
          value={config.separator ?? ','}
          onChange={(e) => onUpdate({ separator: e.target.value })}
          placeholder=","
          required
        />
      )}

      <InputField
        label="Output Key"
        description="Key name where the result will be placed in output"
        value={config.outputKey ?? 'result'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="result"
        required
      />
    </div>
  );
}
