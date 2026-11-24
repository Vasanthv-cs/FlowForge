import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Activity,
  CheckCircle2,
  Clock,
  Zap,
  Server,
  Layers,
  AlertTriangle,
  Database,
  Calendar,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import {
  metricsClientService,
  type SystemHealthSummary,
} from '@/services/metricsClientService';
import type {
  ExecutionMetricsSummary,
  MetricsTimeRange,
  VolumeBucket,
} from '@/server/services/metricsService';
import { cn } from '@/lib/utils';

interface MonitoringDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MonitoringDashboardModal({ isOpen, onClose }: MonitoringDashboardModalProps) {
  const storeWorkspaceId = useWorkflowStore((s) => s.workspaceId);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceId = storeWorkspaceId || activeWorkspaceId;

  const [timeRange, setTimeRange] = useState<MetricsTimeRange>('24h');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = off, 10 = 10s, 30 = 30s
  const [metrics, setMetrics] = useState<ExecutionMetricsSummary | null>(null);
  const [health, setHealth] = useState<SystemHealthSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'failures' | 'health'>('overview');

  const fetchDashboardData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    setError(null);

    const [metricsRes, healthRes] = await Promise.all([
      metricsClientService.getMetrics(workspaceId, { timeRange }),
      metricsClientService.getSystemHealth(workspaceId),
    ]);

    if (metricsRes.error) {
      setError(metricsRes.error);
    } else {
      setMetrics(metricsRes.data);
    }

    if (!healthRes.error && healthRes.data) {
      setHealth(healthRes.data);
    }

