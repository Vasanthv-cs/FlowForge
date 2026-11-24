import { supabase } from '@/lib/supabase';
import type { ScheduleRow, ScheduleType, MissedRunPolicy } from '@flowforge/workflow-schema';

export interface ClientCreateScheduleInput {
  workflowId: string;
  name: string;
  scheduleType: ScheduleType;
  cronExpression?: string;
  oneTimeRunAt?: string;
  timezone?: string;
  missedRunPolicy?: MissedRunPolicy;
}

export const scheduleClientService = {
  /**
   * Helper to execute API requests with Supabase JWT bearer token
   */
  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    return fetch(url, { ...options, headers });
  },

  async listSchedules(workspaceId: string, workflowId?: string): Promise<ScheduleRow[]> {
    const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to list schedules');
    }
    const data = await res.json();
    return data.schedules || [];
  },

  async createSchedule(workspaceId: string, input: ClientCreateScheduleInput): Promise<ScheduleRow> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create schedule');
    }
    const data = await res.json();
    return data.schedule;
  },

  async pauseSchedule(workspaceId: string, scheduleId: string): Promise<ScheduleRow> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules/${scheduleId}/pause`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to pause schedule');
    }
    const data = await res.json();
    return data.schedule;
  },

  async resumeSchedule(workspaceId: string, scheduleId: string): Promise<ScheduleRow> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules/${scheduleId}/resume`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to resume schedule');
    }
    const data = await res.json();
    return data.schedule;
  },

  async deleteSchedule(workspaceId: string, scheduleId: string): Promise<void> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules/${scheduleId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete schedule');
    }
  },

  async getScheduleExecutions(workspaceId: string, scheduleId: string): Promise<Array<{
    id: string;
    status: string;
    started_at?: string;
    finished_at?: string;
    error_message?: string;
    scheduled_for?: string;
    created_at: string;
  }>> {
    const res = await this.fetchWithAuth(`/api/workspaces/${workspaceId}/schedules/${scheduleId}/executions`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch schedule executions');
    }
    const data = await res.json();
    return data.executions || [];
  },
};
