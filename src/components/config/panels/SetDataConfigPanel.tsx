import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { WorkflowNode } from '@/types/workflow';
import type { SetDataConfig, SetFieldMapping } from '@/types/nodeConfigs';

interface SetDataConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<SetDataConfig>) => void;
}

const typeOptions: { value: SetFieldMapping['valueType']; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
];

export function SetDataConfigPanel({
  node,
  onUpdate,
}: SetDataConfigPanelProps) {
  const config = node.data.config as unknown as SetDataConfig;
  const fields = config.fields ?? [];

  const handleAddField = () => {
    const nextFields: SetFieldMapping[] = [
      ...fields,
      { key: '', value: '', valueType: 'string' },
    ];
    onUpdate({ fields: nextFields });
  };

  const handleRemoveField = (index: number) => {
    const nextFields = fields.filter((_, i) => i !== index);
    onUpdate({ fields: nextFields });
  };

  const handleUpdateField = (index: number, patch: Partial<SetFieldMapping>) => {
    const nextFields = fields.map((f, i) =>
      i === index ? { ...f, ...patch } : f,
    );
    onUpdate({ fields: nextFields });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300">Fields to Set</label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAddField}
          className="h-6 px-2 text-xs flex items-center gap-1 border-gray-700 hover:bg-[#252538]"
        >
          <Plus className="h-3 w-3" /> Add Field
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No fields configured. Click "Add Field" above.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field: SetFieldMapping, index: number) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-[#1a1a2e] rounded border border-[#2a2a3e]"
            >
              <Input
                placeholder="Field name"
                value={field.key}
                onChange={(e) => handleUpdateField(index, { key: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <select
                value={field.valueType}
                onChange={(e) =>
                  handleUpdateField(index, {
                    valueType: e.target.value as SetFieldMapping['valueType'],
                  })
                }
                className="h-7 rounded border border-gray-700 bg-[#12121a] px-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Value"
                value={field.value}
                onChange={(e) => handleUpdateField(index, { value: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <button
                type="button"
                onClick={() => handleRemoveField(index)}
                className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                title="Remove field"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-[#2a2a3e]">
        <input
          type="checkbox"
          id="mergeWithIncoming"
          checked={config.mergeWithIncoming ?? true}
          onChange={(e) => onUpdate({ mergeWithIncoming: e.target.checked })}
          className="h-4 w-4 rounded border-gray-600 bg-[#1e1e2e] text-indigo-500 focus:ring-indigo-400"
        />
        <label htmlFor="mergeWithIncoming" className="text-xs text-gray-300 select-none">
          Merge fields with incoming payload (retain existing fields)
        </label>
      </div>
    </div>
  );
}
