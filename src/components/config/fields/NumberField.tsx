import { cn } from '@/lib/utils';
import { FormField, type FormFieldProps } from './FormField';

export interface NumberFieldProps extends Omit<FormFieldProps, 'children'> {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

export function NumberField({
  label,
  description,
  error,
  required,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
}: NumberFieldProps) {
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <div className="relative flex items-center">
        <input
          type="number"
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            onChange(Number.isNaN(parsed) ? 0 : parsed);
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={cn(
            'w-full h-8 rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-2.5 text-xs text-gray-200 placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors',
            unit && 'pr-12',
            error && 'border-red-500/50 focus:border-red-500',
          )}
        />
        {unit && (
          <div className="absolute right-2 px-1.5 py-0.5 rounded bg-[#252538] text-[10px] font-mono text-gray-400 select-none">
            {unit}
          </div>
        )}
      </div>
      {min !== undefined && max !== undefined && (
        <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-0.5">
          <span>Min: {min.toLocaleString()}</span>
          <span>Max: {max.toLocaleString()}</span>
        </div>
      )}
    </FormField>
  );
}
