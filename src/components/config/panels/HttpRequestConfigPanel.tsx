import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import { NumberField } from '../fields/NumberField';
import { JsonField } from '../fields/JsonField';
import { KeyValueEditor } from '../fields/KeyValueEditor';
import type { WorkflowNode } from '@/types/workflow';
import type { HttpRequestConfig, HttpMethod } from '@/types/nodeConfigs';

interface HttpRequestConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<HttpRequestConfig>) => void;
}

const methodOptions = [
  { value: 'GET', label: 'GET — Fetch data' },
  { value: 'POST', label: 'POST — Create resource' },
  { value: 'PUT', label: 'PUT — Replace resource' },
  { value: 'PATCH', label: 'PATCH — Modify resource' },
  { value: 'DELETE', label: 'DELETE — Remove resource' },
];

export function HttpRequestConfigPanel({
  node,
  onUpdate,
}: HttpRequestConfigPanelProps) {
  const config = node.data.config as unknown as HttpRequestConfig;
  const isBodyAllowed = ['POST', 'PUT', 'PATCH'].includes(config.method);

  return (
    <div className="space-y-4">
      {/* Method */}
      <SelectField
        label="HTTP Method"
        value={config.method ?? 'GET'}
        onChange={(e) => onUpdate({ method: e.target.value as HttpMethod })}
        options={methodOptions}
        required
      />

      {/* URL */}
      <InputField
        label="Endpoint URL"
        description="Supports HTTP or HTTPS endpoints"
        value={config.url ?? ''}
        onChange={(e) => onUpdate({ url: e.target.value })}
        placeholder="https://api.example.com/data"
        required
      />

      {/* Timeout */}
      <NumberField
        label="Request Timeout"
        description="Maximum wait time before timing out"
        value={config.timeoutMs ?? 5000}
        onChange={(val) => onUpdate({ timeoutMs: val })}
        min={100}
        max={60000}
        step={500}
        unit="ms"
        required
      />

      {/* Headers */}
      <KeyValueEditor
        label="HTTP Headers"
        description="Key-value headers sent with the request"
        value={config.headers ?? {}}
        onChange={(headers) => onUpdate({ headers })}
        keyPlaceholder="Header (e.g. Authorization)"
        valuePlaceholder="Value (e.g. Bearer token)"
      />

      {/* Request Body (for POST, PUT, PATCH) */}
      {isBodyAllowed && (
        <JsonField
          label="Request Body"
          description="Payload to send in the request body"
          value={config.body ?? ''}
          onChange={(body) => onUpdate({ body })}
          rows={6}
          placeholder='{\n  "query": "search terms"\n}'
        />
      )}
    </div>
  );
}
