import { getSupabaseAdminClient } from '../supabase.ts';
import { redactSensitiveData } from '@flowforge/shared';

export interface WorkflowListItem {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDetail extends WorkflowListItem {
  definition: Record<string, unknown>;
}

export interface ExecutionListItem {
  id: string;
  workflowId: string;
  workspaceId: string;
  status: string;
  triggerType: string;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ExecutionDetail extends ExecutionListItem {
  inputPayload: unknown;
  outputPayload: unknown;
  nodeExecutions: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    nodeLabel: string | null;
    status: string;
    durationMs: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    inputPayload: unknown;
    outputPayload: unknown;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    level: string;
    message: string;
    details: unknown;
    createdAt: string;
  }>;
}

interface DbExecutionRow {
  id: string;
  workflow_id: string;
  workspace_id?: string;
  status: string;
  trigger_type?: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at?: string;
  input_payload?: unknown;
  output_payload?: unknown;
  workflows?: { workspace_id?: string } | null;
}

export class WorkspaceService {
  /**
   * List workflows strictly scoped to the specified workspaceId.
   */
  async listWorkflows(workspaceId: string): Promise<WorkflowListItem[]> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('workflows')
      .select('id, workspace_id, name, description, is_active, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list workflows: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Retrieve a workflow by ID, strictly enforcing that it belongs to the given workspace.
   * If the workflow belongs to another workspace, returns null to prevent data leakage.
   */
  async getWorkflow(workspaceId: string, workflowId: string): Promise<WorkflowDetail | null> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('workflows')
      .select('id, workspace_id, name, description, is_active, definition, created_at, updated_at')
      .eq('id', workflowId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch workflow: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      name: data.name,
      description: data.description,
      isActive: Boolean(data.is_active),
      definition: (data.definition || {}) as Record<string, unknown>,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * List executions scoped to a workspace.
   */
  async listExecutions(
    workspaceId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ): Promise<ExecutionListItem[]> {
    const supabase = getSupabaseAdminClient();
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = options?.offset ?? 0;

    let query = supabase
      .from('executions')
      .select('id, workflow_id, status, trigger_type, started_at, finished_at, error_message, created_at, workflows!inner(workspace_id)')
      .eq('workflows.workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list executions: ${error.message}`);
    }

    return ((data || []) as unknown as DbExecutionRow[]).map((row) => {
      const durationMs =
        row.started_at && row.finished_at
          ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime())
          : null;

      return {
        id: row.id,
        workflowId: row.workflow_id,
        workspaceId: row.workflows?.workspace_id || row.workspace_id || workspaceId,
        status: row.status,
        triggerType: row.trigger_type || 'manual',
        durationMs,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        errorMessage: row.error_message,
        createdAt: row.created_at || '',
      };
    });
  }

  /**
   * Retrieve execution details, verifying workspace ownership and redacting any sensitive data.
   */
  async getExecution(workspaceId: string, executionId: string): Promise<ExecutionDetail | null> {
    const supabase = getSupabaseAdminClient();

    // 1. Fetch execution row and verify workspace isolation
    const { data: execData, error: execError } = await supabase
      .from('executions')
      .select('id, workflow_id, status, trigger_type, started_at, finished_at, error_message, input_payload, output_payload, created_at, workflows!inner(workspace_id)')
      .eq('id', executionId)
      .eq('workflows.workspace_id', workspaceId)
      .maybeSingle();

    if (execError) {
      throw new Error(`Failed to fetch execution: ${execError.message}`);
    }

    if (!execData) {
      return null;
    }

    const exec = execData as unknown as DbExecutionRow;
    const durationMs =
      exec.started_at && exec.finished_at
        ? Math.max(0, new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime())
        : null;

    // 2. Fetch associated node execution logs
    const { data: nodeData, error: nodeError } = await supabase
      .from('node_executions')
      .select('id, node_id, node_type, node_label, status, duration_ms, started_at, finished_at, error_message, input_payload, output_payload')
      .eq('execution_id', executionId)
      .order('started_at', { ascending: true });

    if (nodeError) {
      throw new Error(`Failed to fetch node executions: ${nodeError.message}`);
    }

    // 3. Fetch execution events
    const { data: eventsData, error: eventsError } = await supabase
      .from('execution_events')
      .select('id, event_type, level, message, details, created_at')
      .eq('execution_id', executionId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      throw new Error(`Failed to fetch execution events: ${eventsError.message}`);
    }

    return {
      id: exec.id,
      workflowId: exec.workflow_id,
      workspaceId: exec.workflows?.workspace_id || exec.workspace_id || workspaceId,
      status: exec.status,
      triggerType: exec.trigger_type || 'manual',
      durationMs,
      startedAt: exec.started_at,
      finishedAt: exec.finished_at,
      errorMessage: exec.error_message,
      inputPayload: redactSensitiveData(exec.input_payload),
      outputPayload: redactSensitiveData(exec.output_payload),
      createdAt: exec.created_at || new Date().toISOString(),
      nodeExecutions: (nodeData || []).map((n) => ({
        id: n.id,
        nodeId: n.node_id,
        nodeType: n.node_type,
        nodeLabel: n.node_label,
        status: n.status,
        durationMs: n.duration_ms,
        startedAt: n.started_at,
        finishedAt: n.finished_at,
        errorMessage: n.error_message,
        inputPayload: redactSensitiveData(n.input_payload),
        outputPayload: redactSensitiveData(n.output_payload),
      })),
      events: (eventsData || []).map((e) => ({
        id: e.id,
        eventType: e.event_type,
        level: e.level,
        message: e.message,
        details: redactSensitiveData(e.details),
        createdAt: e.created_at,
      })),
    };
  }

  /**
   * Lightweight execution status check for live polling.
   */
  async getExecutionStatus(
    workspaceId: string,
    executionId: string
  ): Promise<{
    id: string;
    workflowId: string;
    workspaceId: string;
    status: string;
    triggerType: string;
    durationMs: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
  } | null> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('executions')
      .select('id, workflow_id, status, trigger_type, started_at, finished_at, error_message, workflows!inner(workspace_id)')
      .eq('id', executionId)
      .eq('workflows.workspace_id', workspaceId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as unknown as DbExecutionRow;
    const durationMs =
      row.started_at && row.finished_at
        ? Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime())
        : null;

    return {
      id: row.id,
      workflowId: row.workflow_id,
      workspaceId: row.workflows?.workspace_id || workspaceId,
      status: row.status,
      triggerType: row.trigger_type || 'manual',
      durationMs,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      errorMessage: row.error_message,
    };
  }

  /**
   * Check database connectivity for readiness probes.
   */
  async checkDatabaseReadiness(): Promise<{ isReady: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const supabase = getSupabaseAdminClient();
      const { error } = await supabase.from('workspaces').select('id').limit(1);
      const latencyMs = Date.now() - start;

      if (error) {
        return { isReady: false, latencyMs, error: error.message };
      }
      return { isReady: true, latencyMs };
    } catch (err) {
      return {
        isReady: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown database error',
      };
    }
  }

  /**
   * Returns current count of queued and running executions across the database.
   */
  async getQueueMetrics(): Promise<{ queued: number; running: number }> {
    try {
      const supabase = getSupabaseAdminClient();
      const [queuedRes, runningRes] = await Promise.all([
        supabase.from('executions').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
        supabase.from('executions').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      ]);

      return {
        queued: queuedRes.count ?? 0,
        running: runningRes.count ?? 0,
      };
    } catch {
      return { queued: 0, running: 0 };
    }
  }
}

export const workspaceService = new WorkspaceService();
