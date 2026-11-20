import * as React from 'react';
import { cn } from '@/lib/utils';
import { FormField, type FormFieldProps } from './FormField';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectFieldProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'>,
    Omit<FormFieldProps, 'children'> {
  options: SelectOption[];
}

export function SelectField({
  label,
  description,
  error,
  required,
  options,
  className,
  value,
  onChange,
  disabled,
  ...props
}: SelectFieldProps) {
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          'w-full h-8 rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-2.5 text-xs text-gray-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors cursor-pointer',
          error && 'border-red-500/50 focus:border-red-500',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1a2e] text-gray-200">
            {opt.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
