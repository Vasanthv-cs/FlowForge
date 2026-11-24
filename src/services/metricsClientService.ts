import { supabase } from '@/lib/supabase';
import type {
  ExecutionMetricsSummary,
  MetricsTimeRange,
} from '@/server/services/metricsService';

export interface SystemHealthSummary {
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number;
  };
  worker: {
    status: 'available' | 'idle' | 'stopped';
    workerId: string;
    activeJobs: number;
    maxConcurrency: number;
    maxPerWorkspaceConcurrency: number;
  };
  queue: {
    status: 'healthy' | 'congested' | 'degraded';
    queuedCount: number;
    runningCount: number;
  };
  scheduler: {
    status: 'running' | 'stopped';
    isPolling: boolean;
    pollIntervalMs: number;
  };
  timestamp: string;
}

export class MetricsClientService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Fetches aggregated execution metrics and failure breakdowns for a workspace.
   */
  async getMetrics(
    workspaceId: string,
    options: { timeRange?: MetricsTimeRange; workflowId?: string } = {}
  ): Promise<{ data: ExecutionMetricsSummary | null; error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams();
      if (options.timeRange) params.append('timeRange', options.timeRange);
      if (options.workflowId) params.append('workflowId', options.workflowId);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${this.apiUrl}/api/workspaces/${workspaceId}/metrics${qs}`, {
        method: 'GET',
        headers,
      });

      const body = await res.json();
      if (!res.ok) {
        return { data: null, error: body.message || `Failed to fetch metrics (${res.status})` };
      }

      return { data: body.metrics, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Network error while fetching metrics',
      };
    }
  }

  /**
   * Fetches operational health status (database, worker, queue, scheduler).
   */
  async getSystemHealth(
    workspaceId: string
  ): Promise<{ data: SystemHealthSummary | null; error: string | null }> {
    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch(`${this.apiUrl}/api/workspaces/${workspaceId}/metrics/health`, {
        method: 'GET',
        headers,
      });

      const body = await res.json();
      if (!res.ok) {
        return { data: null, error: body.message || `Failed to fetch health (${res.status})` };
      }

      return { data: body.health, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: err instanceof Error ? err.message : 'Network error while fetching health',
      };
    }
  }
}

export const metricsClientService = new MetricsClientService();
