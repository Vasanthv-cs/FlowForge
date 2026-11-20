import { JsonField } from '../fields/JsonField';
import type { WorkflowNode } from '@/types/workflow';
import type { ManualTriggerConfig } from '@/types/nodeConfigs';

interface ManualTriggerConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<ManualTriggerConfig>) => void;
}

export function ManualTriggerConfigPanel({
  node,
  onUpdate,
}: ManualTriggerConfigPanelProps) {
  const config = node.data.config as unknown as ManualTriggerConfig;

  return (
    <div className="space-y-4">
      <JsonField
        label="Trigger Payload"
        description="JSON data to supply when triggering this workflow execution"
        value={config.payload ?? ''}
        onChange={(val) => onUpdate({ payload: val })}
        rows={10}
        placeholder='{\n  "userId": "usr_123",\n  "action": "test"\n}'
      />

      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">How it works:</strong> When you press{' '}
          <span className="text-emerald-400 font-semibold">Run</span>, this JSON object
          is emitted on the <code className="text-violet-300">Payload</code> output port and forwarded downstream.
        </p>
      </div>
    </div>
  );
}
