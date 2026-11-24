import { NumberField } from '../fields/NumberField';
import { JsonField } from '../fields/JsonField';
import { KeyValueEditor } from '../fields/KeyValueEditor';
import { CheckCircle2 } from 'lucide-react';
import type { WorkflowNode } from '@/types/workflow';
import type { WebhookResponseConfig } from '@/types/nodeConfigs';

interface WebhookResponseConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<WebhookResponseConfig>) => void;
}

export function WebhookResponseConfigPanel({
  node,
  onUpdate,
}: WebhookResponseConfigPanelProps) {
  const config = node.data.config as unknown as WebhookResponseConfig;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
        <div>
          <span className="font-semibold">Synchronous Webhook Response:</span> When the triggering Webhook node has Response Mode set to Synchronous, this node provides the HTTP status code, headers, and body returned to the caller.
        </div>
      </div>

      <NumberField
        label="HTTP Status Code"
        description="Standard HTTP response code (e.g. 200, 201, 400, 404)"
        value={config.statusCode ?? 200}
        onChange={(val) => onUpdate({ statusCode: val })}
        min={100}
        max={599}
        step={1}
        required
      />

      <KeyValueEditor
        label="Response Headers"
        description="Headers sent back to the webhook caller"
        value={config.headers ?? {}}
        onChange={(headers) => onUpdate({ headers })}
        keyPlaceholder="Header (e.g. Content-Type)"
        valuePlaceholder="Value (e.g. application/json)"
      />

      <JsonField
        label="Response Body"
        description="Body content returned to the webhook caller"
        value={config.body ?? ''}
        onChange={(body) => onUpdate({ body })}
        rows={6}
        placeholder='{\n  "success": true\n}'
      />
    </div>
  );
}
