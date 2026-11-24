import { getSupabaseAdminClient } from '../supabase';
import { executionEngineService } from './executionEngineService';
import {
  getNextCronRun,
  isValidCronExpression,
  calculateNextRunAfterRecovery,
} from '../engine/cronParser';
import { serverLogger } from '../logger';

export interface SchedulerServiceConfig {
  pollIntervalMs?: number; // Default 10 seconds
}

export class WorkflowSchedulerService {
  private pollIntervalMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isPolling = false;

  constructor(config: SchedulerServiceConfig = {}) {
    this.pollIntervalMs = config.pollIntervalMs || 10000;
  }

  /**
   * Starts the cron scheduler service polling loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    serverLogger.info({ intervalMs: this.pollIntervalMs }, 'WorkflowSchedulerService started');

    this.pollTimer = setInterval(() => {
      void this.pollDueSchedules();
    }, this.pollIntervalMs);

    // Initial tick
    void this.pollDueSchedules();
  }

  /**
   * Stops the scheduler service.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    serverLogger.info('WorkflowSchedulerService stopped');
  }

  public getStatus(): {
    isRunning: boolean;
    isPolling: boolean;
    pollIntervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      isPolling: this.isPolling,
      pollIntervalMs: this.pollIntervalMs,
    };
  }

  /**
   * Evaluates due schedules and dispatches workflow executions.
   */
  public async pollDueSchedules(): Promise<number> {
    if (this.isPolling) return 0;
    this.isPolling = true;

    let dispatchedCount = 0;
    const nowIso = new Date().toISOString();
    const supabase = getSupabaseAdminClient();

    try {
      // 1. Fetch due schedules from primary `schedules` table
      const { data: primarySchedules, error: primaryError } = await supabase
        .from('schedules')
        .select('*, workflows!inner(id, workspace_id, is_active, name)')
        .eq('status', 'active')
        .lte('next_run_at', nowIso)
        .order('next_run_at', { ascending: true })
        .limit(25);

      if (!primaryError && primarySchedules && primarySchedules.length > 0) {
        for (const schedule of primarySchedules) {
          const workflow = schedule.workflows as unknown as {
            id: string;
            workspace_id: string;
            is_active: boolean;
            name: string;
          };

          const recovery = calculateNextRunAfterRecovery({
            scheduleType: schedule.schedule_type,
            cronExpression: schedule.cron_expression,
            oneTimeRunAt: schedule.one_time_run_at,
            timezone: schedule.timezone,
            missedRunPolicy: schedule.missed_run_policy,
            currentNextRunAt: schedule.next_run_at,
            now: nowIso,
          });

          const newStatus = schedule.schedule_type === 'one_time' ? 'completed' : 'active';
          const nextRunAtIso = recovery.nextRunAt ? recovery.nextRunAt.toISOString() : null;

          // Atomic claim
          const { data: claimed, error: claimError } = await supabase
            .from('schedules')
            .update({
              last_run_at: nowIso,
              next_run_at: nextRunAtIso,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', schedule.id)
            .eq('status', 'active')
            .lte('next_run_at', nowIso)
            .select('id')
            .maybeSingle();

          if (claimError || !claimed) {
            continue; // Claim collision; another worker won the lock
          }

          if (workflow.is_active === false) {
            serverLogger.info(
              { workflowId: workflow.id, scheduleId: schedule.id, name: workflow.name },
              'Skipped scheduled execution for inactive workflow'
            );
            continue;
          }

          if (recovery.shouldExecuteNow) {
            try {
              await executionEngineService.startWorkflowExecution({
                workspaceId: schedule.workspace_id,
                workflowId: schedule.workflow_id,
                triggerType: 'schedule',
                scheduleId: schedule.id,
                scheduledFor: recovery.scheduledOccurrence,
                triggerPayload: {
                  scheduleId: schedule.id,
                  scheduleName: schedule.name,
                  scheduledTime: recovery.scheduledOccurrence,
                  cron: schedule.cron_expression,
                  timezone: schedule.timezone,
                  timestamp: Date.now(),
                },
                waitForCompletion: false,
              });

              dispatchedCount++;
              serverLogger.info(
                {
                  scheduleId: schedule.id,
                  workflowId: schedule.workflow_id,
                  scheduledOccurrence: recovery.scheduledOccurrence,
                },
                'Dispatched scheduled workflow execution'
              );
            } catch (execErr) {
              serverLogger.error(
                { scheduleId: schedule.id, error: execErr },
                'Failed to dispatch scheduled execution'
              );
            }
          }
        }
      }

      // 2. Backward compatibility: also poll canvas `workflow_schedules`
      const { data: dueCanvasSchedules, error: canvasError } = await supabase
        .from('workflow_schedules')
        .select('*, workflows!inner(id, workspace_id, is_active, name)')
        .eq('enabled', true)
        .lte('next_run_at', nowIso)
        .order('next_run_at', { ascending: true })
        .limit(20);

      if (!canvasError && dueCanvasSchedules && dueCanvasSchedules.length > 0) {
        for (const schedule of dueCanvasSchedules) {
          const workflow = schedule.workflows as unknown as {
            id: string;
            workspace_id: string;
            is_active: boolean;
            name: string;
          };

          let nextRunDate: Date;
          try {
            nextRunDate = getNextCronRun(schedule.cron_expression, new Date(), schedule.timezone || 'UTC');
          } catch (cronErr) {
            serverLogger.error(
              { scheduleId: schedule.id, cron: schedule.cron_expression, error: cronErr },
              'Invalid cron expression during canvas schedule execution'
            );
            nextRunDate = new Date(Date.now() + 3600000);
          }

          const { data: claimed, error: claimError } = await supabase
            .from('workflow_schedules')
            .update({
              last_run_at: nowIso,
              next_run_at: nextRunDate.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', schedule.id)
            .lte('next_run_at', nowIso)
            .select('id')
            .maybeSingle();

          if (claimError || !claimed) {
            continue;
          }

          if (workflow.is_active === false) {
            continue;
          }

          try {
            await executionEngineService.startWorkflowExecution({
              workspaceId: schedule.workspace_id,
              workflowId: schedule.workflow_id,
              triggerType: 'schedule',
              triggerPayload: {
                scheduledTime: schedule.next_run_at,
                cron: schedule.cron_expression,
                timezone: schedule.timezone,
                timestamp: Date.now(),
              },
              waitForCompletion: false,
            });

            dispatchedCount++;
          } catch (execErr) {
            serverLogger.error(
              { workflowId: schedule.workflow_id, error: execErr },
              'Failed to dispatch canvas scheduled execution'
            );
          }
        }
      }
    } catch (err) {
      serverLogger.error({ error: err }, 'Error in WorkflowSchedulerService polling loop');
    } finally {
      this.isPolling = false;
    }

    return dispatchedCount;
  }

  /**
   * Synchronizes schedule triggers defined in a workflow graph to the database.
   */
  public async syncWorkflowSchedules(
    workspaceId: string,
    workflowId: string,
    nodes: Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }>
  ): Promise<void> {
    const supabase = getSupabaseAdminClient();
    const scheduleNodes = nodes.filter((n) => n.type === 'schedule-trigger');

    if (scheduleNodes.length === 0) {
      // Clean up schedules if no schedule nodes exist in the workflow
      const builder = supabase.from('workflow_schedules');
      if (builder && typeof builder.delete === 'function') {
        await builder.delete().eq('workflow_id', workflowId);
      }
      return;
    }

    for (const node of scheduleNodes) {
      const config = (node.data?.config || {}) as {
        cron?: string;
        timezone?: string;
        enabled?: boolean;
      };

      const cronExpression = config.cron || '0 * * * *';
      const timezone = config.timezone || 'UTC';
      const enabled = config.enabled ?? true;

      if (!isValidCronExpression(cronExpression)) {
        serverLogger.warn(
          { workflowId, nodeId: node.id, cron: cronExpression },
          'Ignoring invalid cron expression during workflow schedule sync'
        );
        continue;
      }

      const nextRunAt = getNextCronRun(cronExpression, new Date()).toISOString();

      await supabase.from('workflow_schedules').upsert(
        {
          workflow_id: workflowId,
          workspace_id: workspaceId,
          node_id: node.id,
          cron_expression: cronExpression,
          timezone,
          enabled,
          next_run_at: nextRunAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workflow_id,node_id' }
      );
    }
  }
}

export const workflowSchedulerService = new WorkflowSchedulerService();
