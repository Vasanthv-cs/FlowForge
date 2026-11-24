import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../supabase.ts';
import { redactSensitiveData } from '@flowforge/shared';
import { WorkflowEngine } from '@flowforge/workflow-core';
import type { WorkflowRunResult, TimelineEvent } from '@flowforge/workflow-core';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';
import { serverNodeRegistry } from '../engine/serverRegistry.ts';
import {
  assertValidTransition,
  normalizeExecutionStatus,
  type DurableExecutionStatus,
} from '../engine/executionStateMachine.ts';
import {
  isErrorRetryable,
  calculateBackoffDelay,
} from '../engine/retryPolicy.ts';

export interface WorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  leaseDurationSeconds?: number;
  heartbeatIntervalMs?: number;
  maxConcurrency?: number;
  maxPerWorkspaceConcurrency?: number;
}

export interface ActiveWorkerJob {
  executionId: string;
  workspaceId: string;
  workflowId: string;
  abortController: AbortController;
  startedAt: number;
}

export class DurableWorkerService {
  public readonly workerId: string;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public readonly pollIntervalMs: number;
  public readonly leaseDurationSeconds: number;
  public readonly heartbeatIntervalMs: number;
  public readonly maxConcurrency: number;
  public readonly maxPerWorkspaceConcurrency: number;

  private activeJobs = new Map<string, ActiveWorkerJob>();

