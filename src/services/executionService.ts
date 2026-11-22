import { supabase } from '@/lib/supabase';
import { redactSensitiveData } from '@flowforge/shared';
import type { TimelineEvent } from '@flowforge/workflow-core';
import type { NodeExecutionRecord } from '@flowforge/node-sdk';
import type { SavedWorkflow } from '@/store/persistence';
import { isUUID, generateUUID } from '@/services/cloudWorkflowService';

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowVersionId?: string | null;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'waiting';
  triggerType: string;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface NodeExecutionItem {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel?: string | null;
  status: string;
  inputPayload?: unknown;
  outputPayload?: unknown;
  errorMessage?: string | null;
  durationMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ExecutionEventItem {
  id: number;
  executionId: string;
  nodeId?: string | null;
  eventType: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FullExecutionDetails {
  execution: ExecutionSummary;
  definitionSnapshot?: SavedWorkflow | null;
  nodeExecutions: NodeExecutionItem[];
  events: ExecutionEventItem[];
}

export const executionService = {
  /**
   * Create an initial execution record when workflow run begins.
   */
  async startExecution(params: {
    executionId?: string;
    workflowId: string;
    workflowVersionId?: string | null;
    triggerType?: string;
    workflowDefinition: SavedWorkflow;
    triggerPayload?: Record<string, unknown>;
  }): Promise<{ data: string | null; error: string | null }> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // If workflowId is not a cloud UUID, execution cannot be persisted to PostgreSQL
      if (!isUUID(params.workflowId)) {
        return { data: null, error: 'Local workflow: skipped cloud execution record' };
      }

      const execId = params.executionId && isUUID(params.executionId)
        ? params.executionId
        : generateUUID();

      const safeDefinition = redactSensitiveData(params.workflowDefinition);
      const safeTrigger = params.triggerPayload
        ? redactSensitiveData(params.triggerPayload)
        : undefined;

      const { data, error } = await supabase
        .from('executions')
        .insert({
          id: execId,
          workflow_id: params.workflowId,
          workflow_version_id: params.workflowVersionId && isUUID(params.workflowVersionId)
            ? params.workflowVersionId
            : null,
          status: 'running',
          trigger_type: params.triggerType || 'manual',
          input_payload: {
            definition: safeDefinition,
            triggerPayload: safeTrigger,
          },
          started_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (error || !data) {
        return { data: null, error: error?.message || 'Failed to start execution record' };
      }

      // Persist workflow_started event
      await this.persistExecutionEvent({
        executionId: execId,
        eventType: 'workflow_started',
        message: `Workflow "${params.workflowDefinition.name}" started execution.`,
        metadata: {
          nodeCount: params.workflowDefinition.nodes.length,
          edgeCount: params.workflowDefinition.edges.length,
          triggerType: params.triggerType || 'manual',
        },
      });

      return { data: data.id, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Execution persistence error' };
    }
  },

  /**
   * Finalize execution record when workflow run finishes.
   */
  async finishExecution(params: {
    executionId: string;
    status: 'success' | 'failed' | 'cancelled';
    outputPayload?: Record<string, unknown>;
    errorMessage?: string | null;
    completedAt?: number;
    startedAt?: number;
  }): Promise<{ error: string | null }> {
    try {
      if (!isUUID(params.executionId)) return { error: null };

      const safeOutputs = params.outputPayload ? redactSensitiveData(params.outputPayload) : null;
      const finishedIso = params.completedAt
        ? new Date(params.completedAt).toISOString()
        : new Date().toISOString();

      const { error } = await supabase
        .from('executions')
        .update({
          status: params.status,
          output_payload: safeOutputs,
          error_message: params.errorMessage ?? null,
          finished_at: finishedIso,
        })
        .eq('id', params.executionId);

      if (error) {
        return { error: error.message };
      }

      // Persist workflow terminal event
      const eventType = params.status === 'success'
        ? 'workflow_completed'
        : params.status === 'cancelled'
        ? 'workflow_cancelled'
        : 'workflow_failed';

      await this.persistExecutionEvent({
        executionId: params.executionId,
        eventType,
        message: params.errorMessage
          ? `Workflow execution ${params.status}: ${params.errorMessage}`
          : `Workflow execution finished with status "${params.status}".`,
        metadata: {
          status: params.status,
          durationMs: params.startedAt && params.completedAt ? params.completedAt - params.startedAt : null,
        },
      });

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to finalize execution record' };
    }
  },

  /**
   * Persist a batch of node execution records.
   */
  async persistNodeExecutions(
    executionId: string,
    nodeRecords: Record<string, NodeExecutionRecord>
  ): Promise<{ error: string | null }> {
    try {
      if (!isUUID(executionId)) return { error: null };

      const rows = Object.values(nodeRecords).map((rec) => {
        const startedIso = rec.startedAt ? new Date(rec.startedAt).toISOString() : null;
        const finishedIso = rec.completedAt ? new Date(rec.completedAt).toISOString() : null;

        return {
          id: generateUUID(),
          execution_id: executionId,
          node_id: rec.nodeId,
          node_type: rec.nodeType,
          node_label: rec.nodeLabel || null,
          status: rec.state,
          input_payload: rec.inputData ? redactSensitiveData(rec.inputData) : null,
          output_payload: rec.outputData ? redactSensitiveData(rec.outputData) : null,
          error_message: rec.error ?? null,
          duration_ms: rec.durationMs ?? null,
          started_at: startedIso,
          finished_at: finishedIso,
        };
      });

      if (rows.length === 0) return { error: null };

      const { error } = await supabase
        .from('node_executions')
        .upsert(rows, { onConflict: 'execution_id,node_id' });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to persist node execution records' };
    }
  },

  /**
   * Persist a single high-value execution event to the timeline.
   */
  async persistExecutionEvent(params: {
    executionId: string;
    nodeId?: string | null;
    eventType: string;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ error: string | null }> {
    try {
      if (!isUUID(params.executionId)) return { error: null };

      const safeMetadata = params.metadata ? redactSensitiveData(params.metadata) : null;

      const { error } = await supabase.from('execution_events').insert({
        execution_id: params.executionId,
        node_id: params.nodeId ?? null,
        event_type: params.eventType,
        message: params.message ?? null,
        metadata: safeMetadata as Record<string, unknown> | null,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to record event' };
    }
  },

  /**
   * Persist a batch of timeline events (from engine run result).
   */
  async persistTimelineEvents(
    executionId: string,
    events: TimelineEvent[]
  ): Promise<{ error: string | null }> {
    try {
      if (!isUUID(executionId) || events.length === 0) return { error: null };

      // Filter and map high-value state transition events
      const rows = events.map((ev) => ({
        execution_id: executionId,
        node_id: ev.nodeId ?? null,
        event_type: ev.type,
        message: ev.message,
        metadata: ev.details ? (redactSensitiveData(ev.details) as Record<string, unknown>) : null,
        created_at: new Date(ev.timestamp).toISOString(),
      }));

      const { error } = await supabase.from('execution_events').insert(rows);

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to batch persist events' };
    }
  },

  /**
   * List executions for a specific workflow, sorted newest first.
   */
  async listWorkflowExecutions(
    workflowId: string,
    options?: { limit?: number; status?: string }
  ): Promise<{ data: ExecutionSummary[] | null; error: string | null }> {
    try {
      if (!isUUID(workflowId)) {
        return { data: [], error: null };
      }

      let query = supabase
        .from('executions')
        .select('id, workflow_id, workflow_version_id, status, trigger_type, error_message, started_at, finished_at, created_by, created_at')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false });

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      } else {
        query = query.limit(50);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: error.message };
      }

      const summaries: ExecutionSummary[] = (data || []).map((row) => {
        let durationMs: number | null = null;
        if (row.started_at && row.finished_at) {
          durationMs = new Date(row.finished_at).getTime() - new Date(row.started_at).getTime();
        }

        return {
          id: row.id,
          workflowId: row.workflow_id,
          workflowVersionId: row.workflow_version_id,
          status: row.status as ExecutionSummary['status'],
          triggerType: row.trigger_type,
          errorMessage: row.error_message,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          durationMs,
          createdBy: row.created_by,
          createdAt: row.created_at,
        };
      });

      return { data: summaries, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to list executions' };
    }
  },

  /**
   * Get full details for a single execution: summary, node-level runs, and event timeline.
   */
  async getExecutionDetails(executionId: string): Promise<{ data: FullExecutionDetails | null; error: string | null }> {
    try {
      if (!isUUID(executionId)) {
        return { data: null, error: 'Invalid execution ID' };
      }

      // 1. Fetch execution row
      const { data: execData, error: execError } = await supabase
        .from('executions')
        .select('*')
        .eq('id', executionId)
        .single();

      if (execError || !execData) {
        return { data: null, error: execError?.message || 'Execution not found' };
      }

      // 2. Fetch node executions
      const { data: nodeData, error: nodeError } = await supabase
        .from('node_executions')
        .select('*')
        .eq('execution_id', executionId)
        .order('started_at', { ascending: true });

      if (nodeError) {
        return { data: null, error: nodeError.message };
      }

      // 3. Fetch execution events
      const { data: eventData, error: eventError } = await supabase
        .from('execution_events')
        .select('*')
        .eq('execution_id', executionId)
        .order('id', { ascending: true });

      if (eventError) {
        return { data: null, error: eventError.message };
      }

      let durationMs: number | null = null;
      if (execData.started_at && execData.finished_at) {
        durationMs = new Date(execData.finished_at).getTime() - new Date(execData.started_at).getTime();
      }

      const summary: ExecutionSummary = {
        id: execData.id,
        workflowId: execData.workflow_id,
        workflowVersionId: execData.workflow_version_id,
        status: execData.status as ExecutionSummary['status'],
        triggerType: execData.trigger_type,
        errorMessage: execData.error_message,
        startedAt: execData.started_at,
        finishedAt: execData.finished_at,
        durationMs,
        createdBy: execData.created_by,
        createdAt: execData.created_at,
      };

      const definitionSnapshot = execData.input_payload && typeof execData.input_payload === 'object' && 'definition' in execData.input_payload
        ? (execData.input_payload as { definition: SavedWorkflow }).definition
        : null;

      const nodeExecutions: NodeExecutionItem[] = (nodeData || []).map((n) => ({
        id: n.id,
        executionId: n.execution_id,
        nodeId: n.node_id,
        nodeType: n.node_type,
        nodeLabel: n.node_label,
        status: n.status,
        inputPayload: n.input_payload,
        outputPayload: n.output_payload,
        errorMessage: n.error_message,
        durationMs: n.duration_ms ? Number(n.duration_ms) : null,
        startedAt: n.started_at,
        finishedAt: n.finished_at,
      }));

      const events: ExecutionEventItem[] = (eventData || []).map((e) => ({
        id: e.id,
        executionId: e.execution_id,
        nodeId: e.node_id,
        eventType: e.event_type,
        message: e.message,
        metadata: e.metadata as Record<string, unknown> | null,
        createdAt: e.created_at,
      }));

      return {
        data: {
          execution: summary,
          definitionSnapshot,
          nodeExecutions,
          events,
        },
        error: null,
      };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : 'Failed to retrieve execution details' };
    }
  },
};
