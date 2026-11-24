import { getSupabaseAdminClient } from '../supabase';
import {
  isValidCronExpression,
  isValidTimezone,
  getNextCronRun,
  calculateNextRunAfterRecovery,
} from '../engine/cronParser';
import type { ScheduleRow, ScheduleType, MissedRunPolicy } from '@flowforge/workflow-schema';

export interface CreateScheduleInput {
  workflowId: string;
  name: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  oneTimeRunAt?: string;
  timezone?: string;
  missedRunPolicy?: MissedRunPolicy;
  userId?: string;
}

export interface UpdateScheduleInput {
  name?: string;
  scheduleType?: ScheduleType;
  cronExpression?: string;
  oneTimeRunAt?: string;
  timezone?: string;
  missedRunPolicy?: MissedRunPolicy;
}

export function mapScheduleRow(row: Record<string, unknown>): ScheduleRow {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id || row.workspaceId),
    workflowId: String(row.workflow_id || row.workflowId),
    name: String(row.name),
    scheduleType: (row.schedule_type || row.scheduleType) as ScheduleType,
    cronExpression: row.cron_expression !== undefined ? (row.cron_expression as string | null) : (row.cronExpression as string | null) ?? null,
    oneTimeRunAt: row.one_time_run_at !== undefined ? (row.one_time_run_at as string | null) : (row.oneTimeRunAt as string | null) ?? null,
    timezone: String(row.timezone || 'UTC'),
    status: (row.status || 'active') as 'active' | 'paused' | 'completed',
    missedRunPolicy: (row.missed_run_policy || row.missedRunPolicy || 'skip') as MissedRunPolicy,
    nextRunAt: row.next_run_at !== undefined ? (row.next_run_at as string | null) : (row.nextRunAt as string | null) ?? null,
    lastRunAt: row.last_run_at !== undefined ? (row.last_run_at as string | null) : (row.lastRunAt as string | null) ?? null,
    createdBy: row.created_by ? String(row.created_by) : (row.createdBy ? String(row.createdBy) : null),
    createdAt: String(row.created_at || row.createdAt),
    updatedAt: String(row.updated_at || row.updatedAt),
  };
}

