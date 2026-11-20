import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { FormField, type FormFieldProps } from './FormField';
import { Check, AlertTriangle, Sparkles } from 'lucide-react';

export interface JsonFieldProps extends Omit<FormFieldProps, 'children'> {
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  placeholder?: string;
}

export function JsonField({
  label,
  description,
  error,
  required,
  value,
  onChange,
  rows = 6,
  placeholder = '{\n  "key": "value"\n}',
}: JsonFieldProps) {
  const [formatSuccess, setFormatSuccess] = useState(false);

  const jsonValidation = useMemo(() => {
    if (!value || value.trim() === '') {
      return { isValid: true, empty: true };
    }
    try {
      JSON.parse(value);
      return { isValid: true, empty: false };
    } catch (err) {
      return {
        isValid: false,
        empty: false,
        error: err instanceof Error ? err.message : 'Invalid JSON syntax',
      };
    }
  }, [value]);

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
      setFormatSuccess(true);
      setTimeout(() => setFormatSuccess(false), 1500);
    } catch {
      // Cannot format invalid JSON
    }
  };

  return (
    <FormField
      label={label}
      description={description}
      error={error ?? (!jsonValidation.isValid ? jsonValidation.error : undefined)}
      required={required}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5">
            {jsonValidation.empty ? (
              <span className="text-gray-500 font-mono text-[10px]">Empty JSON</span>
            ) : jsonValidation.isValid ? (
              <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                <Check className="h-3 w-3" /> Valid JSON
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-mono text-[10px]">
                <AlertTriangle className="h-3 w-3" /> Syntax Error
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleFormat}
            disabled={!jsonValidation.isValid || jsonValidation.empty}
            className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {formatSuccess ? 'Formatted!' : 'Format JSON'}
          </button>
        </div>

        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            'w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] p-2.5 font-mono text-xs text-gray-200 placeholder:text-gray-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-y leading-relaxed',
            !jsonValidation.isValid && 'border-amber-500/50 focus:border-amber-500',
          )}
        />
      </div>
    </FormField>
  );
}
