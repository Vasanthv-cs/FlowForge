import { InputField } from '../fields/InputField';
import { NumberField } from '../fields/NumberField';
import type { WorkflowNode } from '@/types/workflow';
import type { JsonStringifyConfig } from '@/types/nodeConfigs';

interface JsonStringifyConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<JsonStringifyConfig>) => void;
}

export function JsonStringifyConfigPanel({
  node,
  onUpdate,
}: JsonStringifyConfigPanelProps) {
  const config = node.data.config as unknown as JsonStringifyConfig;

  return (
    <div className="space-y-4">
      <InputField
        label="Input Property Path"
        description="Path to property to serialize (leave empty to serialize root object)"
        value={config.inputPath ?? ''}
        onChange={(e) => onUpdate({ inputPath: e.target.value })}
        placeholder="e.g. data or items"
      />

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="prettyPrint"
          checked={config.prettyPrint ?? false}
          onChange={(e) => onUpdate({ prettyPrint: e.target.checked })}
          className="h-4 w-4 rounded border-gray-600 bg-[#1e1e2e] text-indigo-500 focus:ring-indigo-400"
        />
        <label htmlFor="prettyPrint" className="text-xs text-gray-300 select-none">
          Pretty print formatted JSON
        </label>
      </div>

      {config.prettyPrint && (
        <NumberField
          label="Indent Spaces"
          description="Number of indentation spaces (1 to 8)"
          value={config.indentSpaces ?? 2}
          onChange={(val) => onUpdate({ indentSpaces: val })}
          min={1}
          max={8}
          step={1}
          required
        />
      )}

      <InputField
        label="Output Key"
        description="Key name where the serialized JSON string will be placed"
        value={config.outputKey ?? 'jsonString'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="jsonString"
        required
      />
    </div>
  );
}
