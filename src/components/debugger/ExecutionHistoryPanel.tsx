import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ArrowLeft,
  Layers,
  Activity,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Slash,
  FileJson,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import {
  executionService,
  type ExecutionSummary,
  type FullExecutionDetails,
  type NodeExecutionItem,
} from '@/services/executionService';
import { isUUID } from '@/services/cloudWorkflowService';
import { cn } from '@/lib/utils';

export function ExecutionHistoryPanel() {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const isCloudWorkflow = useWorkflowStore((s) => s.isCloudWorkflow);
  const localExecutionHistory = useWorkflowStore((s) => s.executionHistory);
  const isRunning = useWorkflowStore((s) => s.isRunning);

  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [details, setDetails] = useState<FullExecutionDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'nodes' | 'events' | 'snapshot'>('nodes');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isCloud = isCloudWorkflow && isUUID(workflowId);

  const handleRefresh = useCallback(() => {
    if (!isCloud) return;
    setIsLoading(true);
    executionService
      .listWorkflowExecutions(workflowId, { status: statusFilter })
      .then(({ data }) => {
        setExecutions(data || []);
        setIsLoading(false);
      });
  }, [isCloud, workflowId, statusFilter]);

  // Load execution history when component mounts, filter changes, or workflow finishes
  useEffect(() => {
    if (!isCloud) return;
    let isCancelled = false;
    executionService
      .listWorkflowExecutions(workflowId, { status: statusFilter })
      .then(({ data }) => {
        if (!isCancelled) {
          setExecutions(data || []);
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [isCloud, workflowId, statusFilter, isRunning]);

  // Load details when an execution is selected
  useEffect(() => {
    if (!selectedExecutionId) return;
    let isCancelled = false;
    executionService.getExecutionDetails(selectedExecutionId).then(({ data }) => {
      if (!isCancelled) {
        setDetails(data);
        setIsLoadingDetails(false);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedExecutionId]);

  const handleSelectExecution = (id: string | null) => {
    setSelectedExecutionId(id);
    if (!id) {
      setDetails(null);
    } else {
      setIsLoadingDetails(true);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const getStatusBadge = (status: string, errorMessage?: string | null) => {
    const isInterrupted =
      status === 'interrupted' ||
      (status === 'failed' && Boolean(errorMessage && errorMessage.toLowerCase().includes('interrupted')));

    if (isInterrupted) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
          <AlertTriangle className="h-3 w-3" /> Interrupted
        </span>
      );
    }

    switch (status) {
      case 'success':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Success
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
            <AlertCircle className="h-3 w-3" /> Failed
          </span>
        );
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
            <Loader2 className="h-3 w-3 animate-spin" /> Running
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-500/10 px-2 py-0.5 rounded border border-gray-500/20">
            <Slash className="h-3 w-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-500/10 px-2 py-0.5 rounded border border-gray-500/20 capitalize">
            {status}
          </span>
        );
    }
  };

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (selectedExecutionId) {
    return (
      <div className="flex flex-col h-full bg-[#13131d] text-xs">
        {/* Detail Header */}
        <div className="flex items-center justify-between border-b border-[#1e1e2e] bg-[#101018] px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSelectExecution(null)}
              className="h-6 px-2 text-[11px] text-gray-400 hover:text-gray-200 gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
            <div className="h-3.5 w-px bg-[#2a2a3e]" />
            <span className="font-mono text-gray-300 font-medium">
              Run: {selectedExecutionId.slice(0, 8)}...
            </span>
            {details && getStatusBadge(details.execution.status, details.execution.errorMessage)}
          </div>

          {details && (
            <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-gray-500" />
                {details.execution.durationMs !== null ? `${details.execution.durationMs}ms` : '—'}
              </span>
              <span>{details.execution.startedAt ? new Date(details.execution.startedAt).toLocaleTimeString() : ''}</span>
            </div>
          )}
        </div>

        {/* Detail Subtabs */}
        <div className="flex border-b border-[#1e1e2e] bg-[#141422] px-3 gap-2 shrink-0">
          <button
            onClick={() => setDetailsTab('nodes')}
            className={cn(
              'flex items-center gap-1.5 py-1.5 text-xs font-medium border-b-2 transition-colors',
              detailsTab === 'nodes'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            <Layers className="h-3 w-3" />
            Nodes ({details?.nodeExecutions.length ?? 0})
          </button>
          <button
            onClick={() => setDetailsTab('events')}
            className={cn(
              'flex items-center gap-1.5 py-1.5 text-xs font-medium border-b-2 transition-colors',
              detailsTab === 'events'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            <Activity className="h-3 w-3" />
            Events ({details?.events.length ?? 0})
          </button>
          <button
            onClick={() => setDetailsTab('snapshot')}
            className={cn(
              'flex items-center gap-1.5 py-1.5 text-xs font-medium border-b-2 transition-colors',
              detailsTab === 'snapshot'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            )}
          >
            <FileJson className="h-3 w-3" />
            Snapshot
          </button>
        </div>

        {/* Subtab Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingDetails ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400 mb-2" />
              Loading run details...
            </div>
          ) : !details ? (
            <div className="text-center py-8 text-gray-500">Execution details not found.</div>
          ) : detailsTab === 'nodes' ? (
            /* Nodes View */
            details.nodeExecutions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">No node execution records.</div>
            ) : (
              <div className="space-y-1.5">
                {details.nodeExecutions.map((node: NodeExecutionItem) => {
                  const isExpanded = expandedNodes[node.nodeId];
                  return (
                    <div
                      key={node.nodeId}
                      className="rounded-lg border border-[#2a2a3e] bg-[#181826] overflow-hidden"
                    >
                      <div
                        onClick={() => toggleNodeExpanded(node.nodeId)}
                        className="flex items-center justify-between p-2.5 hover:bg-[#1f1f34] cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                          )}
                          <span className="font-semibold text-gray-200">
                            {node.nodeLabel || node.nodeId}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">({node.nodeType})</span>
                          {getStatusBadge(node.status)}
                        </div>

                        <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
                          {node.durationMs !== null && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <Clock className="h-3 w-3 text-gray-500" />
                              {node.durationMs}ms
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expanded Input / Output Payload Inspector */}
                      {isExpanded && (
                        <div className="border-t border-[#242438] bg-[#11111a] p-3 space-y-3">
                          {node.errorMessage && (
                            <div className="rounded bg-red-950/30 border border-red-800/40 p-2 text-red-300">
                              <span className="font-bold">Error:</span> {node.errorMessage}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold uppercase text-gray-400">
                                  Input Payload (Redacted)
                                </span>
                                {Boolean(node.inputPayload) && (
                                  <button
                                    onClick={() =>
                                      handleCopy(
                                        JSON.stringify(node.inputPayload, null, 2),
                                        `in-${node.nodeId}`
                                      )
                                    }
                                    className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
                                  >
                                    {copiedId === `in-${node.nodeId}` ? (
                                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5" />
                                    )}
                                    Copy
                                  </button>
                                )}
                              </div>
                              <pre className="rounded bg-[#0d0d15] border border-[#222234] p-2 text-[10px] font-mono text-gray-300 max-h-36 overflow-y-auto">
                                {node.inputPayload
                                  ? JSON.stringify(node.inputPayload, null, 2)
                                  : 'No input payload'}
                              </pre>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold uppercase text-gray-400">
                                  Output Payload (Redacted)
                                </span>
                                {Boolean(node.outputPayload) && (
                                  <button
                                    onClick={() =>
                                      handleCopy(
                                        JSON.stringify(node.outputPayload, null, 2),
                                        `out-${node.nodeId}`
                                      )
                                    }
                                    className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
                                  >
                                    {copiedId === `out-${node.nodeId}` ? (
                                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="h-2.5 w-2.5" />
                                    )}
                                    Copy
                                  </button>
                                )}
                              </div>
                              <pre className="rounded bg-[#0d0d15] border border-[#222234] p-2 text-[10px] font-mono text-gray-300 max-h-36 overflow-y-auto">
                                {node.outputPayload
                                  ? JSON.stringify(node.outputPayload, null, 2)
                                  : 'No output payload'}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : detailsTab === 'events' ? (
            /* Events View */
            details.events.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">No timeline events recorded.</div>
            ) : (
              <div className="space-y-1">
                {details.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between p-2 rounded border border-[#242438] bg-[#161624] text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {ev.eventType}
                      </span>
                      <span className="text-gray-300">{ev.message || '—'}</span>
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {new Date(ev.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Snapshot View */
            <div>
              {details.definitionSnapshot ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="font-semibold">Snapshot:</span>
                    <span>{details.definitionSnapshot.name}</span>
                    <span className="text-gray-500">
                      ({details.definitionSnapshot.nodes?.length || 0} nodes,{' '}
                      {details.definitionSnapshot.edges?.length || 0} edges)
                    </span>
                  </div>
                  <pre className="rounded bg-[#0d0d15] border border-[#222234] p-2.5 text-[10px] font-mono text-gray-300 max-h-48 overflow-y-auto">
                    {JSON.stringify(details.definitionSnapshot, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 italic">
                  No snapshot captured for this run.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#13131d] text-xs">
      {/* List Header & Filters */}
      <div className="flex items-center justify-between border-b border-[#1e1e2e] bg-[#101018] px-3 py-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mr-1">
            Status:
          </span>
          {['all', 'success', 'failed', 'running', 'cancelled', 'interrupted'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded capitalize transition-colors font-medium',
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a2e]'
              )}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isCloud && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-6 px-2 text-[11px] text-gray-400 hover:text-gray-200 gap-1"
            >
              <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1a1a2e]">
        {isCloud ? (
          isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400 mb-2" />
              Loading cloud execution history...
            </div>
          ) : executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Clock className="h-6 w-6 text-gray-600 mb-2" />
              <p className="text-gray-400 font-medium">No execution history found</p>
              <p className="text-gray-600 text-[11px] mt-0.5">
                Click "Run" in the top navigation to execute this workflow.
              </p>
            </div>
          ) : (
            executions.map((exec) => (
              <div
                key={exec.id}
                onClick={() => handleSelectExecution(exec.id)}
                className="flex items-center justify-between p-2.5 hover:bg-[#181828] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {getStatusBadge(exec.status, exec.errorMessage)}
                  <div>
                    <div className="flex items-center gap-1.5 font-mono text-gray-300">
                      <span>{exec.id.slice(0, 8)}...</span>
                      <span className="text-[10px] text-gray-500">({exec.triggerType})</span>
                    </div>
                    {exec.errorMessage && (
                      <p className="text-[10px] text-red-400 truncate max-w-sm mt-0.5">
                        {exec.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-gray-400 font-mono text-[11px]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-500" />
                    {exec.durationMs !== null ? `${exec.durationMs}ms` : '—'}
                  </span>
                  <span>{exec.startedAt ? new Date(exec.startedAt).toLocaleString() : new Date(exec.createdAt).toLocaleString()}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </div>
              </div>
            ))
          )
        ) : (
          /* Local / Offline History fallback */
          localExecutionHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Clock className="h-6 w-6 text-gray-600 mb-2" />
              <p className="text-gray-400 font-medium">No local execution runs</p>
              <p className="text-gray-600 text-[11px] mt-0.5">
                Click "Run" to execute this workflow locally.
              </p>
            </div>
          ) : (
            localExecutionHistory.map((run) => (
              <div
                key={run.executionId}
                className="flex items-center justify-between p-2.5 hover:bg-[#181828] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {run.success ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3" /> Success
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                      <AlertCircle className="h-3 w-3" /> Failed
                    </span>
                  )}
                  <div>
                    <span className="font-mono text-gray-300">{run.executionId}</span>
                    {run.error && <p className="text-[10px] text-red-400 mt-0.5">{run.error}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-gray-400 font-mono text-[11px]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-500" />
                    {run.durationMs}ms
                  </span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
