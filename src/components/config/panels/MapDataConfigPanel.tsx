import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { InputField } from '../fields/InputField';
import type { WorkflowNode } from '@/types/workflow';
import type { MapDataConfig, MapFieldMapping } from '@/types/nodeConfigs';

interface MapDataConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<MapDataConfig>) => void;
}

export function MapDataConfigPanel({
  node,
  onUpdate,
}: MapDataConfigPanelProps) {
  const config = node.data.config as unknown as MapDataConfig;
  const mappings = config.mappings ?? [];

  const handleAddMapping = () => {
    const next: MapFieldMapping[] = [
      ...mappings,
      { sourceField: '', targetField: '' },
    ];
    onUpdate({ mappings: next });
  };

  const handleRemoveMapping = (index: number) => {
    const next = mappings.filter((_, i) => i !== index);
    onUpdate({ mappings: next });
  };

  const handleUpdateMapping = (index: number, patch: Partial<MapFieldMapping>) => {
    const next = mappings.map((m, i) =>
      i === index ? { ...m, ...patch } : m,
    );
    onUpdate({ mappings: next });
  };

  return (
    <div className="space-y-4">
      <InputField
        label="Array Path"
        description="Path to array in incoming payload (leave empty if input root is array)"
        value={config.arrayPath ?? ''}
        onChange={(e) => onUpdate({ arrayPath: e.target.value })}
        placeholder="e.g. users or data.records"
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-300">Field Projections</label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddMapping}
            className="h-6 px-2 text-xs flex items-center gap-1 border-gray-700 hover:bg-[#252538]"
          >
            <Plus className="h-3 w-3" /> Add Mapping
          </Button>
        </div>

        {mappings.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No mappings configured. Click "Add Mapping" above.</p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m: MapFieldMapping, index: number) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-[#1a1a2e] rounded border border-[#2a2a3e]"
              >
                <Input
                  placeholder="Source field"
                  value={m.sourceField}
                  onChange={(e) =>
                    handleUpdateMapping(index, { sourceField: e.target.value })
                  }
                  className="h-7 text-xs flex-1"
                />
                <span className="text-gray-500 text-xs font-mono">→</span>
                <Input
                  placeholder="Target field"
                  value={m.targetField}
                  onChange={(e) =>
                    handleUpdateMapping(index, { targetField: e.target.value })
                  }
                  className="h-7 text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveMapping(index)}
                  className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                  title="Remove mapping"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <InputField
        label="Output Key"
        description="Key name where the mapped array will be placed in output"
        value={config.outputKey ?? 'mapped'}
        onChange={(e) => onUpdate({ outputKey: e.target.value })}
        placeholder="mapped"
        required
      />
    </div>
  );
}
