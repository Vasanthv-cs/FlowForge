import { WorkflowEngine } from '@flowforge/workflow-core';
import type { WorkflowRunResult, TimelineEvent } from '@flowforge/workflow-core';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';
import { analyzeWorkflowGraph } from '@flowforge/workflow-core';
import { serverNodeRegistry } from '../engine/serverRegistry.ts';
import { getSupabaseAdminClient } from '../supabase.ts';
import { redactSensitiveData } from '@flowforge/shared';
import { randomUUID } from 'node:crypto';

export interface ExecuteWorkflowParams {
  workspaceId: string;
  workflowId: string;
  versionId?: string;
  triggerPayload?: Record<string, unknown>;
  userId?: string;
}

export interface ActiveExecutionRecord {
  executionId: string;
  workspaceId: string;
  workflowId: string;
  abortController: AbortController;
  startedAt: number;
}

export class ExecutionEngineService {
  private activeExecutions = new Map<string, ActiveExecutionRecord>();
  public readonly MAX_CONCURRENT_PER_WORKSPACE = 5;
  public readonly MAX_WORKFLOW_TIMEOUT_MS = 60000; // 60s total runtime

  /**
   * Returns current count of running executions in a workspace.
   */
  public getActiveCount(workspaceId: string): number {
    let count = 0;
    for (const record of this.activeExecutions.values()) {
      if (record.workspaceId === workspaceId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Prepares and initiates server-side execution of a saved cloud workflow.
   * Enforces definition validation, execution concurrency limits, and database snapshotting.
   */
  public async startWorkflowExecution(params: {
    workspaceId: string;
    workflowId: string;
    versionId?: string;
    triggerPayload?: Record<string, unknown>;
    userId?: string;
    waitForCompletion?: boolean;
  }): Promise<{
    executionId: string;
    status: 'running' | 'success' | 'failed';
    startedAt: string;
    result?: WorkflowRunResult;
  }> {
    const { workspaceId, workflowId, versionId, triggerPayload, userId, waitForCompletion } = params;

    // 1. Enforce Concurrency Limits
    const currentActive = this.getActiveCount(workspaceId);
    if (currentActive >= this.MAX_CONCURRENT_PER_WORKSPACE) {
      const err = new Error(
        `Workspace execution limit reached: maximum of ${this.MAX_CONCURRENT_PER_WORKSPACE} concurrent executions allowed.`
      );
      (err as { statusCode?: number }).statusCode = 429;
      throw err;
    }

    const supabase = getSupabaseAdminClient();

    // 2. Fetch authoritative workflow definition from database
    let definition: { nodes: unknown[]; edges: unknown[]; name?: string };
    let workflowName = 'Cloud Workflow';

    if (versionId) {
      const { data: versionData, error: versionError } = await supabase
        .from('workflow_versions')
        .select('id, definition, workflows!inner(workspace_id, name)')
        .eq('id', versionId)
        .eq('workflow_id', workflowId)
        .eq('workflows.workspace_id', workspaceId)
        .maybeSingle();

      if (versionError || !versionData) {
        const err = new Error('Specified workflow version was not found in this workspace.');
        (err as { statusCode?: number }).statusCode = 404;
        throw err;
      }

      definition = versionData.definition as { nodes: unknown[]; edges: unknown[]; name?: string };
      const wf = versionData.workflows as unknown as { name?: string };
      if (wf?.name) workflowName = wf.name;
    } else {
      const { data: workflowData, error: workflowError } = await supabase
        .from('workflows')
        .select('id, name, definition, workspace_id')
        .eq('id', workflowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (workflowError || !workflowData) {
        const err = new Error('Workflow not found in this workspace.');
        (err as { statusCode?: number }).statusCode = 404;
        throw err;
      }

      definition = (workflowData.definition || {}) as { nodes: unknown[]; edges: unknown[]; name?: string };
      workflowName = workflowData.name;
    }

    // 3. Validate workflow graph structure
    const rawNodes = definition?.nodes;
    const rawEdges = definition?.edges;

    if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
      const err = new Error('Corrupted workflow definition: nodes and edges must be arrays.');
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    // Static DAG analysis using core engine
    const analysis = analyzeWorkflowGraph(rawNodes as never, rawEdges as never);
    if (!analysis.isValid) {
      const err = new Error(`Workflow graph validation failed: ${analysis.errors.join(' | ')}`);
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    // 4. Generate Execution ID and Record in Database
    const executionId = randomUUID();
    const startTimeIso = new Date().toISOString();
    const abortController = new AbortController();

    this.activeExecutions.set(executionId, {
      executionId,
      workspaceId,
      workflowId,
      abortController,
      startedAt: Date.now(),
    });

    const safeSnapshot = redactSensitiveData({
      id: workflowId,
      name: workflowName,
      nodes: rawNodes,
      edges: rawEdges,
    });
    const safeTriggerPayload = triggerPayload ? redactSensitiveData(triggerPayload) : undefined;

    // Database persistence: initial execution record
    try {
      const { error: insertError } = await supabase.from('executions').insert({
        id: executionId,
        workflow_id: workflowId,
        workflow_version_id: versionId || null,
        status: 'running',
        trigger_type: 'manual',
        input_payload: {
          definition: safeSnapshot,
          triggerPayload: safeTriggerPayload,
        },
        started_at: startTimeIso,
        created_by: userId || null,
      });

      if (insertError) {
        this.activeExecutions.delete(executionId);
        throw new Error(`Failed to create execution record in database: ${insertError.message}`);
      }

      // Persist workflow_started event
      await supabase.from('execution_events').insert({
        execution_id: executionId,
        event_type: 'workflow_started',
        message: `Workflow "${workflowName}" initiated on server (ID: ${executionId}).`,
        metadata: {
          nodeCount: rawNodes.length,
          edgeCount: rawEdges.length,
          versionId: versionId || null,
        },
      });
    } catch (persistErr) {
      this.activeExecutions.delete(executionId);
      throw persistErr;
    }

    // 5. Run Execution
    const runPromise = this.executeCoreEngine(
      executionId,
      rawNodes,
      rawEdges,
      abortController,
      triggerPayload
    );

    if (waitForCompletion) {
      const result = await runPromise;
      return {
        executionId,
        status: result.success ? 'success' : 'failed',
        startedAt: startTimeIso,
        result,
      };
    }

    // Non-blocking async execution in background
    runPromise.catch((err) => {
      console.error(`[ExecutionEngine] Unhandled error in execution ${executionId}:`, err);
    });

    return {
      executionId,
      status: 'running',
      startedAt: startTimeIso,
    };
  }

  /**
   * Core execution runner: executes DAG, handles timeline events, and finalizes database records.
   */
  private async executeCoreEngine(
    executionId: string,
    nodes: unknown[],
    edges: unknown[],
    abortController: AbortController,
    _triggerPayload?: Record<string, unknown>
  ): Promise<WorkflowRunResult> {
    const supabase = getSupabaseAdminClient();
    const engine = new WorkflowEngine(serverNodeRegistry);
    const startTime = Date.now();

    let runResult: WorkflowRunResult;
    let finalStatus: 'success' | 'failed' | 'cancelled';
    let errorMessage: string | null = null;

    try {
      runResult = await engine.executeWorkflow(
        executionId,
        nodes as never,
        edges as never,
        {
          maxConcurrency: 4,
          timeoutMs: this.MAX_WORKFLOW_TIMEOUT_MS,
          onTimelineEvent: (event: TimelineEvent) => {
            // Stream timeline event to database
            Promise.resolve(
              supabase
                .from('execution_events')
                .insert({
                  execution_id: executionId,
                  node_id: event.nodeId || null,
                  event_type: event.type,
                  message: event.message,
                  metadata: event.details ? redactSensitiveData(event.details) : null,
                })
            ).catch((err: unknown) => console.warn('[ExecutionEngine] Failed to persist event:', err));
          },
        },
        serverNodeRegistry
      );

      finalStatus = runResult.success ? 'success' : 'failed';
      if (!runResult.success) {
        // Collect first node error if present
        const failedNode = Object.values(runResult.nodeRecords).find((r) => r.state === 'failed');
        errorMessage = failedNode?.error || 'One or more nodes failed during execution';
      }
    } catch (err: unknown) {
      finalStatus = abortController.signal.aborted ? 'cancelled' : 'failed';
      errorMessage = err instanceof Error ? err.message : 'Workflow execution runtime error';

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
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startTime;

    // 6. Persist Granular Node Executions
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
    } catch (nodePersistErr) {
      console.warn('[ExecutionEngine] Failed to persist node execution rows:', nodePersistErr);
    }

    // 7. Finalize Execution Row
    try {
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
        })
        .eq('id', executionId);

      // Terminal event
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
          nodesExecuted: runResult.nodesExecuted,
        },
      });
    } catch (finalizeErr) {
      console.warn('[ExecutionEngine] Failed to finalize execution status:', finalizeErr);
    }

    return runResult;
  }