export class ScheduleService {
  /**
   * Creates a new workflow schedule in the specified workspace.
   */
  async createSchedule(workspaceId: string, input: CreateScheduleInput): Promise<ScheduleRow> {
    const {
      workflowId,
      name,
      scheduleType,
      cronExpression,
      oneTimeRunAt,
      timezone = 'UTC',
      missedRunPolicy = 'skip',
      userId,
    } = input;

    if (!isValidTimezone(timezone)) {
      const err = new Error(`Invalid timezone identifier: "${timezone}". Must be a valid IANA timezone.`);
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    let calculatedNextRunAt: string;

    if (scheduleType === 'one_time') {
      if (!oneTimeRunAt) {
        const err = new Error('oneTimeRunAt timestamp is required for one-time schedules.');
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      const targetTime = new Date(oneTimeRunAt);
      if (isNaN(targetTime.getTime())) {
        const err = new Error('Invalid oneTimeRunAt date format. Must be an ISO timestamp.');
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      calculatedNextRunAt = targetTime.toISOString();
    } else {
      if (!cronExpression || !isValidCronExpression(cronExpression)) {
        const err = new Error(`Invalid cron expression: "${cronExpression || ''}". Must be 5 fields (min hour dom month dow).`);
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      calculatedNextRunAt = getNextCronRun(cronExpression, new Date(), timezone).toISOString();
    }

    const supabase = getSupabaseAdminClient();

    // Verify workflow exists and belongs to workspace
    const { data: workflow, error: wfError } = await supabase
      .from('workflows')
      .select('id, workspace_id')
      .eq('id', workflowId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (wfError || !workflow) {
      const err = new Error('Workflow not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const { data: schedule, error: insertError } = await supabase
      .from('schedules')
      .insert({
        workspace_id: workspaceId,
        workflow_id: workflowId,
        name: name.trim(),
        schedule_type: scheduleType,
        cron_expression: scheduleType === 'recurring' ? cronExpression : null,
        one_time_run_at: scheduleType === 'one_time' ? oneTimeRunAt : null,
        timezone,
        status: 'active',
        missed_run_policy: missedRunPolicy,
        next_run_at: calculatedNextRunAt,
        created_by: userId || null,
      })
      .select()
      .single();

    if (insertError || !schedule) {
      throw new Error(`Failed to create schedule: ${insertError?.message || 'Database insert error'}`);
    }

    return mapScheduleRow(schedule as Record<string, unknown>);
  }

  /**
   * Lists all schedules belonging strictly to a workspace.
   */
  async listSchedules(workspaceId: string, workflowId?: string): Promise<ScheduleRow[]> {
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('schedules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (workflowId) {
      query = query.eq('workflow_id', workflowId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list schedules: ${error.message}`);
    }

    return (data || []).map((row) => mapScheduleRow(row as Record<string, unknown>));
  }

  /**
   * Retrieves single schedule by ID ensuring workspace isolation.
   */
  async getSchedule(workspaceId: string, scheduleId: string): Promise<ScheduleRow | null> {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch schedule: ${error.message}`);
    }

    return data ? mapScheduleRow(data as Record<string, unknown>) : null;
  }

  /**
   * Updates an existing schedule and recalculates next_run_at.
   */
  async updateSchedule(
    workspaceId: string,
    scheduleId: string,
    input: UpdateScheduleInput
  ): Promise<ScheduleRow> {
    const existing = await this.getSchedule(workspaceId, scheduleId);
    if (!existing) {
      const err = new Error('Schedule not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const timezone = input.timezone ?? existing.timezone;
    if (!isValidTimezone(timezone)) {
      const err = new Error(`Invalid timezone identifier: "${timezone}".`);
      (err as { statusCode?: number }).statusCode = 400;
      throw err;
    }

    const scheduleType = input.scheduleType ?? existing.scheduleType;
    let nextRunAt: string;

    if (scheduleType === 'one_time') {
      const oneTime = input.oneTimeRunAt ?? existing.oneTimeRunAt;
      if (!oneTime) {
        const err = new Error('oneTimeRunAt timestamp is required for one-time schedules.');
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      nextRunAt = new Date(oneTime).toISOString();
    } else {
      const cron = input.cronExpression ?? existing.cronExpression;
      if (!cron || !isValidCronExpression(cron)) {
        const err = new Error(`Invalid cron expression: "${cron || ''}".`);
        (err as { statusCode?: number }).statusCode = 400;
        throw err;
      }
      nextRunAt = getNextCronRun(cron, new Date(), timezone).toISOString();
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .update({
        name: input.name ? input.name.trim() : existing.name,
        schedule_type: scheduleType,
        cron_expression: scheduleType === 'recurring' ? (input.cronExpression ?? existing.cronExpression) : null,
        one_time_run_at: scheduleType === 'one_time' ? (input.oneTimeRunAt ?? existing.oneTimeRunAt) : null,
        timezone,
        missed_run_policy: input.missedRunPolicy ?? existing.missedRunPolicy,
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update schedule: ${error?.message || 'Database update error'}`);
    }

    return mapScheduleRow(data as Record<string, unknown>);
  }

  /**
   * Pauses an active schedule.
   */
  async pauseSchedule(workspaceId: string, scheduleId: string): Promise<ScheduleRow> {
    const existing = await this.getSchedule(workspaceId, scheduleId);
    if (!existing) {
      const err = new Error('Schedule not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to pause schedule: ${error?.message || 'Database update error'}`);
    }

    return mapScheduleRow(data as Record<string, unknown>);
  }

  /**
   * Resumes a paused schedule and reconciles next_run_at using recovery policy.
   */
  async resumeSchedule(workspaceId: string, scheduleId: string): Promise<ScheduleRow> {
    const existing = await this.getSchedule(workspaceId, scheduleId);
    if (!existing) {
      const err = new Error('Schedule not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const recovery = calculateNextRunAfterRecovery({
      scheduleType: existing.scheduleType,
      cronExpression: existing.cronExpression,
      oneTimeRunAt: existing.oneTimeRunAt,
      timezone: existing.timezone,
      missedRunPolicy: existing.missedRunPolicy,
      currentNextRunAt: existing.nextRunAt || new Date().toISOString(),
      now: new Date(),
    });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .update({
        status: 'active',
        next_run_at: recovery.nextRunAt ? recovery.nextRunAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to resume schedule: ${error?.message || 'Database update error'}`);
    }

    return mapScheduleRow(data as Record<string, unknown>);
  }

  /**
   * Deletes a schedule.
   */
  async deleteSchedule(workspaceId: string, scheduleId: string): Promise<void> {
    const existing = await this.getSchedule(workspaceId, scheduleId);
    if (!existing) {
      const err = new Error('Schedule not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('workspace_id', workspaceId);

    if (error) {
      throw new Error(`Failed to delete schedule: ${error.message}`);
    }
  }

  /**
   * Fetches execution history triggered by this schedule.
   */
  async getScheduleExecutions(workspaceId: string, scheduleId: string): Promise<unknown[]> {
    const existing = await this.getSchedule(workspaceId, scheduleId);
    if (!existing) {
      const err = new Error('Schedule not found in this workspace.');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('executions')
      .select('id, status, started_at, finished_at, error_message, scheduled_for, created_at')
      .eq('schedule_id', scheduleId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to fetch schedule executions: ${error.message}`);
    }

    return data || [];
  }
}

export const scheduleService = new ScheduleService();
