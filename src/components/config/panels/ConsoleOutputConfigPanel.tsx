import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import type { WorkflowNode } from '@/types/workflow';
import type { ConsoleOutputConfig, ConsoleLogLevel } from '@/types/nodeConfigs';

interface ConsoleOutputConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<ConsoleOutputConfig>) => void;
}

const levelOptions = [
  { value: 'info', label: 'Info (Blue)' },
  { value: 'warn', label: 'Warning (Amber)' },
  { value: 'error', label: 'Error (Red)' },
  { value: 'log', label: 'Standard Log (White)' },
];

export function ConsoleOutputConfigPanel({
  node,
  onUpdate,
}: ConsoleOutputConfigPanelProps) {
  const config = node.data.config as unknown as ConsoleOutputConfig;

  return (
    <div className="space-y-4">
      <SelectField
        label="Log Severity Level"
        description="Controls how the output is tagged in the Execution Logs bottom panel"
        value={config.level ?? 'info'}
        onChange={(e) => onUpdate({ level: e.target.value as ConsoleLogLevel })}
        options={levelOptions}
        required
      />

      <InputField
        label="Log Prefix / Tag"
        description="Optional identifier tag shown before the logged payload"
        value={config.prefix ?? 'FLOWFORGE'}
        onChange={(e) => onUpdate({ prefix: e.target.value })}
        placeholder="FLOWFORGE"
      />

      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">Execution Capture:</strong> When executed,
          incoming data is captured into the <span className="text-pink-400 font-mono">Bottom Output Panel &gt; Logs</span>{' '}
          and forwarded unchanged out the passthrough port.
        </p>
      </div>
    </div>
  );
}
