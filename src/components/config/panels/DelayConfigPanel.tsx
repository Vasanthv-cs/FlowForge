import { NumberField } from '../fields/NumberField';
import type { WorkflowNode } from '@/types/workflow';
import {
  type DelayConfig,
  MAX_SAFE_DELAY_MS,
  MIN_SAFE_DELAY_MS,
} from '@/types/nodeConfigs';

interface DelayConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<DelayConfig>) => void;
}

const presets = [
  { label: '500ms', value: 500 },
  { label: '1 sec', value: 1000 },
  { label: '2 sec', value: 2000 },
  { label: '5 sec', value: 5000 },
  { label: '10 sec', value: 10000 },
];

export function DelayConfigPanel({ node, onUpdate }: DelayConfigPanelProps) {
  const config = node.data.config as unknown as DelayConfig;
  const currentMs = config.delayMs ?? 1000;

  return (
    <div className="space-y-4">
      <NumberField
        label="Duration"
        description="Amount of time to pause execution before passing data to output"
        value={currentMs}
        onChange={(val) => onUpdate({ delayMs: val })}
        min={MIN_SAFE_DELAY_MS}
        max={MAX_SAFE_DELAY_MS}
        step={100}
        unit="ms"
        required
      />

      {/* Preset duration buttons */}
      <div>
        <label className="text-[11px] font-medium text-gray-400 block mb-1.5">
          Quick Presets:
        </label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onUpdate({ delayMs: preset.value })}
              className={`px-2.5 py-1 rounded text-xs transition-colors border ${
                currentMs === preset.value
                  ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                  : 'bg-[#1a1a2e] border-[#2a2a3e] text-gray-400 hover:text-gray-200 hover:bg-[#252538]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">Safe Execution Limit:</strong> To prevent infinite hanging or browser thread locks, delays are hard-capped at{' '}
          <strong className="text-violet-400">{(MAX_SAFE_DELAY_MS / 1000)} seconds</strong>.
        </p>
      </div>
    </div>
  );
}
