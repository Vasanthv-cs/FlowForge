import * as React from 'react';
import { cn } from '@/lib/utils';
import { FormField, type FormFieldProps } from './FormField';

export interface InputFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    Omit<FormFieldProps, 'children'> {
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export function InputField({
  label,
  description,
  error,
  required,
  leftAddon,
  rightAddon,
  className,
  ...props
}: InputFieldProps) {
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      required={required}
    >
      <div className="relative flex items-center">
        {leftAddon && (
          <div className="absolute left-2.5 flex items-center pointer-events-none text-gray-500 text-xs">
            {leftAddon}
          </div>
        )}
        <input
          className={cn(
            'w-full h-8 rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-2.5 text-xs text-gray-200 placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-colors',
            leftAddon && 'pl-8',
            rightAddon && 'pr-8',
            error && 'border-red-500/50 focus:border-red-500',
            className,
          )}
          {...props}
        />
        {rightAddon && (
          <div className="absolute right-2.5 flex items-center text-gray-500 text-xs">
            {rightAddon}
          </div>
        )}
      </div>
    </FormField>
  );
}
