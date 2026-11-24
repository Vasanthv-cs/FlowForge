import { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Lock,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { credentialClientService } from '@/services/credentialClientService';
import type { CredentialType, CredentialMetadata } from '@flowforge/workflow-schema';
import type { CredentialSecretData } from '@/server/services/credentialVaultService';

interface CredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const credentialTypeLabels: Record<CredentialType, { label: string; badge: string }> = {
  api_key: { label: 'API Key', badge: 'API KEY' },
  bearer_token: { label: 'Bearer Token', badge: 'BEARER' },
  basic_auth: { label: 'Basic Authentication', badge: 'BASIC' },
  custom_headers: { label: 'Custom HTTP Headers', badge: 'CUSTOM' },
};

export function CredentialModal({ isOpen, onClose }: CredentialModalProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const canManageCredentials = useWorkspaceStore((s) => s.canManageMembers()); // Owner or Admin

  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subview: 'list' | 'create' | 'edit'
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [selectedCredential, setSelectedCredential] = useState<CredentialMetadata | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [credentialType, setCredentialType] = useState<CredentialType>('api_key');
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Field states per type
  const [apiKey, setApiKey] = useState('');
  const [headerName, setHeaderName] = useState('X-API-Key');
  const [bearerToken, setBearerToken] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');
  const [customHeadersJson, setCustomHeadersJson] = useState('{\n  "X-Custom-Auth": "secret_value"\n}');

  const resetForm = () => {
    setName('');
    setDescription('');
    setCredentialType('api_key');
    setShowSecret(false);
    setApiKey('');
    setHeaderName('X-API-Key');
    setBearerToken('');
    setBasicUsername('');
    setBasicPassword('');
    setCustomHeadersJson('{\n  "X-Custom-Auth": "secret_value"\n}');
    setSelectedCredential(null);
    setError(null);
  };

  const loadCredentials = useCallback(async () => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await credentialClientService.listCredentials(activeWorkspace.id);
      setCredentials(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credentials');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.id) return;

    let isCancelled = false;
    credentialClientService
      .listCredentials(activeWorkspace.id)
      .then((data) => {
        if (!isCancelled) {
          setCredentials(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load credentials');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activeWorkspace]);

  if (!isOpen) return null;

  const buildSecretData = (): CredentialSecretData => {
    switch (credentialType) {
      case 'api_key':
        return { apiKey: apiKey.trim(), headerName: headerName.trim() || 'X-API-Key' };
      case 'bearer_token':
        return { token: bearerToken.trim() };
      case 'basic_auth':
        return { username: basicUsername.trim(), password: basicPassword };
      case 'custom_headers': {
        const parsed = JSON.parse(customHeadersJson) as Record<string, string>;
        return { headers: parsed };
      }
    }
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.id) return;

    if (!name.trim()) {
      setError('Please provide a credential name.');
      return;
    }

    // Validate fields according to type
    if (credentialType === 'api_key' && !apiKey.trim()) {
      setError('API key value is required.');
      return;
    }
    if (credentialType === 'bearer_token' && !bearerToken.trim()) {
      setError('Bearer token value is required.');
      return;
    }
    if (credentialType === 'basic_auth' && (!basicUsername.trim() || !basicPassword)) {
      setError('Username and password are both required for Basic Auth.');
      return;
    }
    if (credentialType === 'custom_headers') {
      try {
        const parsed = JSON.parse(customHeadersJson);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          throw new Error();
        }
      } catch {
        setError('Custom headers must be a valid JSON object of key-value pairs.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const secretData = buildSecretData();
      await credentialClientService.createCredential(activeWorkspace.id, {
        name: name.trim(),
        description: description.trim() || null,
        credentialType,
        data: secretData,
      });

      resetForm();
      setView('list');
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create credential');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.id || !selectedCredential) return;

    if (!name.trim()) {
      setError('Credential name cannot be empty.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let dataToUpdate: CredentialSecretData | undefined = undefined;

      // Check if user entered a new secret to rotate
      if (credentialType === 'api_key' && apiKey.trim()) {
        dataToUpdate = { apiKey: apiKey.trim(), headerName: headerName.trim() || 'X-API-Key' };
      } else if (credentialType === 'bearer_token' && bearerToken.trim()) {
        dataToUpdate = { token: bearerToken.trim() };
      } else if (credentialType === 'basic_auth' && (basicUsername.trim() || basicPassword)) {
        if (!basicUsername.trim() || !basicPassword) {
          setError('To rotate Basic Auth, provide both new username and new password.');
          setSubmitting(false);
          return;
        }
        dataToUpdate = { username: basicUsername.trim(), password: basicPassword };
      } else if (credentialType === 'custom_headers' && customHeadersJson.trim()) {
        const parsed = JSON.parse(customHeadersJson) as Record<string, string>;
        dataToUpdate = { headers: parsed };
      }

      await credentialClientService.updateCredential(activeWorkspace.id, selectedCredential.id, {
        name: name.trim(),
        description: description.trim() || null,
        data: dataToUpdate,
      });

      resetForm();
      setView('list');
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credential');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCredential = async (id: string, credName: string) => {
    if (!activeWorkspace?.id) return;
    if (!confirm(`Are you sure you want to delete credential "${credName}"? Workflows using it will fail during execution.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await credentialClientService.deleteCredential(activeWorkspace.id, id);
      await loadCredentials();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete credential');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (cred: CredentialMetadata) => {
    setSelectedCredential(cred);
    setName(cred.name);
    setDescription(cred.description || '');
    setCredentialType(cred.credentialType);
    setShowSecret(false);
    setApiKey('');
    setHeaderName('X-API-Key');
    setBearerToken('');
    setBasicUsername('');
    setBasicPassword('');
    setCustomHeadersJson('');
    setView('edit');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#2a2a3e] bg-[#12121f] text-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a3e] px-6 py-4 bg-[#161626]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Credential Vault</h2>
              <p className="text-xs text-gray-400">
                Workspace-scoped encrypted secrets for safe HTTP node execution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view === 'list' && canManageCredentials && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  resetForm();
                  setView('create');
                }}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Credential</span>
              </Button>
            )}
            <button
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ── VIEW 1: CREDENTIALS LIST ── */}
          {view === 'list' && (
            <>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                  <span className="text-xs">Loading workspace credentials...</span>
                </div>
              ) : credentials.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1c1c2e] border border-[#2a2a3e] text-gray-500 mb-3">
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-200">No credentials configured</h3>
                  <p className="text-xs text-gray-400 max-w-sm mt-1">
                    Store API keys, Bearer tokens, or Basic Auth credentials to authenticate outbound HTTP requests without exposing secrets in workflows.
                  </p>
                  {canManageCredentials && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        resetForm();
                        setView('create');
                      }}
                      className="mt-4 bg-teal-600 hover:bg-teal-500 text-white"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Create First Credential
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {credentials.map((cred) => {
                    const badgeInfo = credentialTypeLabels[cred.credentialType] || {
                      label: cred.credentialType,
                      badge: 'CUSTOM',
                    };

                    return (
                      <div
                        key={cred.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[#2a2a3e] bg-[#161626] p-4 hover:border-[#3a3a52] transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-100">{cred.name}</span>
                            <Badge variant="default">{badgeInfo.badge}</Badge>
                            <span className="text-[10px] text-gray-400 font-mono">
                              AES-256-GCM ({cred.keyVersion})
                            </span>
                          </div>
                          {cred.description && (
                            <p className="text-xs text-gray-400">{cred.description}</p>
                          )}
                          <p className="text-[11px] text-gray-400">
                            Updated {new Date(cred.updatedAt).toLocaleDateString()}
                          </p>
                        </div>

                        {canManageCredentials && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(cred)}
                              className="text-xs text-gray-300 hover:text-white"
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Rotate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCredential(cred.id, cred.name)}
                              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── VIEW 2: CREATE CREDENTIAL ── */}
          {view === 'create' && (
            <form onSubmit={handleCreateCredential} className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs text-teal-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Encrypted at rest with AES-256-GCM. Secret values are never sent to the browser.</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Credential Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Stripe Production API Key"
                  required
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#161626] px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Description <span className="text-gray-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Purpose or notes about this secret"
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#161626] px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Credential Type</label>
                <select
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value as CredentialType)}
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#161626] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                >
                  <option value="api_key">API Key (Header)</option>
                  <option value="bearer_token">Bearer Token (Authorization Header)</option>
                  <option value="basic_auth">Basic Authentication (Username & Password)</option>
                  <option value="custom_headers">Custom Headers (Key-Value JSON)</option>
                </select>
              </div>

              {/* Dynamic secret inputs based on type */}
              {credentialType === 'api_key' && (
                <div className="space-y-3 p-3 rounded-lg border border-[#2a2a3e] bg-[#18182b]">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Header Name</label>
                    <input
                      type="text"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="X-API-Key"
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-300">
                        API Key Value <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-gray-400 hover:text-gray-200 text-[11px] flex items-center gap-1"
                      >
                        {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                      </button>
                    </div>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter raw API key..."
                      required
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {credentialType === 'bearer_token' && (
                <div className="p-3 rounded-lg border border-[#2a2a3e] bg-[#18182b]">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-300">
                      Bearer Token <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-gray-400 hover:text-gray-200 text-[11px] flex items-center gap-1"
                    >
                      {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                    </button>
                  </div>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    required
                    className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>
              )}

              {credentialType === 'basic_auth' && (
                <div className="space-y-3 p-3 rounded-lg border border-[#2a2a3e] bg-[#18182b]">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={basicUsername}
                      onChange={(e) => setBasicUsername(e.target.value)}
                      placeholder="admin"
                      required
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-300">
                        Password <span className="text-red-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-gray-400 hover:text-gray-200 text-[11px] flex items-center gap-1"
                      >
                        {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                      </button>
                    </div>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={basicPassword}
                      onChange={(e) => setBasicPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {credentialType === 'custom_headers' && (
                <div className="p-3 rounded-lg border border-[#2a2a3e] bg-[#18182b]">
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Headers JSON <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={customHeadersJson}
                    onChange={(e) => setCustomHeadersJson(e.target.value)}
                    className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setView('list');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={submitting}
                  className="bg-teal-600 hover:bg-teal-500 text-white"
                >
                  {submitting ? 'Saving...' : 'Save Credential'}
                </Button>
              </div>
            </form>
          )}

          {/* ── VIEW 3: EDIT / ROTATE CREDENTIAL ── */}
          {view === 'edit' && selectedCredential && (
            <form onSubmit={handleUpdateCredential} className="space-y-4">
              <div className="flex items-center gap-1.5 pb-2 border-b border-[#2a2a3e]">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setView('list');
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Credentials</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Credential Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#161626] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#161626] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-lg border border-[#2a2a3e] bg-[#18182b] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-200">Rotate Secret Value</span>
                  <span className="text-[10px] text-gray-400">Leave blank to retain current secret</span>
                </div>

                {credentialType === 'api_key' && (
                  <div>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter new API key (leave blank to keep existing)..."
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                )}

                {credentialType === 'bearer_token' && (
                  <div>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      placeholder="Enter new token (leave blank to keep existing)..."
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                )}

                {credentialType === 'basic_auth' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={basicUsername}
                      onChange={(e) => setBasicUsername(e.target.value)}
                      placeholder="New username..."
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={basicPassword}
                      onChange={(e) => setBasicPassword(e.target.value)}
                      placeholder="New password..."
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                )}

                {credentialType === 'custom_headers' && (
                  <div>
                    <textarea
                      rows={3}
                      value={customHeadersJson}
                      onChange={(e) => setCustomHeadersJson(e.target.value)}
                      placeholder='{"X-Auth": "new_secret"} (leave blank to keep existing)'
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#12121f] px-3 py-2 text-xs text-gray-200 font-mono focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setView('list');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={submitting}
                  className="bg-teal-600 hover:bg-teal-500 text-white"
                >
                  {submitting ? 'Updating...' : 'Update Credential'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
