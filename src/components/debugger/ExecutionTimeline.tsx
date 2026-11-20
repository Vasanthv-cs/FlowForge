import {
  Play,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Loader2,
  Workflow,
  Clock,
} from 'lucide-react';
import type { TimelineEvent } from '@/engine/types';
import { useWorkflowStore } from '@/store/workflowStore';

interface ExecutionTimelineProps {
  events: TimelineEvent[];
}

export function ExecutionTimeline({ events }: ExecutionTimelineProps) {
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const rightSidebarOpen = useWorkflowStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useWorkflowStore((s) => s.toggleRightSidebar);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 text-center text-gray-500">
        <Clock className="h-6 w-6 mb-2 opacity-50" />
        <p className="text-xs">No execution timeline recorded yet.</p>
        <p className="text-[11px] text-gray-600 mt-0.5">
          Run your workflow to observe live node start, completion, and duration benchmarks.
        </p>
      </div>
    );
  }

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'workflow_started':
        return <Play className="h-3 w-3 text-cyan-400" />;
      case 'node_started':
        return <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />;
      case 'node_completed':
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case 'node_failed':
        return <XCircle className="h-3 w-3 text-red-400" />;
      case 'node_skipped':
        return <PauseCircle className="h-3 w-3 text-amber-400" />;
      case 'workflow_completed':
        return <Workflow className="h-3 w-3 text-violet-400" />;
    }
  };

  const handleNodeClick = (nodeId?: string) => {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    if (!rightSidebarOpen) toggleRightSidebar();
  };

  return (
    <div className="p-3 space-y-2">
      <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#2a2a3e]">
        {events.map((ev) => (
          <div key={ev.id} className="relative group text-xs">
            {/* Timeline bullet dot */}
            <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a2e] border border-[#2a2a3e] shadow-sm">
              {getEventIcon(ev.type)}
            </div>

            {/* Event Content */}
            <div className="flex items-center justify-between rounded-md bg-[#161622] px-3 py-1.5 border border-[#232336] hover:border-violet-500/40 transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] text-gray-500 shrink-0">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>

                {ev.nodeLabel ? (
                  <button
                    type="button"
                    onClick={() => handleNodeClick(ev.nodeId)}
                    className="font-semibold text-violet-300 hover:text-violet-200 underline underline-offset-2 decoration-violet-500/40 truncate text-left"
                    title="Click to inspect this node"
                  >
                    {ev.nodeLabel}
                  </button>
                ) : null}

                <span className="text-gray-300 truncate">{ev.message}</span>
              </div>

              {ev.durationMs !== undefined && ev.durationMs > 0 && (
                <span className="font-mono text-[10px] text-emerald-400 shrink-0 ml-2 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                  +{ev.durationMs}ms
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
