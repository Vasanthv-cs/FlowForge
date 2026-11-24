import { getSupabaseAdminClient } from '../supabase.ts';

export type MetricsTimeRange = '1h' | '24h' | '7d' | '30d';

export interface DurationMetrics {
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
}

export interface NodeFailureStat {
  nodeType: string;
  totalExecutions: number;
  failedExecutions: number;
  failureRate: number; // Percentage 0 - 100
}

export interface VolumeBucket {
  bucket: string; // ISO timestamp for the start of the bucket
  total: number;
  success: number;
  failed: number;
  cancelled: number;
}

export interface RecentFailureItem {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  createdAt: string;
}

export interface LongRunningExecutionItem {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  workerId: string | null;
  startedAt: string;
  runningDurationMs: number;
  retryCount: number;
}

export interface ExecutionMetricsSummary {
  workspaceId: string;
  timeRange: MetricsTimeRange;
  generatedAt: string;
  counts: {
    total: number;
    success: number;
    failed: number;
    cancelled: number;
    interrupted: number;
    queued: number;
    running: number;
  };
  rates: {
    successRate: number; // 0 - 100%
    failureRate: number; // 0 - 100%
    cancellationRate: number; // 0 - 100%
  };
  duration: DurationMetrics;
  queue: {
    avgWaitMs: number;
    p90WaitMs: number;
    currentBacklog: number;
    currentlyRunning: number;
  };
  retries: {
    totalRetries: number;
    executionsWithRetries: number;
    retryRate: number; // Percentage of executions that experienced retries
  };
  nodeFailures: NodeFailureStat[];
  volumeOverTime: VolumeBucket[];
  recentFailures: RecentFailureItem[];
  longRunningExecutions: LongRunningExecutionItem[];
}

/**
 * Calculates a specific percentile from a collection of numeric values.
 * Returns 0 if values array is empty.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return Math.round(sorted[clampedIndex]);
}

/**
 * Resolves cutoff date for a given timeRange string.
 */
