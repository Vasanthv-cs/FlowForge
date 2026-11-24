import { useState, useEffect } from 'react';
import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import { NumberField } from '../fields/NumberField';
import { JsonField } from '../fields/JsonField';
import { KeyValueEditor } from '../fields/KeyValueEditor';
import { ShieldCheck, Lock } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { credentialClientService } from '@/services/credentialClientService';
import type { WorkflowNode } from '@/types/workflow';
import type { HttpRequestConfig, HttpMethod } from '@/types/nodeConfigs';
import type { CredentialMetadata } from '@flowforge/workflow-schema';

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
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());

  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(false);

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    let isCancelled = false;

    credentialClientService
      .listCredentials(activeWorkspace.id)
      .then((data) => {
        if (!isCancelled) {
          setCredentials(data);
          setLoadingCreds(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLoadingCreds(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeWorkspace?.id]);

  const credentialOptions = [
    { value: '', label: 'None (No Vault Credential)' },
    ...credentials.map((c) => ({
      value: c.id,
      label: `${c.name} (${c.credentialType.toUpperCase()})`,
    })),
  ];

  const selectedCred = credentials.find((c) => c.id === config.credentialId);

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

      {/* Query Parameters */}
      <KeyValueEditor
        label="Query Parameters"
        description="URL search parameters appended to request"
        value={config.queryParams ?? {}}
        onChange={(queryParams) => onUpdate({ queryParams })}
        keyPlaceholder="Parameter (e.g. limit)"
        valuePlaceholder="Value (e.g. 50)"
      />

      {/* Vault Credential Selector */}
      <div className="space-y-1.5">
        <SelectField
          label="Credential Vault"
          description={
            loadingCreds
              ? 'Loading workspace credentials...'
              : 'Securely inject stored secrets at execution time'
          }
          value={config.credentialId || ''}
          onChange={(e) => onUpdate({ credentialId: e.target.value || null })}
          options={credentialOptions}
        />

        {selectedCred && (
          <div className="flex items-start gap-2 p-2.5 rounded-md border border-teal-500/30 bg-teal-500/10 text-xs text-teal-300">
            <ShieldCheck className="h-4 w-4 shrink-0 text-teal-400 mt-0.5" />
            <div>
              <span className="font-semibold">{selectedCred.name}</span> will be resolved on the backend immediately before request dispatch.
              <p className="text-[11px] text-teal-400/80 mt-0.5">
                Secrets are never stored in workflow JSON or exposed in frontend traces.
              </p>
            </div>
          </div>
        )}

        {!config.credentialId && credentials.length === 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 pt-0.5">
            <Lock className="h-3 w-3" />
            <span>Need authentication? Store secrets in the workspace Credential Vault.</span>
          </div>
        )}
      </div>

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
        keyPlaceholder="Header (e.g. Content-Type)"
        valuePlaceholder="Value (e.g. application/json)"
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
