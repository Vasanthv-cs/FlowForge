import { icons } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
  name: string;
}

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const Icon = icons[name as keyof typeof icons];
  if (!Icon) return null;
  return <Icon {...props} />;
}