export function getTimeRangeCutoff(timeRange: MetricsTimeRange): Date {
  const now = Date.now();
  switch (timeRange) {
    case '1h':
      return new Date(now - 60 * 60 * 1000);
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
}

export class MetricsService {
  /**
   * Computes comprehensive, workspace-scoped execution metrics and failure breakdowns.
   */
  async getWorkspaceMetrics(
    workspaceId: string,
    options: {
      timeRange?: MetricsTimeRange;
      workflowId?: string;
    } = {}
  ): Promise<ExecutionMetricsSummary> {
    const timeRange = options.timeRange || '24h';
    const cutoffDate = getTimeRangeCutoff(timeRange);
    const cutoffIso = cutoffDate.toISOString();
    const supabase = getSupabaseAdminClient();

    // 1. Fetch all executions in range for workflows belonging to this workspace
    let query = supabase
      .from('executions')
      .select(`
        id,
        workflow_id,
        status,
        trigger_type,
        started_at,
        finished_at,
        created_at,
        error_message,
        retry_count,
        worker_id,
        workflows!inner(workspace_id, name)
      `)
      .eq('workflows.workspace_id', workspaceId)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false });

    if (options.workflowId) {
      query = query.eq('workflow_id', options.workflowId);
    }

    const { data: rawRows, error } = await query;
    if (error) {
      throw new Error(`Failed to query executions for metrics: ${error.message}`);
    }

    const rows = (rawRows || []) as unknown as Array<{
      id: string;
      workflow_id: string;
      status: string;
      trigger_type: string | null;
      started_at: string | null;
      finished_at: string | null;
      created_at: string;
      error_message: string | null;
      retry_count: number | null;
      worker_id: string | null;
      workflows: { workspace_id: string; name: string } | Array<{ workspace_id: string; name: string }> | null;
    }>;

    // 2. Count statuses and calculate durations
    let successCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let interruptedCount = 0;
    let queuedCount = 0;
    let runningCount = 0;

    let totalRetries = 0;
    let executionsWithRetries = 0;

    const durationsMs: number[] = [];
    const queueWaitTimesMs: number[] = [];
    const recentFailures: RecentFailureItem[] = [];
    const longRunning: LongRunningExecutionItem[] = [];

    const nowTime = Date.now();
    const LONG_RUNNING_THRESHOLD_MS = 30000; // 30 seconds

    for (const row of rows) {
      const status = row.status;
      if (status === 'success') successCount++;
      else if (status === 'failed') failedCount++;
      else if (status === 'cancelled') cancelledCount++;
      else if (status === 'interrupted') interruptedCount++;
      else if (status === 'queued') queuedCount++;
      else if (status === 'running') runningCount++;

      // Retries
      const retries = row.retry_count ?? 0;
      totalRetries += retries;
      if (retries > 0) executionsWithRetries++;

      // Duration: only valid for completed executions with valid start & end
      if (row.started_at && row.finished_at && (status === 'success' || status === 'failed')) {
        const start = new Date(row.started_at).getTime();
        const end = new Date(row.finished_at).getTime();
        if (end >= start) {
          durationsMs.push(end - start);
        }
      }

      // Queue wait time: time between created_at and started_at
      if (row.started_at && row.created_at) {
        const created = new Date(row.created_at).getTime();
        const started = new Date(row.started_at).getTime();
        if (started >= created) {
          queueWaitTimesMs.push(started - created);
        }
      }

      // Workflow Name extraction helper
      const wfObj = Array.isArray(row.workflows) ? row.workflows[0] : row.workflows;
      const wfName = wfObj?.name || 'Untitled Workflow';

      // Collect recent failures (up to 15)
      if (status === 'failed' && recentFailures.length < 15) {
        const duration =
          row.started_at && row.finished_at
            ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime())
            : null;

        recentFailures.push({
          id: row.id,
          workflowId: row.workflow_id,
          workflowName: wfName,
          triggerType: row.trigger_type || 'manual',
          errorMessage: row.error_message,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          durationMs: duration,
          retryCount: retries,
          createdAt: row.created_at,
        });
      }

      // Long running detections
      if (status === 'running' && row.started_at) {
        const startedMs = new Date(row.started_at).getTime();
        const elapsed = nowTime - startedMs;
        if (elapsed > LONG_RUNNING_THRESHOLD_MS) {
          longRunning.push({
            id: row.id,
            workflowId: row.workflow_id,
            workflowName: wfName,
            triggerType: row.trigger_type || 'manual',
            workerId: row.worker_id,
            startedAt: row.started_at,
            runningDurationMs: elapsed,
            retryCount: retries,
          });
        }
      }
    }

    const total = rows.length;

    // Rates
    const successRate = total > 0 ? Number(((successCount / total) * 100).toFixed(1)) : 0;
    const failureRate = total > 0 ? Number(((failedCount / total) * 100).toFixed(1)) : 0;
    const cancellationRate = total > 0 ? Number(((cancelledCount / total) * 100).toFixed(1)) : 0;
    const retryRate = total > 0 ? Number(((executionsWithRetries / total) * 100).toFixed(1)) : 0;

    // Duration stats
    const avgDuration =
      durationsMs.length > 0
        ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
        : 0;
    const minDuration = durationsMs.length > 0 ? Math.min(...durationsMs) : 0;
    const maxDuration = durationsMs.length > 0 ? Math.max(...durationsMs) : 0;
    const p50Duration = calculatePercentile(durationsMs, 50);
    const p90Duration = calculatePercentile(durationsMs, 90);
    const p95Duration = calculatePercentile(durationsMs, 95);

    // Queue wait stats
    const avgWait =
      queueWaitTimesMs.length > 0
        ? Math.round(queueWaitTimesMs.reduce((a, b) => a + b, 0) / queueWaitTimesMs.length)
        : 0;
    const p90Wait = calculatePercentile(queueWaitTimesMs, 90);

    // 3. Bucket execution volume over time
    const volumeOverTime = this.computeVolumeBuckets(rows, timeRange, cutoffDate);

    // 4. Node failure statistics (derived from node_executions)
    const nodeFailures = await this.computeNodeFailureStats(rows.map((r) => r.id));

    return {
      workspaceId,
      timeRange,
      generatedAt: new Date().toISOString(),
      counts: {
        total,
        success: successCount,
        failed: failedCount,
        cancelled: cancelledCount,
        interrupted: interruptedCount,
        queued: queuedCount,
        running: runningCount,
      },
      rates: {
        successRate,
        failureRate,
        cancellationRate,
      },
      duration: {
        avgMs: avgDuration,
        minMs: minDuration,
        maxMs: maxDuration,
        p50Ms: p50Duration,
        p90Ms: p90Duration,
        p95Ms: p95Duration,
      },
      queue: {
        avgWaitMs: avgWait,
        p90WaitMs: p90Wait,
        currentBacklog: queuedCount,
        currentlyRunning: runningCount,
      },
      retries: {
        totalRetries,
        executionsWithRetries,
        retryRate,
      },
      nodeFailures,
      volumeOverTime,
      recentFailures,
      longRunningExecutions: longRunning,
    };
  }

  /**
   * Groups execution events into consistent time buckets for time-series charts.
   */
  private computeVolumeBuckets(
    rows: Array<{ created_at: string; status: string }>,
    timeRange: MetricsTimeRange,
    cutoffDate: Date
  ): VolumeBucket[] {
    const bucketMap = new Map<string, { total: number; success: number; failed: number; cancelled: number }>();
    const isHourly = timeRange === '1h' || timeRange === '24h';
    const intervalMs = isHourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 hour or 1 day

    // Initialize buckets from cutoff until now so graph has no gaps
    const now = Date.now();
    let currentMs = isHourly
      ? Math.floor(cutoffDate.getTime() / intervalMs) * intervalMs
      : Math.floor(cutoffDate.getTime() / intervalMs) * intervalMs;

    while (currentMs <= now) {
      const key = new Date(currentMs).toISOString();
      bucketMap.set(key, { total: 0, success: 0, failed: 0, cancelled: 0 });
      currentMs += intervalMs;
    }

    // Assign executions into nearest lower bucket
    for (const row of rows) {
      const time = new Date(row.created_at).getTime();
      const bucketTime = Math.floor(time / intervalMs) * intervalMs;
      const key = new Date(bucketTime).toISOString();

      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = { total: 0, success: 0, failed: 0, cancelled: 0 };
        bucketMap.set(key, bucket);
      }

      bucket.total++;
      if (row.status === 'success') bucket.success++;
      else if (row.status === 'failed') bucket.failed++;
      else if (row.status === 'cancelled') bucket.cancelled++;
    }

    return Array.from(bucketMap.entries())
      .map(([bucket, data]) => ({
        bucket,
        total: data.total,
        success: data.success,
        failed: data.failed,
        cancelled: data.cancelled,
      }))
      .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());
  }

  /**
   * Aggregates node-level execution statistics and failure rates across execution IDs.
   */
  private async computeNodeFailureStats(executionIds: string[]): Promise<NodeFailureStat[]> {
    if (executionIds.length === 0) return [];

    const supabase = getSupabaseAdminClient();
    // Query in batches if large, or limit to top 200 executions for performance
    const targetIds = executionIds.slice(0, 150);

    const { data, error } = await supabase
      .from('node_executions')
      .select('node_type, status')
      .in('execution_id', targetIds);

    if (error || !data) return [];

    const statsMap = new Map<string, { total: number; failed: number }>();
    for (const row of data as Array<{ node_type: string; status: string }>) {
      const type = row.node_type || 'unknown';
      let entry = statsMap.get(type);
      if (!entry) {
        entry = { total: 0, failed: 0 };
        statsMap.set(type, entry);
      }
      entry.total++;
      if (row.status === 'failed') {
        entry.failed++;
      }
    }

    return Array.from(statsMap.entries())
      .map(([nodeType, stat]) => ({
        nodeType,
        totalExecutions: stat.total,
        failedExecutions: stat.failed,
        failureRate: stat.total > 0 ? Number(((stat.failed / stat.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.failedExecutions - a.failedExecutions || b.totalExecutions - a.totalExecutions);
  }
}

export const metricsService = new MetricsService();
