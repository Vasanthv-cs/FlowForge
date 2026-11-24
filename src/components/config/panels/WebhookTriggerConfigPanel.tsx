import { useState } from 'react';
import { InputField } from '../fields/InputField';
import { SelectField } from '../fields/SelectField';
import { Copy, Check, Key, RefreshCw } from 'lucide-react';
import type { WorkflowNode } from '@/types/workflow';
import type {
  WebhookTriggerConfig,
  WebhookAuthType,
  WebhookHttpMethod,
  WebhookRespondMode,
} from '@/types/nodeConfigs';

interface WebhookTriggerConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<WebhookTriggerConfig>) => void;
}

const authOptions = [
  { value: 'none', label: 'None (Public Webhook)' },
  { value: 'header-secret', label: 'Header Secret (Static Token)' },
  { value: 'bearer-token', label: 'Bearer Token (Authorization Header)' },
  { value: 'hmac-sha256', label: 'HMAC-SHA256 Signature (GitHub/Stripe style)' },
];

const methodOptions = [
  { value: 'POST', label: 'POST (Recommended)' },
  { value: 'GET', label: 'GET' },
  { value: 'PUT', label: 'PUT' },
  { value: 'ALL', label: 'ALL (Any Method)' },
];

const respondModeOptions = [
  { value: 'immediate', label: 'Immediate 202 Accepted (Asynchronous queue)' },
  { value: 'sync', label: 'Synchronous 200 OK (Wait for workflow output)' },
];

export function WebhookTriggerConfigPanel({
  node,
  onUpdate,
}: WebhookTriggerConfigPanelProps) {
  const config = node.data.config as unknown as WebhookTriggerConfig;
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const webhookPath = config.path || 'whk_' + node.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  const fullWebhookUrl = `${origin}/api/webhooks/${webhookPath}`;

  const copyToClipboard = () => {
    void navigator.clipboard.writeText(fullWebhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateRandomSecret = () => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    onUpdate({ secret: 'sec_' + randomHex });
  };

  const generateRandomPath = () => {
    const randomSlug = 'whk_' + Math.random().toString(36).substring(2, 10);
    onUpdate({ path: randomSlug });
  };

  return (
    <div className="space-y-4">
      {/* Webhook Endpoint URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-300">Public Webhook URL</label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            readOnly
            value={fullWebhookUrl}
            className="flex-1 rounded-md border border-[#2a2a3e] bg-[#12121e] px-2.5 py-1.5 text-xs text-emerald-400 font-mono select-all focus:outline-none"
          />
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy Webhook URL"
            className="flex items-center justify-center rounded-md border border-[#2a2a3e] bg-[#1c1c2e] p-1.5 text-gray-300 hover:bg-[#25253d] hover:text-white transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Path Identifier */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-300">Webhook Path / Slug</label>
          <button
            type="button"
            onClick={generateRandomPath}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-emerald-400 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Generate Slug</span>
          </button>
        </div>
        <InputField
          label="Path Slug"
          value={config.path ?? ''}
          onChange={(e) => onUpdate({ path: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
          placeholder="my-custom-webhook-slug"
        />
      </div>

      {/* HTTP Method */}
      <SelectField
        label="Accepted HTTP Method"
        value={config.httpMethod ?? 'POST'}
        onChange={(e) => onUpdate({ httpMethod: e.target.value as WebhookHttpMethod })}
        options={methodOptions}
      />

      {/* Auth Type */}
      <SelectField
        label="Authentication Type"
        value={config.authType ?? 'none'}
        onChange={(e) => onUpdate({ authType: e.target.value as WebhookAuthType })}
        options={authOptions}
      />

      {/* Secret Configuration if auth != none */}
      {config.authType && config.authType !== 'none' && (
        <div className="space-y-3 rounded-md bg-[#161626] p-3 border border-[#2a2a3e]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-amber-400" />
              Webhook Secret Token
            </span>
            <button
              type="button"
              onClick={generateRandomSecret}
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Generate Secret
            </button>
          </div>

          <InputField
            label="Secret Token"
            value={config.secret ?? ''}
            onChange={(e) => onUpdate({ secret: e.target.value })}
            placeholder="e.g. sec_9f8a7b6c5d4e3f2a"
          />

          {config.authType === 'header-secret' && (
            <InputField
              label="Header Name"
              description="Header checked on incoming requests"
              value={config.headerName ?? 'X-Webhook-Secret'}
              onChange={(e) => onUpdate({ headerName: e.target.value })}
              placeholder="X-Webhook-Secret"
            />
          )}

          {config.authType === 'hmac-sha256' && (
            <InputField
              label="Signature Header Name"
              description="Header containing hex signature or sha256=... prefix"
              value={config.headerName ?? 'X-Hub-Signature-256'}
              onChange={(e) => onUpdate({ headerName: e.target.value })}
              placeholder="X-Hub-Signature-256"
            />
          )}
        </div>
      )}

      {/* Response Mode */}
      <SelectField
        label="Webhook Response Mode"
        description="Whether to return immediately or wait for completion"
        value={config.respondMode ?? 'immediate'}
        onChange={(e) => onUpdate({ respondMode: e.target.value as WebhookRespondMode })}
        options={respondModeOptions}
      />

      {/* Helper Box */}
      <div className="rounded-md bg-[#1a1a2e] p-2.5 border border-[#2a2a3e]">
        <p className="text-[11px] text-gray-400">
          <strong className="text-gray-200">Downstream Data:</strong> The incoming HTTP JSON body is emitted on <code className="text-violet-300">Payload</code>. Request headers, query parameters, and method are accessible via expression paths like <code className="text-cyan-300">payload.data</code>.
        </p>
      </div>
    </div>
  );
}
