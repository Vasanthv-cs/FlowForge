import { useState, useMemo } from 'react';
import {
  ScrollText,
  AlertTriangle,
  History,
  X,
  Trash2,
  Info,
  AlertCircle,
  CheckCircle2,
  Clock,
  Terminal,
  Activity,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import { cn } from '@/lib/utils';
import type { LogLevel } from '@/types/workflow';
import { ExecutionTimeline } from '@/components/debugger/ExecutionTimeline';
import { ExecutionSummaryBar } from '@/components/debugger/ExecutionSummaryBar';

const logIconMap: Record<LogLevel, React.ReactNode> = {
  info: <Info className="h-3.5 w-3.5 text-blue-400" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  log: <Terminal className="h-3.5 w-3.5 text-gray-400" />,
};

const logTextColor: Record<LogLevel, string> = {
  info: 'text-gray-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  success: 'text-emerald-300',
  log: 'text-gray-200',
};

const tabs = [
  { id: 'logs' as const, label: 'Execution Logs', icon: ScrollText },
  { id: 'timeline' as const, label: 'Timeline', icon: Activity },
  { id: 'errors' as const, label: 'Validation Issues', icon: AlertTriangle },
  { id: 'history' as const, label: 'Past Runs', icon: History },
];

export function BottomPanel() {
  const activeTab = useWorkflowStore((s) => s.bottomTab);
  const setActiveTab = useWorkflowStore((s) => s.setBottomTab);
  const toggleBottomPanel = useWorkflowStore((s) => s.toggleBottomPanel);
  const logs = useWorkflowStore((s) => s.logs);
  const clearLogs = useWorkflowStore((s) => s.clearLogs);
  const validationErrors = useWorkflowStore((s) => s.validationErrors);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const rightSidebarOpen = useWorkflowStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useWorkflowStore((s) => s.toggleRightSidebar);
  const executionHistory = useWorkflowStore((s) => s.executionHistory);

  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [searchLog, setSearchLog] = useState<string>('');

  // Determine current active run
  const activeRun = useMemo(() => {
    if (selectedRunId) {
      return executionHistory.find((h) => h.executionId === selectedRunId);
    }
    return executionHistory[0];
  }, [executionHistory, selectedRunId]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesFilter = logFilter === 'all' || log.level === logFilter;
      const matchesSearch =
        !searchLog.trim() ||
        log.message.toLowerCase().includes(searchLog.toLowerCase()) ||
        (log.nodeLabel && log.nodeLabel.toLowerCase().includes(searchLog.toLowerCase()));
      return matchesFilter && matchesSearch;
    });
  }, [logs, logFilter, searchLog]);

  return (
    <div className="flex flex-col border-t border-[#1e1e2e] bg-[#13131d] h-56 shrink-0 select-none">
      {/* Tab Navigation Header Bar */}
      <div className="flex items-center justify-between border-b border-[#1e1e2e] px-2 h-8 shrink-0 bg-[#101018]">
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-[#1e1e2e] text-gray-200'
                  : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
              {tab.id === 'errors' && validationErrors.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] text-amber-400">
                  {validationErrors.length}
                </span>
              )}
              {tab.id === 'history' && executionHistory.length > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-violet-500/20 px-1 text-[10px] text-violet-400">
                  {executionHistory.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab === 'logs' && (
            <>
              {/* Search Log Input */}
              <div className="relative flex items-center">
                <Search className="absolute left-1.5 h-3 w-3 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={searchLog}
                  onChange={(e) => setSearchLog(e.target.value)}
                  className="h-6 pl-5 pr-2 w-32 rounded bg-[#1a1a2e] border border-[#2a2a3e] text-[10px] text-gray-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Log Level Filter */}
              <select
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="h-6 rounded border border-[#2a2a3e] bg-[#1a1a2e] px-1.5 text-[10px] font-mono text-gray-300 focus:outline-none cursor-pointer"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warnings</option>
                <option value="error">Errors</option>
                <option value="success">Success</option>
              </select>

              {logs.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearLogs}
                  className="h-6 w-6"
                  title="Clear Logs"
                >
                  <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-400" />
                </Button>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleBottomPanel}
            className="h-6 w-6"
            title="Close Panel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* STAGE 5 Execution Summary Bar */}
      <ExecutionSummaryBar
        currentRun={activeRun}
        history={executionHistory}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => setSelectedRunId(runId)}
      />

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto">
        {/* ── TAB 1: LOGS ── */}
        {activeTab === 'logs' && (
          <div className="font-mono text-xs">
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8 text-center">
                <p className="text-gray-500 text-xs">
                  {logs.length === 0
                    ? 'No execution logs recorded yet. Click "Run" to execute.'
                    : 'No logs matching current filter.'}
                </p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 border-b border-[#1a1a2e] px-3 py-1.5 hover:bg-[#1a1a2e]/50 font-mono text-[11px]"
                >
                  <span className="shrink-0 mt-0.5">{logIconMap[log.level]}</span>
                  <span className="text-[10px] text-gray-500 shrink-0 mt-[1px] w-20">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  {log.nodeLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        if (log.nodeId) {
                          setSelectedNodeId(log.nodeId);
                          if (!rightSidebarOpen) toggleRightSidebar();
                        }
                      }}
                      className="text-[10px] text-violet-400 hover:text-violet-300 hover:underline shrink-0 mt-[1px] cursor-pointer"
                    >
                      [{log.nodeLabel}]
                    </button>
                  )}
                  <span className={cn('mt-[1px] leading-relaxed', logTextColor[log.level])}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── TAB 2: EXECUTION TIMELINE ── */}
        {activeTab === 'timeline' && (
          <ExecutionTimeline events={activeRun?.timeline ?? []} />
        )}

        {/* ── TAB 3: VALIDATION ISSUES ── */}
        {activeTab === 'errors' && (
          <div className="text-xs">
            {validationErrors.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-gray-600 text-xs">
                  No validation issues detected. Click "Validate" to check workflow integrity.
                </p>
              </div>
            ) : (
              validationErrors.map((err) => (
                <button
                  key={err.id}
                  onClick={() => {
                    if (err.nodeId) {
                      setSelectedNodeId(err.nodeId);
                      if (!rightSidebarOpen) toggleRightSidebar();
                    }
                  }}
                  className="flex w-full items-start gap-2 border-b border-[#1a1a2e] px-3 py-2 text-left hover:bg-[#1a1a2e]/50 transition-colors"
                >
                  {err.severity === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p
                      className={cn(
                        err.severity === 'error'
                          ? 'text-red-300'
                          : 'text-amber-300',
                      )}
                    >
                      {err.message}
                    </p>
                    {err.nodeLabel && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Target Node: <span className="text-gray-400">{err.nodeLabel}</span> (click to inspect)
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* ── TAB 4: PAST RUNS ── */}
        {activeTab === 'history' && (
          <div className="text-xs">
            {executionHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-gray-600 text-xs">
                  No previous execution records. Click "Run" to execute your workflow.
                </p>
              </div>
            ) : (
              executionHistory.map((run) => (
                <div
                  key={run.executionId}
                  onClick={() => {
                    setSelectedRunId(run.executionId);
                    setActiveTab('timeline');
                  }}
                  className="flex items-center justify-between border-b border-[#1a1a2e] px-3 py-2 hover:bg-[#1a1a2e]/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {run.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    )}
                    <div>
                      <span className="font-mono text-[11px] text-gray-200">
                        {run.executionId}
                      </span>
                      <p className="text-[10px] text-gray-500">
                        {new Date(run.startedAt).toLocaleString()}
                        {run.error && <span className="text-red-400 ml-1.5">• {run.error}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-500" />
                      {run.durationMs}ms
                    </span>
                    <span className="rounded bg-[#252538] px-1.5 py-0.5 text-[10px] text-gray-300">
                      {run.nodesExecuted} nodes
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