  /**
   * Safely cancels an active execution.
   */
  public async cancelExecution(
    workspaceId: string,
    executionId: string
  ): Promise<{ success: boolean; message: string }> {
    const active = this.activeExecutions.get(executionId);

    if (active) {
      if (active.workspaceId !== workspaceId) {
        const err = new Error('Execution does not belong to this workspace.');
        (err as { statusCode?: number }).statusCode = 404;
        throw err;
      }

      active.abortController.abort(new Error('Workflow execution cancelled by user request.'));
      this.activeExecutions.delete(executionId);
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('executions')
      .update({
        status: 'cancelled',
        error_message: 'Execution cancelled by user request',
        finished_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    if (error) {
      throw new Error(`Failed to update execution status to cancelled: ${error.message}`);
    }

    await supabase.from('execution_events').insert({
      execution_id: executionId,
      event_type: 'workflow_cancelled',
      message: 'Workflow execution cancelled by user request.',
      metadata: { cancelledAt: new Date().toISOString() },
    });

    return { success: true, message: 'Workflow execution cancelled successfully.' };
  }

  /**
   * Reconciles stale executions left in 'running' or 'queued' state across server process restarts.
   * Marks them as failed with an interrupted error message and logs an execution_interrupted event.
   */
  public async reconcileStaleExecutions(): Promise<{ reconciledCount: number }> {
    try {
      const supabase = getSupabaseAdminClient();
      const { data: stale, error } = await supabase
        .from('executions')
        .select('id, workflow_id')
        .in('status', ['running', 'queued']);

      if (error) {
        console.warn('[ExecutionEngine] Failed to query stale executions on startup:', error.message);
        return { reconciledCount: 0 };
      }

      if (!stale || stale.length === 0) {
        return { reconciledCount: 0 };
      }

      const staleIds = stale.map((r) => r.id);
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('executions')
        .update({
          status: 'failed',
          error_message: 'Execution interrupted: server process restarted while running',
          finished_at: now,
        })
        .in('id', staleIds);

      if (updateError) {
        console.warn('[ExecutionEngine] Failed to update stale executions:', updateError.message);
        return { reconciledCount: 0 };
      }

      const events = staleIds.map((id) => ({
        execution_id: id,
        event_type: 'execution_interrupted',
        message: 'Execution was interrupted by a server restart or crash.',
        metadata: { reconciledAt: now },
      }));

      try {
        await supabase.from('execution_events').insert(events);
      } catch (evErr) {
        console.warn('[ExecutionEngine] Failed to write interruption events:', evErr);
      }

      return { reconciledCount: staleIds.length };
    } catch (err) {
      console.warn('[ExecutionEngine] Stale execution reconciliation error:', err);
      return { reconciledCount: 0 };
    }
  }

  /**
   * Aborts all in-flight active executions tracked by this service instance.
   * Invoked during graceful server shutdown (SIGINT / SIGTERM).
   */
  public abortAllActive(reason = 'Server process shutting down'): void {
    for (const record of this.activeExecutions.values()) {
      record.abortController.abort(new Error(reason));
    }
    this.activeExecutions.clear();
  }
}

export const executionEngineService = new ExecutionEngineService();
