import { useState, useMemo } from 'react';
import {
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Play,
  X,
  Layers,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { executionService, type NodeExecutionItem } from '@/services/executionService';

interface ReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNode: NodeExecutionItem;
  executionId: string;
  workspaceId: string;
  snapshotDefinition?: {
    nodes: Array<{ id: string; data?: { label?: string; type?: string } }>;
    edges: Array<{ source: string; target: string }>;
  } | null;
  onReplaySuccess: (newExecutionId: string) => void;
}

export function ReplayModal({
  isOpen,
  onClose,
  targetNode,
  executionId,
  workspaceId,
  snapshotDefinition,
  onReplaySuccess,
}: ReplayModalProps) {
  const [safeReplay, setSafeReplay] = useState(true);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [editedInputText, setEditedInputText] = useState(() => {
    try {
      return targetNode.inputPayload
        ? JSON.stringify(targetNode.inputPayload, null, 2)
        : '{}';
    } catch {
      return '{}';
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute upstream (reused) and downstream (re-executed) nodes
  const { reusedNodes, downstreamNodes } = useMemo(() => {
    if (!snapshotDefinition?.nodes || !snapshotDefinition?.edges) {
      return { reusedNodes: [], downstreamNodes: [] };
    }

    const adjacency = new Map<string, string[]>();
    for (const edge of snapshotDefinition.edges) {
      const list = adjacency.get(edge.source) || [];
      list.push(edge.target);
      adjacency.set(edge.source, list);
    }

    const downstream = new Set<string>();
    downstream.add(targetNode.nodeId);
    const queue = [targetNode.nodeId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = adjacency.get(cur) || [];
      for (const n of neighbors) {
        if (!downstream.has(n)) {
          downstream.add(n);
          queue.push(n);
        }
      }
    }

    const reused: Array<{ id: string; label: string; type: string }> = [];
    const down: Array<{ id: string; label: string; type: string }> = [];

    for (const n of snapshotDefinition.nodes) {
      const label = n.data?.label || n.id;
      const type = n.data?.type || 'node';
      if (downstream.has(n.id)) {
        down.push({ id: n.id, label, type });
      } else {
        reused.push({ id: n.id, label, type });
      }
    }

    return { reusedNodes: reused, downstreamNodes: down };
  }, [snapshotDefinition, targetNode.nodeId]);

  if (!isOpen) return null;

  const handleInputChange = (val: string) => {
    setEditedInputText(val);
    try {
      JSON.parse(val);
      setIsJsonValid(true);
      setErrorMessage(null);
    } catch {
      setIsJsonValid(false);
    }
  };

  const handleExecuteReplay = async () => {
    if (!isJsonValid) {
      setErrorMessage('Please fix the JSON input before proceeding.');
      return;
    }

    if (!safeReplay && !liveConfirmed) {
      setErrorMessage('You must confirm live request execution or enable Safe Replay Mode.');
      return;
    }

    let parsedInput: Record<string, unknown> | undefined;
    try {
      parsedInput = JSON.parse(editedInputText);
    } catch {
      setErrorMessage('Invalid JSON in input payload.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await executionService.replayExecution({
      workspaceId,
      executionId,
      targetNodeId: targetNode.nodeId,
      editedInput: parsedInput,
      safeReplay,
    });

    setIsSubmitting(false);

    if (error || !data) {
      setErrorMessage(error || 'Failed to initiate workflow replay.');
      return;
    }

    onReplaySuccess(data.executionId);
    onClose();
  };

  const canSubmit = isJsonValid && (safeReplay || liveConfirmed) && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-xl border border-[#2a2a3e] bg-[#13131e] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#232338] bg-[#101018] px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
              <RotateCcw className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100 text-sm">
                Time-Travel Replay: {targetNode.nodeLabel || targetNode.nodeId}
              </h3>
              <p className="text-[11px] text-gray-400">
                Replaying workflow starting from this node using historical state snapshot.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Execution Partition Summary */}
          <div className="grid grid-cols-2 gap-3">
            {/* Upstream Reused */}
            <div className="rounded-lg border border-[#242438] bg-[#161622] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5 text-[11px]">
                  <Layers className="h-3.5 w-3.5" /> Reused Upstream ({reusedNodes.length})
                </span>
                <span className="text-[10px] text-gray-500 font-mono">No Re-execution</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {reusedNodes.length === 0 ? (
                  <span className="text-gray-500 italic text-[11px]">None (replaying from trigger)</span>
                ) : (
                  reusedNodes.map((n) => (
                    <span
                      key={n.id}
                      className="px-1.5 py-0.5 rounded bg-purple-950/40 border border-purple-800/40 text-purple-300 text-[10px] font-mono"
                      title={n.id}
                    >
                      {n.label}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Downstream Re-executed */}
            <div className="rounded-lg border border-[#242438] bg-[#161622] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-violet-300 flex items-center gap-1.5 text-[11px]">
                  <Play className="h-3.5 w-3.5" /> Re-executed Nodes ({downstreamNodes.length})
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Fresh Run</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {downstreamNodes.map((n) => (
                  <span
                    key={n.id}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                      n.id === targetNode.nodeId
                        ? 'bg-violet-600/30 border-violet-500/60 text-violet-200 font-bold'
                        : 'bg-[#1e1e30] border-[#2a2a40] text-gray-300'
                    }`}
                    title={n.id}
                  >
                    {n.label} {n.id === targetNode.nodeId ? '(Target)' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Safe Replay Mode Control (Default: ON) */}
          <div
            className={`p-3 rounded-lg border transition-colors ${
              safeReplay
                ? 'bg-emerald-950/20 border-emerald-500/30'
                : 'bg-amber-950/20 border-amber-500/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className={`h-4 w-4 ${safeReplay ? 'text-emerald-400' : 'text-amber-400'}`}
                />
                <span className="font-semibold text-gray-200 text-xs">
                  Safe Replay Mode
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono ${
                    safeReplay
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {safeReplay ? 'DEFAULT: ACTIVE' : 'LIVE REQUESTS'}
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={safeReplay}
                  onChange={(e) => {
                    setSafeReplay(e.target.checked);
                    if (e.target.checked) setLiveConfirmed(false);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              {safeReplay
                ? 'Mocks external HTTP requests and webhooks using recorded historical outputs. Prevents duplicate charges, emails, or third-party side effects.'
                : 'Warning: Real HTTP requests will be dispatched to remote endpoints. Verify that external actions and mutation calls are safe to repeat.'}
            </p>

            {!safeReplay && (
              <div className="mt-2.5 pt-2 border-t border-amber-500/30">
                <label className="flex items-start gap-2 cursor-pointer text-amber-200 text-[11px]">
                  <input
                    type="checkbox"
                    checked={liveConfirmed}
                    onChange={(e) => setLiveConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-amber-500 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    I confirm that live external requests may execute and contact external services.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Optional Input Payload Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-300">
                Incoming Payload for Replayed Node (Optional JSON Override):
              </label>
              <span
                className={`text-[10px] font-mono ${
                  isJsonValid ? 'text-emerald-400' : 'text-red-400 font-bold'
                }`}
              >
                {isJsonValid ? 'Valid JSON' : 'Invalid JSON'}
              </span>
            </div>
            <textarea
              rows={4}
              value={editedInputText}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a3e] bg-[#0e0e17] p-2.5 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none resize-none"
              placeholder="{ ... }"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#232338] bg-[#101018] px-4 py-3 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-200"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleExecuteReplay}
            disabled={!canSubmit}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 font-medium"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Dispatching Replay...
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Start Replay Execution
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
