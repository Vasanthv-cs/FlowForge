import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultExpanded?: boolean;
  maxHeight?: string;
  className?: string;
}

export function JsonViewer({
  data,
  label,
  defaultExpanded = true,
  maxHeight = 'max-h-60',
  className,
}: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const formattedJson =
    typeof data === 'string'
      ? data
      : JSON.stringify(data, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-[#2a2a3e] bg-[#10101a] overflow-hidden text-xs',
        className,
      )}
    >
      {/* Header Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-1.5 bg-[#171725] border-b border-[#2a2a3e] cursor-pointer hover:bg-[#1e1e2e] transition-colors select-none"
      >
        <div className="flex items-center gap-1.5 text-gray-300 font-medium">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
          )}
          <span>{label || 'JSON Payload'}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-white hover:bg-[#252538] transition-colors"
          title="Copy JSON to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-2.5 w-2.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* JSON Content */}
      {expanded && (
        <pre
          className={cn(
            'p-3 font-mono text-[11px] leading-relaxed text-gray-300 overflow-auto whitespace-pre selection:bg-violet-600/40',
            maxHeight,
          )}
        >
          {formattedJson || '<Empty>'}
        </pre>
      )}
    </div>
  );
}
