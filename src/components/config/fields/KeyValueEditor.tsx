import { useState } from 'react';
import { FormField, type FormFieldProps } from './FormField';
import { Plus, Trash2 } from 'lucide-react';

export interface KeyValueEditorProps extends Omit<FormFieldProps, 'children'> {
  value: Record<string, string>;
  onChange: (val: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KeyValueEditor({
  label,
  description,
  error,
  required,
  value,
  onChange,
  keyPlaceholder = 'Header Name',
  valuePlaceholder = 'Value',
}: KeyValueEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const entries = Object.entries(value);

  const handleAdd = () => {
    if (!newKey.trim()) return;
    onChange({
      ...value,
      [newKey.trim()]: newValue.trim(),
    });
    setNewKey('');
    setNewValue('');
  };

  const handleDelete = (keyToDelete: string) => {
    const copy = { ...value };
    delete copy[keyToDelete];
    onChange(copy);
  };

  const handleUpdate = (oldKey: string, updatedKey: string, updatedValue: string) => {
    const copy: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === oldKey) {
        copy[updatedKey] = updatedValue;
      } else {
        copy[k] = v;
      }
    }
    onChange(copy);
  };

  return (
    <FormField
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <div className="space-y-2">
        {/* Existing entries */}
        {entries.length > 0 && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={k}
                  onChange={(e) => handleUpdate(k, e.target.value, v)}
                  className="w-1/2 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-xs text-gray-200 focus:border-violet-500 focus:outline-none"
                  placeholder={keyPlaceholder}
                />
                <input
                  type="text"
                  value={v}
                  onChange={(e) => handleUpdate(k, k, e.target.value)}
                  className="w-1/2 h-7 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-xs text-gray-200 focus:border-violet-500 focus:outline-none"
                  placeholder={valuePlaceholder}
                />
                <button
                  type="button"
                  onClick={() => handleDelete(k)}
                  className="h-7 w-7 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new entry input row */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-[#2a2a3e]/60">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={keyPlaceholder}
            className="w-1/2 h-7 rounded border border-[#2a2a3e] bg-[#13131d] px-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-violet-500 focus:outline-none"
          />
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={valuePlaceholder}
            className="w-1/2 h-7 rounded border border-[#2a2a3e] bg-[#13131d] px-2 text-xs text-gray-300 placeholder:text-gray-600 focus:border-violet-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newKey.trim()}
            className="h-7 px-2 flex items-center gap-1 rounded bg-[#252538] text-xs text-gray-300 hover:bg-violet-600 hover:text-white disabled:opacity-40 transition-colors shrink-0"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>
    </FormField>
  );
}
