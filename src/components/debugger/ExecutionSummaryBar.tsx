import { Clock, CheckCircle2, AlertCircle, History } from 'lucide-react';
import type { WorkflowRunResult } from '@/engine/types';

interface ExecutionSummaryBarProps {
  currentRun?: WorkflowRunResult;
  history: WorkflowRunResult[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
}

export function ExecutionSummaryBar({
  currentRun,
  history,
  selectedRunId,
  onSelectRun,
}: ExecutionSummaryBarProps) {
  if (!currentRun && history.length === 0) {
    return null;
  }

  const activeRun =
    history.find((h) => h.executionId === selectedRunId) ?? currentRun ?? history[0];

  if (!activeRun) return null;

  // Calculate stats
  const records = Object.values(activeRun.nodeRecords || {});
  const successCount = records.filter((r) => r.state === 'success').length;
  const failedCount = records.filter((r) => r.state === 'failed').length;
  const skippedCount = records.filter((r) => r.state === 'skipped').length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e1e2e] bg-[#101018] px-3 py-2 text-xs">
      {/* Left: Previous Run Selector */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
          <History className="h-3.5 w-3.5 text-violet-400" />
          Run:
        </span>
        <select
          value={activeRun.executionId}
          onChange={(e) => onSelectRun(e.target.value)}
          className="h-6 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-2 text-[11px] font-mono text-gray-200 focus:border-violet-500 focus:outline-none cursor-pointer"
        >
          {history.map((run, idx) => (
            <option key={run.executionId} value={run.executionId}>
              #{history.length - idx} • {run.success ? 'Success' : 'Failed'} ({run.durationMs}ms)
            </option>
          ))}
        </select>

        {activeRun.success ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" /> PASSED
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertCircle className="h-3 w-3" /> FAILED
          </span>
        )}
      </div>

      {/* Right: Metrics */}
      <div className="flex items-center gap-4 text-[11px] text-gray-400 font-mono">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-gray-500" />
          <span>Duration: <strong className="text-gray-200">{activeRun.durationMs}ms</strong></span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-emerald-400">{successCount} passed</span>
          {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
          {skippedCount > 0 && <span className="text-amber-400">{skippedCount} skipped</span>}
        </div>
      </div>
    </div>
  );
}