    setIsLoading(false);
  }, [workspaceId, timeRange]);

  // Initial fetch and fetch on dependency change
  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) void fetchDashboardData();
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, workspaceId, timeRange, fetchDashboardData]);

  // Auto-refresh timer
  useEffect(() => {
    if (!isOpen || autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      void fetchDashboardData();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(timer);
  }, [isOpen, autoRefreshInterval, fetchDashboardData]);

  const maxVolume = useMemo(() => {
    if (!metrics || metrics.volumeOverTime.length === 0) return 1;
    return Math.max(...metrics.volumeOverTime.map((b) => b.total), 1);
  }, [metrics]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-6xl h-[88vh] bg-[#141422] border border-[#2a2a3e] rounded-2xl shadow-2xl overflow-hidden text-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242438] bg-[#1a1a2e]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                Operational Monitoring & Execution Metrics
                {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />}
              </h2>
              <p className="text-xs text-gray-400">
                Workspace performance, failure diagnostics, system queue depths, and worker health.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto refresh dropdown */}
            <div className="flex items-center bg-[#141422] rounded-lg border border-[#2a2a3e] p-0.5 text-xs">
              <span className="px-2 text-gray-400 text-[11px]">Auto:</span>
              {[
                { label: 'Off', val: 0 },
                { label: '10s', val: 10 },
                { label: '30s', val: 30 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setAutoRefreshInterval(opt.val)}
                  className={cn(
                    'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                    autoRefreshInterval === opt.val
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Time range selector */}
            <div className="flex items-center bg-[#141422] rounded-lg border border-[#2a2a3e] p-0.5 text-xs">
              {(['1h', '24h', '7d', '30d'] as MetricsTimeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setTimeRange(range)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    timeRange === range
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  )}
                >
                  {range === '1h' ? '1H' : range === '24h' ? '24H' : range === '7d' ? '7D' : '30D'}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="h-8 px-2.5 border-[#2a2a3e] hover:bg-[#252538]"
              title="Refresh metrics now"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </Button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#252538] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Subnav */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-[#242438] bg-[#171728] text-xs">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                activeTab === 'overview'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              Overview & Analytics
            </button>
            <button
              onClick={() => setActiveTab('failures')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                activeTab === 'failures'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Failure Diagnostics ({metrics?.recentFailures.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5',
                activeTab === 'health'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Server className="h-3.5 w-3.5" />
              Infrastructure & Queues
            </button>
          </div>

          {health && (
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    health.database.status === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                  )}
                />
                DB: {health.database.latencyMs}ms
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    health.worker.status === 'available' ? 'bg-emerald-400' : 'bg-amber-400'
                  )}
                />
                Worker: {health.worker.activeJobs}/{health.worker.maxConcurrency} active
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-gray-500" />
                Queue: {health.queue.queuedCount} waiting
              </span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error ? (
            <div className="p-8 text-center bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-3">
              <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
              <h3 className="text-sm font-semibold text-rose-200">Failed to load monitoring metrics</h3>
              <p className="text-xs text-rose-300/80 max-w-md mx-auto">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchDashboardData} className="border-rose-500/30 text-rose-200">
                Retry Connection
              </Button>
            </div>
          ) : !workspaceId ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              Please select an active workspace to view execution metrics.
            </div>
          ) : isLoading && !metrics ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-400" />
              Loading real-time execution analytics...
            </div>
          ) : metrics ? (
            <>
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Cards Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {/* Total Executions */}
                    <div className="p-4 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-1">
                      <div className="flex items-center justify-between text-gray-400 text-xs">
                        <span>Total Executions</span>
                        <Zap className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className="text-2xl font-bold text-white tracking-tight">
                        {metrics.counts.total.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-2 pt-1">
                        <span className="text-emerald-400 font-medium">✓ {metrics.counts.success}</span>
                        <span className="text-rose-400 font-medium">✗ {metrics.counts.failed}</span>
                        <span className="text-gray-400">⊘ {metrics.counts.cancelled}</span>
                      </div>
                    </div>

                    {/* Success Rate */}
                    <div className="p-4 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-1">
                      <div className="flex items-center justify-between text-gray-400 text-xs">
                        <span>Success Rate</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      </div>
                      <div
                        className={cn(
                          'text-2xl font-bold tracking-tight',
                          metrics.rates.successRate >= 90
                            ? 'text-emerald-400'
                            : metrics.rates.successRate >= 75
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        )}
                      >
                        {metrics.rates.successRate}%
                      </div>
                      <div className="text-[11px] text-gray-500 pt-1">
                        Failure rate: <span className="text-rose-400">{metrics.rates.failureRate}%</span>
                      </div>
                    </div>

                    {/* Duration P50 / P95 */}
                    <div className="p-4 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-1">
                      <div className="flex items-center justify-between text-gray-400 text-xs">
                        <span>Avg / P95 Latency</span>
                        <Clock className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div className="text-2xl font-bold text-white tracking-tight">
                        {metrics.duration.avgMs >= 1000
                          ? `${(metrics.duration.avgMs / 1000).toFixed(2)}s`
                          : `${metrics.duration.avgMs}ms`}
                      </div>
                      <div className="text-[11px] text-gray-500 pt-1">
                        P50: {metrics.duration.p50Ms}ms • P95: {metrics.duration.p95Ms}ms
                      </div>
                    </div>

                    {/* Queue Latency & Wait */}
                    <div className="p-4 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-1">
                      <div className="flex items-center justify-between text-gray-400 text-xs">
                        <span>Queue Wait Time</span>
                        <Layers className="h-4 w-4 text-amber-400" />
                      </div>
                      <div className="text-2xl font-bold text-white tracking-tight">
                        {metrics.queue.avgWaitMs >= 1000
                          ? `${(metrics.queue.avgWaitMs / 1000).toFixed(2)}s`
                          : `${metrics.queue.avgWaitMs}ms`}
                      </div>
                      <div className="text-[11px] text-gray-500 pt-1">
                        Backlog: <span className="text-amber-400 font-semibold">{metrics.queue.currentBacklog}</span> waiting
                      </div>
                    </div>
                  </div>

                  {/* Volume Over Time Chart */}
                  <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Execution Volume & Health Trend</h3>
                        <p className="text-xs text-gray-400">Total executions, successes, and failures per interval.</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Success
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Failed
                        </span>
                      </div>
                    </div>

                    {/* Simple Responsive SVG Chart */}
                    {metrics.volumeOverTime.length === 0 ? (
                      <div className="py-12 text-center text-xs text-gray-500">
                        No execution events recorded during this timeframe.
                      </div>
                    ) : (
                      <div className="h-44 w-full flex items-end gap-1.5 pt-4">
                        {metrics.volumeOverTime.map((bucket: VolumeBucket, idx: number) => {
                          const heightPct = Math.max(8, (bucket.total / maxVolume) * 100);
                          const successPct = bucket.total > 0 ? (bucket.success / bucket.total) * 100 : 0;
                          const failedPct = bucket.total > 0 ? (bucket.failed / bucket.total) * 100 : 0;

                          const labelDate = new Date(bucket.bucket);
                          const timeStr =
                            timeRange === '1h' || timeRange === '24h'
                              ? labelDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : labelDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

                          return (
                            <div
                              key={idx}
                              className="group relative flex-1 h-full flex flex-col justify-end items-center"
                            >
                              {/* Hover Tooltip */}
                              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-[#0f0f1a] border border-[#2e2e46] rounded-md px-2.5 py-1.5 text-[11px] text-gray-200 shadow-xl z-20 pointer-events-none whitespace-nowrap">
                                <span className="font-semibold text-white">{timeStr}</span>
                                <span>Total: {bucket.total}</span>
                                <span className="text-emerald-400">Success: {bucket.success}</span>
                                <span className="text-rose-400">Failed: {bucket.failed}</span>
                              </div>

                              {/* Stacked bar */}
                              <div
                                style={{ height: `${heightPct}%` }}
                                className="w-full max-w-[28px] rounded-t flex flex-col-reverse overflow-hidden bg-[#242438] transition-all hover:brightness-125"
                              >
                                {successPct > 0 && (
                                  <div style={{ height: `${successPct}%` }} className="w-full bg-emerald-500" />
                                )}
                                {failedPct > 0 && (
                                  <div style={{ height: `${failedPct}%` }} className="w-full bg-rose-500" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Node Failure Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-3">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Flame className="h-4 w-4 text-amber-400" />
                        Node Failure Rates
                      </h3>
                      <p className="text-xs text-gray-400">Failure frequencies categorized by node integration type.</p>

                      {metrics.nodeFailures.length === 0 ? (
                        <div className="py-8 text-center text-xs text-gray-500">
                          No node failures recorded in this period.
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-1">
                          {metrics.nodeFailures.slice(0, 6).map((nf) => (
                            <div key={nf.nodeType} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-mono text-gray-300">{nf.nodeType}</span>
                                <span className="text-gray-400 text-[11px]">
                                  {nf.failedExecutions} / {nf.totalExecutions} ({nf.failureRate}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-[#141422] overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(100, nf.failureRate)}%` }}
                                  className={cn(
                                    'h-full rounded-full',
                                    nf.failureRate > 25 ? 'bg-rose-500' : 'bg-amber-500'
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Retries & Execution Health */}
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-3">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-cyan-400" />
                        Retry Policies & Reliability
                      </h3>
                      <p className="text-xs text-gray-400">Automatic recovery and retry behavior across failures.</p>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-3 bg-[#141422] rounded-lg border border-[#242438]">
                          <div className="text-xs text-gray-400">Total Retries</div>
                          <div className="text-xl font-bold text-white pt-1">{metrics.retries.totalRetries}</div>
                        </div>
                        <div className="p-3 bg-[#141422] rounded-lg border border-[#242438]">
                          <div className="text-xs text-gray-400">Retried Workflows</div>
                          <div className="text-xl font-bold text-cyan-400 pt-1">
                            {metrics.retries.executionsWithRetries} ({metrics.retries.retryRate}%)
                          </div>
                        </div>
                        <div className="p-3 bg-[#141422] rounded-lg border border-[#242438]">
                          <div className="text-xs text-gray-400">Max Observed Latency</div>
                          <div className="text-xl font-bold text-white pt-1">
                            {metrics.duration.maxMs >= 1000
                              ? `${(metrics.duration.maxMs / 1000).toFixed(1)}s`
                              : `${metrics.duration.maxMs}ms`}
                          </div>
                        </div>
                        <div className="p-3 bg-[#141422] rounded-lg border border-[#242438]">
                          <div className="text-xs text-gray-400">Interrupted Crashes</div>
                          <div className="text-xl font-bold text-amber-400 pt-1">
                            {metrics.counts.interrupted}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Recent Failures */}
              {activeTab === 'failures' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Recent Execution Failures</h3>
                      <p className="text-xs text-gray-400">Inspecting reasons and root causes of execution aborts.</p>
                    </div>
                  </div>

                  {metrics.recentFailures.length === 0 ? (
                    <div className="py-16 text-center bg-[#1a1a2e] border border-[#252538] rounded-xl text-xs text-gray-400 space-y-2">
                      <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto" />
                      <p className="font-semibold text-gray-300">Zero Failures Recorded</p>
                      <p className="text-gray-500">All workflow runs within the selected window succeeded or were cleanly handled.</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#252538] bg-[#1a1a2e] overflow-hidden">
                      <table className="w-full text-left text-xs text-gray-300">
                        <thead className="bg-[#141422] text-gray-400 uppercase text-[10px] tracking-wider border-b border-[#252538]">
                          <tr>
                            <th className="py-2.5 px-4">Workflow</th>
                            <th className="py-2.5 px-4">Trigger</th>
                            <th className="py-2.5 px-4">Error Message</th>
                            <th className="py-2.5 px-4">Duration</th>
                            <th className="py-2.5 px-4">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242438]">
                          {metrics.recentFailures.map((fail) => (
                            <tr key={fail.id} className="hover:bg-[#202034] transition-colors">
                              <td className="py-3 px-4 font-medium text-white max-w-[180px] truncate">
                                {fail.workflowName}
                              </td>
                              <td className="py-3 px-4 capitalize font-mono text-[11px] text-gray-400">
                                {fail.triggerType}
                              </td>
                              <td className="py-3 px-4 text-rose-300 max-w-[320px] truncate" title={fail.errorMessage || ''}>
                                {fail.errorMessage || 'Unknown execution error'}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                                {fail.durationMs !== null ? `${fail.durationMs}ms` : '—'}
                              </td>
                              <td className="py-3 px-4 text-gray-400 text-[11px]">
                                {new Date(fail.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Infrastructure & Health */}
              {activeTab === 'health' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Database Probe */}
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <Database className="h-4 w-4 text-indigo-400" />
                          PostgreSQL Connection Pool
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-semibold uppercase',
                            health?.database.status === 'connected'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          )}
                        >
                          {health?.database.status || 'Checking'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Primary Supabase PostgreSQL database latency: <span className="font-semibold text-white">{health?.database.latencyMs}ms</span>
                      </p>
                    </div>

                    {/* Durable Queue Worker */}
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <Server className="h-4 w-4 text-emerald-400" />
                          Durable Queue Worker
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {health?.worker.status || 'Active'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        ID: <span className="font-mono text-gray-200">{health?.worker.workerId}</span> • Concurrency: <span className="font-semibold text-white">{health?.worker.activeJobs} / {health?.worker.maxConcurrency}</span>
                      </p>
                    </div>

                    {/* Queue Status */}
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-amber-400" />
                          Execution Queue Status
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {health?.queue.status || 'Healthy'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Pending Jobs: <span className="font-semibold text-white">{health?.queue.queuedCount}</span> • Currently Processing: <span className="font-semibold text-white">{health?.queue.runningCount}</span>
                      </p>
                    </div>

                    {/* Scheduler Status */}
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-teal-400" />
                          Cron Workflow Scheduler
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {health?.scheduler.status || 'Running'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Cron evaluation frequency: every <span className="font-semibold text-white">{(health?.scheduler.pollIntervalMs || 10000) / 1000}s</span>
                      </p>
                    </div>
                  </div>

                  {/* Long running executions */}
                  {metrics.longRunningExecutions.length > 0 && (
                    <div className="p-5 rounded-xl bg-[#1a1a2e] border border-[#252538] space-y-3">
                      <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <AlertTriangle className="h-4 w-4" />
                        In-Flight Long Running Workflows (&gt;30s)
                      </h4>
                      <div className="divide-y divide-[#252538]">
                        {metrics.longRunningExecutions.map((job) => (
                          <div key={job.id} className="py-2.5 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-medium text-white">{job.workflowName}</div>
                              <div className="text-[11px] text-gray-500 font-mono">
                                ID: {job.id} • Started: {new Date(job.startedAt).toLocaleTimeString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-amber-400 font-semibold">
                                {(job.runningDurationMs / 1000).toFixed(0)}s
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
