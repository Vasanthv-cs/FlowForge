import { useMemo, useState } from 'react';
import {
  Trash2,
  Info,
  AlertCircle,
  Copy,
  Check,
  Sliders,
  Bug,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DynamicIcon } from '@/components/ui/DynamicIcon';
import { JsonViewer } from '@/components/ui/JsonViewer';
import { useWorkflowStore } from '@/store/workflowStore';
import { validateNodeConfig } from '@/lib/nodeValidation';

import { ManualTriggerConfigPanel } from '@/components/config/panels/ManualTriggerConfigPanel';
import { HttpRequestConfigPanel } from '@/components/config/panels/HttpRequestConfigPanel';
import { TransformDataConfigPanel } from '@/components/config/panels/TransformDataConfigPanel';
import { ConditionConfigPanel } from '@/components/config/panels/ConditionConfigPanel';
import { DelayConfigPanel } from '@/components/config/panels/DelayConfigPanel';
import { ConsoleOutputConfigPanel } from '@/components/config/panels/ConsoleOutputConfigPanel';

export function RightSidebar() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const deleteNode = useWorkflowStore((s) => s.deleteNode);
  const updateNodeConfig = useWorkflowStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useWorkflowStore((s) => s.updateNodeLabel);
  const nodeRecords = useWorkflowStore((s) => s.nodeRecords);

  const [activeTab, setActiveTab] = useState<'config' | 'debug'>('config');
  const [copiedId, setCopiedId] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeDebugRecord = selectedNodeId ? nodeRecords[selectedNodeId] : undefined;

  // Live validation for this selected node
  const nodeErrors = useMemo(() => {
    if (!selectedNode) return [];
    return validateNodeConfig(selectedNode);
  }, [selectedNode]);

  if (!selectedNode) {
    return (
      <aside className="flex w-84 flex-col border-l border-[#1e1e2e] bg-[#13131d] shrink-0 select-none">
        <div className="flex items-center gap-2 border-b border-[#1e1e2e] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Node Inspector
          </h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] text-gray-500 shadow-md">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-300">No Node Selected</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Click any node on the canvas to inspect its live execution outputs, modify settings, or review errors.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const { data } = selectedNode;

  const handleCopyId = () => {
    navigator.clipboard.writeText(selectedNode.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const handleConfigUpdate = (newConfig: Record<string, unknown>) => {
    updateNodeConfig(selectedNode.id, newConfig);
  };

  const renderStatusBadge = () => {
    const state = nodeDebugRecord?.state ?? data.status ?? 'idle';
    switch (state) {
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse font-bold">
            <Loader2 className="h-3 w-3 animate-spin" /> RUNNING
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <CheckCircle2 className="h-3 w-3" /> SUCCESS
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold">
            <XCircle className="h-3 w-3" /> FAILED
          </span>
        );
      case 'skipped':
        return (
          <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <PauseCircle className="h-3 w-3" /> SKIPPED
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">
            IDLE
          </span>
        );
    }
  };

  return (
    <aside className="flex w-84 flex-col border-l border-[#1e1e2e] bg-[#13131d] shrink-0 select-none overflow-hidden">
      {/* Top Header with Tab Switcher */}
      <div className="border-b border-[#1e1e2e] bg-[#101018] px-3 pt-2.5 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Node Inspector
          </h2>
          <Badge
            variant={
              data.category === 'trigger'
                ? 'success'
                : data.category === 'data'
                  ? 'info'
                  : data.category === 'logic'
                    ? 'warning'
                    : 'default'
            }
          >
            {data.category}
          </Badge>
        </div>

        {/* Tab Switcher: Configuration vs Debugger */}
        <div className="flex rounded-md bg-[#1a1a2e] p-0.5 border border-[#2a2a3e]">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'config'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders className="h-3 w-3" />
            Config
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded transition-colors relative ${
              activeTab === 'debug'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Bug className="h-3 w-3" />
            Execution Debugger
            {nodeDebugRecord && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Title & Description */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm"
              style={{
                borderColor: data.color + '40',
                backgroundColor: data.color + '15',
              }}
            >
              <DynamicIcon
                name={data.icon}
                className="h-4 w-4"
                style={{ color: data.color }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={data.label}
                onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-gray-100 border-b border-transparent hover:border-[#2a2a3e] focus:border-violet-500 focus:outline-none transition-colors px-1 py-0.5 rounded"
                title="Click to rename node"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-normal pl-1">
            {data.description}
          </p>
        </div>

        {/* ── TAB 1: CONFIGURATION ── */}
        {activeTab === 'config' && (
          <>
            {/* Live Validation Alert if issues exist */}
            {nodeErrors.length > 0 && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Configuration Issues ({nodeErrors.length})</span>
                </div>
                <ul className="text-[11px] text-red-300 space-y-0.5 pl-5 list-disc">
                  {nodeErrors.map((err) => (
                    <li key={err.id}>{err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Port Architecture */}
            <div className="rounded-lg bg-[#1a1a2e]/60 border border-[#2a2a3e] p-3 space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Port Architecture
              </h3>

              <div>
                <span className="text-[10px] text-gray-500 block mb-1">Inputs:</span>
                {data.inputs.length === 0 ? (
                  <span className="text-[11px] text-gray-500 italic">None (Workflow Starter)</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.inputs.map((inp) => (
                      <span
                        key={inp.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#252538] text-[11px] text-gray-300"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                        {inp.label}
                        <span className="text-[9px] text-gray-500 font-mono">({inp.type})</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] text-gray-500 block mb-1">Outputs:</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.outputs.map((out) => (
                    <span
                      key={out.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#252538] text-[11px] text-gray-300"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            out.id === 'false'
                              ? '#f43f5e'
                              : out.id === 'true'
                                ? '#10b981'
                                : '#06b6d4',
                        }}
                      />
                      {out.label}
                      <span className="text-[9px] text-gray-500 font-mono">({out.type})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Specific Config Panel */}
            <div className="border-t border-[#1e1e2e] pt-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Configuration
              </h3>

              {data.type === 'manual-trigger' && (
                <ManualTriggerConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}

              {data.type === 'http-request' && (
                <HttpRequestConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}

              {data.type === 'transform-data' && (
                <TransformDataConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}

              {data.type === 'condition' && (
                <ConditionConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}

              {data.type === 'delay' && (
                <DelayConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}

              {data.type === 'console-output' && (
                <ConsoleOutputConfigPanel
                  node={selectedNode}
                  onUpdate={handleConfigUpdate}
                />
              )}
            </div>
          </>
        )}

        {/* ── TAB 2: STAGE 5 EXECUTION DEBUGGER ── */}
        {activeTab === 'debug' && (
          <div className="space-y-4">
            {/* Status & Duration Summary Card */}
            <div className="rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Execution Status:</span>
                {renderStatusBadge()}
              </div>

              {nodeDebugRecord?.durationMs !== undefined && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Duration:</span>
                  <span className="font-mono text-violet-300 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {nodeDebugRecord.durationMs}ms
                  </span>
                </div>
              )}

              {nodeDebugRecord?.selectedBranch && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Branch Selected:</span>
                  <span
                    className={`font-mono uppercase font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      nodeDebugRecord.selectedBranch === 'true'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {nodeDebugRecord.selectedBranch}
                  </span>
                </div>
              )}
            </div>

            {/* Error Banner if failed */}
            {nodeDebugRecord?.error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Error Details</span>
                </div>
                <p className="text-xs text-red-300 font-mono leading-relaxed break-words">
                  {nodeDebugRecord.error}
                </p>
              </div>
            )}

            {/* Captured Node Input JSON */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center justify-between">
                <span>Input JSON (Received from upstream)</span>
              </div>
              <JsonViewer
                data={nodeDebugRecord?.inputData ?? { message: 'No input captured yet. Run workflow to capture.' }}
                label="Incoming Payload"
                defaultExpanded={true}
              />
            </div>

            {/* Captured Node Output JSON */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center justify-between">
                <span>Output JSON (Emitted downstream)</span>
              </div>
              <JsonViewer
                data={nodeDebugRecord?.outputData ?? { message: 'No output generated yet. Run workflow to capture.' }}
                label="Result Output"
                defaultExpanded={true}
              />
            </div>
          </div>
        )}

        {/* Metadata info */}
        <div className="border-t border-[#1e1e2e] pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Node Identifier
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors"
            >
              {copiedId ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy ID
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-500 font-mono bg-[#1a1a2e] p-1.5 rounded border border-[#2a2a3e] truncate">
            {selectedNode.id}
          </p>
        </div>
      </div>

      {/* Delete Node Button */}
      <div className="border-t border-[#1e1e2e] p-4 bg-[#13131d]">
        <Button
          variant="destructive"
          size="sm"
          className="w-full flex items-center justify-center gap-2"
          onClick={() => deleteNode(selectedNode.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </Button>
      </div>
    </aside>
  );
}