  constructor(options: WorkerOptions = {}) {
    this.workerId = options.workerId || `worker-${randomUUID().slice(0, 8)}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.leaseDurationSeconds = options.leaseDurationSeconds ?? 30;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.maxConcurrency = options.maxConcurrency ?? 10;
    this.maxPerWorkspaceConcurrency = options.maxPerWorkspaceConcurrency ?? 5;
  }

  public getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  public getActiveCountForWorkspace(workspaceId: string): number {
    let count = 0;
    for (const job of this.activeJobs.values()) {
      if (job.workspaceId === workspaceId) {
        count++;
      }
    }
    return count;
  }

  public isWorkerRunning(): boolean {
    return this.isRunning;
  }

  public getStatus(): {
    workerId: string;
    isRunning: boolean;
    activeJobs: number;
    maxConcurrency: number;
    maxPerWorkspaceConcurrency: number;
    pollIntervalMs: number;
    heartbeatIntervalMs: number;
  } {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      activeJobs: this.getActiveJobCount(),
      maxConcurrency: this.maxConcurrency,
      maxPerWorkspaceConcurrency: this.maxPerWorkspaceConcurrency,
      pollIntervalMs: this.pollIntervalMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    };
  }

  /**
   * Starts background worker loop: job claiming, heartbeat, and lease recovery.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run recovery on start to claim/requeue abandoned leases from previous crashes
    await this.recoverStaleLeases();

    // Start polling loop
    this.scheduleNextPoll(100);

    // Start periodic heartbeat timer
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeats();
    }, this.heartbeatIntervalMs);
  }

  /**
   * Graceful worker shutdown. Stops claiming and gives running jobs a grace period to complete.
   */
  public async stop(gracePeriodMs = 3000): Promise<void> {
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.activeJobs.size === 0) return;

    // Wait for in-flight jobs within grace period
    const startWait = Date.now();
    while (this.activeJobs.size > 0 && Date.now() - startWait < gracePeriodMs) {
      await new Promise((r) => setTimeout(r, 100));
    }

    // Abort any remaining jobs that did not finish in time
    for (const job of this.activeJobs.values()) {
      job.abortController.abort(new Error(`Worker ${this.workerId} shutting down`));
    }
    this.activeJobs.clear();
  }

  private scheduleNextPoll(delayMs = this.pollIntervalMs): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAndProcessNextJob();
      } catch (err) {
        console.warn(`[DurableWorker ${this.workerId}] Error in poll cycle:`, err);
      } finally {
        if (this.isRunning) {
          this.scheduleNextPoll();
        }
      }
    }, delayMs);
  }

  /**
   * Claims and executes the next available queued job.
   */
  public async pollAndProcessNextJob(): Promise<boolean> {
    if (!this.isRunning || this.activeJobs.size >= this.maxConcurrency) {
      return false;
    }

    const supabase = getSupabaseAdminClient();
    const claimedJob = await this.claimNextJob(supabase);
    if (!claimedJob) return false;

    // Concurrency limit per workspace
    if (this.getActiveCountForWorkspace(claimedJob.workspaceId) >= this.maxPerWorkspaceConcurrency) {
      // Revert status to queued to let other workers or later cycles pick it up
      await supabase
        .from('executions')
        .update({
          status: 'queued',
          worker_id: null,
          lease_expires_at: null,
          available_at: new Date(Date.now() + 1000).toISOString(),
        })
        .eq('id', claimedJob.executionId);
      return false;
    }

    const abortController = new AbortController();
    this.activeJobs.set(claimedJob.executionId, {
      executionId: claimedJob.executionId,
      workspaceId: claimedJob.workspaceId,
      workflowId: claimedJob.workflowId,
      abortController,
      startedAt: Date.now(),
    });

    // Execute job asynchronously
    void this.executeJob(claimedJob, abortController);
    return true;
  }

  /**
   * Atomically claims a queued execution job with database locking / update.
   */
  public async claimNextJob(supabase: SupabaseClient): Promise<{
    executionId: string;
    workflowId: string;
    workspaceId: string;
    definition: { nodes: unknown[]; edges: unknown[]; name?: string };
    triggerPayload?: Record<string, unknown>;
    retryCount: number;
    maxRetries: number;
  } | null> {
    const nowIso = new Date().toISOString();
    const leaseExpiresIso = new Date(Date.now() + this.leaseDurationSeconds * 1000).toISOString();

    // 1. Find the oldest eligible queued execution
    const { data: candidates, error: findError } = await supabase
      .from('executions')
      .select('id, workflow_id, input_payload, retry_count, max_retries, workflows!inner(workspace_id, name)')
      .eq('status', 'queued')
      .eq('cancellation_requested', false)
      .lte('available_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(1);

    if (findError || !candidates || candidates.length === 0) {
      return null;
    }

    const candidate = candidates[0];
    const wfInfo = candidate.workflows as unknown as { workspace_id: string; name?: string };

    // 2. Atomic claim update: ensure only one worker claims it
    const { data: updated, error: claimError } = await supabase
      .from('executions')
      .update({
        status: 'running',
        worker_id: this.workerId,
        started_at: nowIso,
        last_heartbeat_at: nowIso,
        lease_expires_at: leaseExpiresIso,
      })
      .eq('id', candidate.id)
      .eq('status', 'queued') // Optimistic lock guard
      .select('id')
      .maybeSingle();

    if (claimError || !updated) {
      // Race condition: another worker claimed it first
      return null;
    }

    const inputPayload = (candidate.input_payload || {}) as {
      definition?: { nodes: unknown[]; edges: unknown[]; name?: string };
      triggerPayload?: Record<string, unknown>;
    };

    return {
      executionId: candidate.id,
      workflowId: candidate.workflow_id,
      workspaceId: wfInfo.workspace_id,
      definition: inputPayload.definition || { nodes: [], edges: [] },
      triggerPayload: inputPayload.triggerPayload,
      retryCount: candidate.retry_count ?? 0,
      maxRetries: candidate.max_retries ?? 3,
    };
  }

  /**
   * Heartbeat monitor: extends lease on all actively running jobs for this worker.
   */
  public async sendHeartbeats(): Promise<void> {
    if (this.activeJobs.size === 0) return;

    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const newLeaseIso = new Date(Date.now() + this.leaseDurationSeconds * 1000).toISOString();

    const jobIds = Array.from(this.activeJobs.keys());
    await supabase
      .from('executions')
      .update({
        last_heartbeat_at: nowIso,
        lease_expires_at: newLeaseIso,
      })
      .in('id', jobIds)
      .eq('worker_id', this.workerId)
      .eq('status', 'running');
  }

  /**
   * Scans for stale/abandoned leases (e.g. from crashed or killed workers) and recovers them.
   */
  public async recoverStaleLeases(): Promise<{ recoveredCount: number; interruptedCount: number }> {
    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    // Query running executions whose lease has expired
    const { data: staleJobs, error } = await supabase
      .from('executions')
      .select('id, workflow_id, retry_count, max_retries, cancellation_requested')
      .eq('status', 'running')
      .lt('lease_expires_at', nowIso);

    if (error || !staleJobs || staleJobs.length === 0) {
      return { recoveredCount: 0, interruptedCount: 0 };
    }

    let recoveredCount = 0;
    let interruptedCount = 0;

    for (const job of staleJobs) {
      // If cancellation was requested while abandoned, mark cancelled
      if (job.cancellation_requested) {
        await supabase
          .from('executions')
          .update({
            status: 'cancelled',
            error_message: 'Execution cancelled after lease expiration',
            finished_at: nowIso,
          })
          .eq('id', job.id);
        continue;
      }

      const retryCount = job.retry_count ?? 0;
      const maxRetries = job.max_retries ?? 3;

      if (retryCount < maxRetries) {
        // Re-queue execution with incremented retry count and short delay
        await supabase
          .from('executions')
          .update({
            status: 'queued',
            worker_id: null,
            lease_expires_at: null,
            retry_count: retryCount + 1,
            available_at: new Date(Date.now() + 2000).toISOString(),
          })
          .eq('id', job.id);

        await supabase.from('execution_events').insert({
          execution_id: job.id,
          event_type: 'execution_requeued_after_worker_lease_expired',
          message: `Worker lease expired. Execution automatically re-queued (attempt ${retryCount + 1}/${maxRetries}).`,
        });

        recoveredCount++;
      } else {
        // Exhausted retries: mark as interrupted
        await supabase
          .from('executions')
          .update({
            status: 'interrupted',
            error_message: 'Execution abandoned: worker lease expired and retry limit reached.',
            finished_at: nowIso,
          })
          .eq('id', job.id);

        await supabase.from('execution_events').insert({
          execution_id: job.id,
          event_type: 'execution_interrupted',
          message: 'Execution marked interrupted: worker lease expired and maximum retries exhausted.',
        });

        interruptedCount++;
      }
    }

    return { recoveredCount, interruptedCount };
  }

  /**
   * Executes a claimed job with DAG topological runner, retry policies, and cancellation checking.
   */
  public async executeJob(
    job: {
      executionId: string;
      workflowId: string;
      workspaceId: string;
      definition: { nodes: unknown[]; edges: unknown[]; name?: string };
      triggerPayload?: Record<string, unknown>;
      retryCount: number;
      maxRetries: number;
    },
    abortController: AbortController
  ): Promise<WorkflowRunResult> {
    const supabase = getSupabaseAdminClient();
    const startTime = Date.now();
    const { executionId, definition, triggerPayload: _triggerPayload } = job;

    let runResult: WorkflowRunResult;
    let finalStatus: DurableExecutionStatus;
    let errorMessage: string | null = null;

    try {
      // 1. Initial cancellation check before running
      const { data: currentExec } = await supabase
        .from('executions')
        .select('cancellation_requested, status')
        .eq('id', executionId)
        .maybeSingle();

      if (currentExec?.cancellation_requested || currentExec?.status === 'cancelled') {
        abortController.abort(new Error('Execution cancelled before starting'));
        throw new Error('Execution cancelled by user request');
      }

      // 2. Log workflow started event
      await supabase.from('execution_events').insert({
        execution_id: executionId,
        event_type: 'workflow_started',
        message: `Worker ${this.workerId} executing workflow (ID: ${executionId}).`,
        metadata: { workerId: this.workerId, attempt: job.retryCount + 1 },
      });

      // 3. Execute DAG with Core Engine
      const engine = new WorkflowEngine(serverNodeRegistry);
      runResult = await engine.executeWorkflow(
        executionId,
        definition.nodes as never,
        definition.edges as never,
        {
          workspaceId: job.workspaceId,
          maxConcurrency: 4,
          timeoutMs: 60000,
          overrideTriggerPayload: _triggerPayload,
          onTimelineEvent: (event: TimelineEvent) => {
            void Promise.resolve(
              supabase
                .from('execution_events')
                .insert({
                  execution_id: executionId,
                  node_id: event.nodeId || null,
                  event_type: event.type,
                  message: event.message,
                  metadata: event.details ? redactSensitiveData(event.details) : null,
                })
            ).catch(() => {});
          },
        },
        serverNodeRegistry
      );

      finalStatus = runResult.success ? 'success' : 'failed';
      if (!runResult.success) {
        const failedNode = Object.values(runResult.nodeRecords).find((r) => r.state === 'failed');
        errorMessage = failedNode?.error || 'One or more nodes failed during execution';
      }
    } catch (err: unknown) {
      const isAborted = abortController.signal.aborted;
      finalStatus = isAborted ? 'cancelled' : 'failed';
      errorMessage = err instanceof Error ? err.message : 'Execution runtime error';

      runResult = {
        executionId,
        success: false,
        startedAt: startTime,
        completedAt: Date.now(),
        durationMs: Date.now() - startTime,
        nodesExecuted: 0,
        nodeRecords: {},
        timeline: [],
        finalOutputs: {},
        error: errorMessage,
      };
    } finally {
      this.activeJobs.delete(executionId);
    }

    // 4. Check for late cancellation request to prevent overwriting cancelled state
    const { data: latestState } = await supabase
      .from('executions')
      .select('status, cancellation_requested')
      .eq('id', executionId)
      .maybeSingle();

    if (latestState?.cancellation_requested || latestState?.status === 'cancelled') {
      finalStatus = 'cancelled';
      errorMessage = 'Execution cancelled by user request';
    }

    // Assert valid state transition
    const prevStatus = normalizeExecutionStatus(latestState?.status || 'running');
    assertValidTransition(prevStatus, finalStatus, executionId);

    // 5. Check if execution failure qualifies for retry
    if (finalStatus === 'failed' && job.retryCount < job.maxRetries) {
      const failedNode = Object.values(runResult.nodeRecords).find((r) => r.state === 'failed');
      const shouldRetry = isErrorRetryable(failedNode?.error || errorMessage, failedNode?.nodeType);

      if (shouldRetry) {
        const backoffDelay = calculateBackoffDelay(job.retryCount + 2);
        const nextAvailableIso = new Date(Date.now() + backoffDelay).toISOString();

        await supabase
          .from('executions')
          .update({
            status: 'queued',
            worker_id: null,
            lease_expires_at: null,
            retry_count: job.retryCount + 1,
            available_at: nextAvailableIso,
            error_message: `Transient failure: ${errorMessage}. Scheduled retry in ${backoffDelay}ms.`,
          })
          .eq('id', executionId);

        await supabase.from('execution_events').insert({
          execution_id: executionId,
          event_type: 'execution_retry_scheduled',
          message: `Execution failed with retryable error. Re-queued for attempt ${job.retryCount + 2}/${job.maxRetries} after ${backoffDelay}ms delay.`,
          metadata: { delayMs: backoffDelay, error: errorMessage },
        });

        return runResult;
      }
    }

    // 6. Finalize execution record in database
    const completedAt = Date.now();
    const durationMs = completedAt - startTime;

    // Persist node execution records
    try {
      const nodeRows = Object.values(runResult.nodeRecords).map((rec: NodeExecutionRecord) => ({
        id: randomUUID(),
        execution_id: executionId,
        node_id: rec.nodeId,
        node_type: rec.nodeType,
        node_label: rec.nodeLabel || null,
        status: rec.state,
        input_payload: rec.inputData ? redactSensitiveData(rec.inputData) : null,
        output_payload: rec.outputData ? redactSensitiveData(rec.outputData) : null,
        error_message: rec.error || null,
        duration_ms: rec.durationMs || null,
        started_at: rec.startedAt ? new Date(rec.startedAt).toISOString() : null,
        finished_at: rec.completedAt ? new Date(rec.completedAt).toISOString() : null,
      }));

      if (nodeRows.length > 0) {
        await supabase
          .from('node_executions')
          .upsert(nodeRows, { onConflict: 'execution_id,node_id' });
      }
    } catch (nodeErr) {
      console.warn('[DurableWorker] Failed to persist node executions:', nodeErr);
    }

    // Finalize execution row
    await supabase
      .from('executions')
      .update({
        status: finalStatus,
        error_message: errorMessage,
        output_payload: {
          success: finalStatus === 'success',
          durationMs,
          nodesExecuted: runResult.nodesExecuted,
        },
        finished_at: new Date(completedAt).toISOString(),
        lease_expires_at: null,
      })
      .eq('id', executionId);

    // Terminal timeline event
    await supabase.from('execution_events').insert({
      execution_id: executionId,
      event_type:
        finalStatus === 'success'
          ? 'workflow_completed'
          : finalStatus === 'cancelled'
          ? 'workflow_cancelled'
          : 'workflow_failed',
      message: errorMessage
        ? `Workflow execution ${finalStatus}: ${errorMessage}`
        : `Workflow execution finished with status "${finalStatus}".`,
      metadata: {
        status: finalStatus,
        durationMs,
        workerId: this.workerId,
      },
    });

    return runResult;
  }

  /**
   * Signals cancellation of an active job on this worker.
   */
  public cancelActiveJob(executionId: string, reason = 'Cancelled by user'): boolean {
    const job = this.activeJobs.get(executionId);
    if (!job) return false;

    job.abortController.abort(new Error(reason));
    this.activeJobs.delete(executionId);
    return true;
  }
}

export const durableWorker = new DurableWorkerService();
