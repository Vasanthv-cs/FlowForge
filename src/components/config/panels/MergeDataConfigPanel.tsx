import { SelectField } from '../fields/SelectField';
import { JsonField } from '../fields/JsonField';
import type { WorkflowNode } from '@/types/workflow';
import type { MergeDataConfig } from '@/types/nodeConfigs';

interface MergeDataConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<MergeDataConfig>) => void;
}

const strategyOptions = [
  { value: 'deep', label: 'Deep Merge — Recursively merge nested objects' },
  { value: 'shallow', label: 'Shallow Merge — Top-level keys only' },
];

const conflictOptions = [
  { value: 'overwrite', label: 'Overwrite — Secondary values take precedence' },
  { value: 'keep_original', label: 'Keep Original — Primary values take precedence' },
  { value: 'error', label: 'Throw Error — Fail on conflicting keys' },
];

export function MergeDataConfigPanel({
  node,
  onUpdate,
}: MergeDataConfigPanelProps) {
  const config = node.data.config as unknown as MergeDataConfig;

  return (
    <div className="space-y-4">
      <SelectField
        label="Merge Strategy"
        description="Choose how deeply nested objects should be blended"
        value={config.strategy ?? 'deep'}
        onChange={(e) =>
          onUpdate({ strategy: e.target.value as MergeDataConfig['strategy'] })
        }
        options={strategyOptions}
        required
      />

      <SelectField
        label="Conflict Resolution"
        description="Determines which value wins when keys collide"
        value={config.conflictResolution ?? 'overwrite'}
        onChange={(e) =>
          onUpdate({
            conflictResolution: e.target.value as MergeDataConfig['conflictResolution'],
          })
        }
        options={conflictOptions}
        required
      />

      <JsonField
        label="Secondary Data (JSON)"
        description="JSON object to merge into incoming primary payload"
        value={config.secondaryData ?? '{}'}
        onChange={(val) => onUpdate({ secondaryData: val })}
        rows={6}
        placeholder='{\n  "source": "merge-node",\n  "active": true\n}'
      />
    </div>
  );
}
