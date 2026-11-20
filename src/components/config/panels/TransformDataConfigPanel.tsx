import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import type { WorkflowNode } from '@/types/workflow';
import type { TransformDataConfig, TransformMode } from '@/types/nodeConfigs';

interface TransformDataConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<TransformDataConfig>) => void;
}

const modeOptions = [
  {
    value: 'property-path',
    label: 'Extract JSON Property Path',
    description: 'Extract a nested key like data.user.id',
  },
  {
    value: 'json-parse',
    label: 'JSON Parse (String to Object)',
    description: 'Parse incoming raw JSON text into structured object',
  },
  {
    value: 'json-stringify',
    label: 'JSON Stringify (Object to String)',
    description: 'Serialize incoming object into formatted JSON string',
  },
  {
    value: 'uppercase',
    label: 'To Uppercase (String)',
    description: 'Convert string text to uppercase',
  },
  {
    value: 'lowercase',
    label: 'To Lowercase (String)',
    description: 'Convert string text to lowercase',
  },
  {
    value: 'trim',
    label: 'Trim Whitespace (String)',
    description: 'Remove leading and trailing whitespace',
  },
];

export function TransformDataConfigPanel({
  node,
  onUpdate,
}: TransformDataConfigPanelProps) {
  const config = node.data.config as unknown as TransformDataConfig;

  return (
    <div className="space-y-4">
      <SelectField
        label="Transformation Mode"
        description="Select safe transformation rule (no arbitrary code execution)"
        value={config.mode ?? 'property-path'}
        onChange={(e) => onUpdate({ mode: e.target.value as TransformMode })}
        options={modeOptions}
        required
      />

      {config.mode === 'property-path' && (
        <InputField
          label="Property Path"
          description="Dot-notation path to extract from input (e.g. user.profile.email)"
          value={config.propertyPath ?? ''}
          onChange={(e) => onUpdate({ propertyPath: e.target.value })}
          placeholder="data.items"
          required
        />
      )}

      <InputField
        label="Output Key"
        description="Property key name under which transformed value will be packaged"
        value={config.outputKey ?? 'result'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="result"
        required
      />

      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">Safe Evaluation:</strong> FlowForge utilizes
          declarative path resolution and built-in type conversions to guarantee sandboxed execution without <code className="text-amber-300">eval()</code>.
        </p>
      </div>
    </div>
  );
}
