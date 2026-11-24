import { InputField } from '../fields/InputField';
import type { WorkflowNode } from '@/types/workflow';
import type { JsonParseConfig } from '@/types/nodeConfigs';

interface JsonParseConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<JsonParseConfig>) => void;
}

export function JsonParseConfigPanel({
  node,
  onUpdate,
}: JsonParseConfigPanelProps) {
  const config = node.data.config as unknown as JsonParseConfig;

  return (
    <div className="space-y-4">
      <InputField
        label="Input Property Path"
        description="Path to string property in incoming payload (leave empty to parse root)"
        value={config.inputPath ?? ''}
        onChange={(e) => onUpdate({ inputPath: e.target.value })}
        placeholder="e.g. body or rawJson"
      />

      <InputField
        label="Output Key"
        description="Key name where the parsed JSON object will be placed"
        value={config.outputKey ?? 'parsed'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="parsed"
        required
      />

      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">Safe JSON Parsing:</strong> Uses standard <code className="text-cyan-300">JSON.parse()</code>. If incoming text is invalid JSON, the node will fail cleanly with an informative error message.
        </p>
      </div>
    </div>
  );
}
