import * as React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1">
          {label}
          {required && <span className="text-red-400">*</span>}
        </label>
      </div>

      {description && (
        <p className="text-[11px] text-gray-500 leading-tight">{description}</p>
      )}

      <div>{children}</div>

      {error && (
        <div className="flex items-center gap-1 text-[11px] text-red-400 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
