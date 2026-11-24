import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidCronExpression,
  isValidTimezone,
  getNextCronRun,
  normalizeCronExpression,
  calculateNextRunAfterRecovery,
} from '../server/engine/cronParser';
import { WorkflowSchedulerService } from '../server/services/workflowSchedulerService';
import { ScheduleService } from '../server/services/scheduleService';

// Mock schedule rows
const mockWorkspaceId = '11111111-1111-4111-8111-111111111111';
const mockWorkflowId = '33333333-3333-4333-8333-333333333333';
const mockScheduleId = '44444444-4444-4444-8444-444444444444';

let mockSchedulesData: Array<{
  id: string;
  workspace_id: string;
  workflow_id: string;
  name: string;
  schedule_type: 'one_time' | 'recurring';
  cron_expression: string | null;
  one_time_run_at: string | null;
  timezone: string;
  status: 'active' | 'paused' | 'completed';
  missed_run_policy: 'skip' | 'run_once';
  next_run_at: string | null;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  workflows?: {
    id: string;
    workspace_id: string;
    is_active: boolean;
    name: string;
  };
}> = [];

let claimCallCount = 0;

vi.mock('../server/supabase', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'schedules') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              lte: (_col2: string, _val2: string) => ({
                order: () => ({
                  limit: async () => ({
                    data: mockSchedulesData.filter((s) => s.status === 'active'),
                    error: null,
                  }),
                }),
              }),
              eq: (col2: string, val2: string) => ({
                maybeSingle: async () => {
                  const item = mockSchedulesData.find(
                    (s) => s[col as keyof typeof s] === val && s[col2 as keyof typeof s] === val2
                  );
                  return { data: item || null, error: null };
                },
              }),
              order: () => Promise.resolve({ data: mockSchedulesData, error: null }),
            }),
          }),
          insert: (data: unknown) => ({
            select: () => ({
              single: async () => {
                const inserted = {
                  id: mockScheduleId,
                  ...(data as object),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                return { data: inserted, error: null };
              },
            }),
          }),
          update: (updatePayload: unknown) => ({
            eq: (_col1: string, val1: string) => ({
              eq: (_col2: string, _val2: string) => ({
                select: () => ({
                  single: async () => ({
                    data: { id: val1, ...(updatePayload as object) },
                    error: null,
                  }),
                }),
                lte: (_col3: string, _val3: string) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      claimCallCount++;
                      if (claimCallCount === 1) {
                        return { data: { id: val1 }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }

      if (table === 'workflows') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: mockWorkflowId, workspace_id: mockWorkspaceId },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'workflow_schedules') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'executions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: 'exec-sched-1',
                      status: 'success',
                      scheduled_for: '2026-01-01T12:00:00.000Z',
                      created_at: '2026-01-01T12:00:01.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {};
    },
  }),
}));

const mockStartWorkflowExecution = vi.fn().mockResolvedValue({
  executionId: 'exec-scheduled-1',
  status: 'running',
  startedAt: new Date().toISOString(),
});

vi.mock('../server/services/executionEngineService', () => ({
  executionEngineService: {
    startWorkflowExecution: (params: unknown) => mockStartWorkflowExecution(params),
  },
}));

describe('Batch 10: Scheduled Workflows & Recurring Automation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimCallCount = 0;
    mockSchedulesData = [];
  });

  describe('1. Cron Validation & Timezone / DST Calculations', () => {
    it('validates IANA timezones correctly', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Kolkata')).toBe(true);
      expect(isValidTimezone('Invalid/Timezone_Name')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });

    it('parses cron expressions and presets', () => {
      expect(normalizeCronExpression('@daily')).toBe('0 0 * * *');
      expect(normalizeCronExpression('@hourly')).toBe('0 * * * *');
      expect(isValidCronExpression('0 9 * * 1-5')).toBe(true);
      expect(isValidCronExpression('99 * * * *')).toBe(false);
    });

    it('handles Daylight Saving Time (DST) shift accurately in target timezone', () => {
      // In America/New_York:
      // January is Standard Time (EST = UTC-5). 9:00 AM EST = 14:00 UTC.
      // July is Daylight Time (EDT = UTC-4). 9:00 AM EDT = 13:00 UTC.
      const winterDate = new Date('2026-01-15T08:00:00.000Z');
      const summerDate = new Date('2026-07-15T08:00:00.000Z');

      const nextWinterRun = getNextCronRun('0 9 * * *', winterDate, 'America/New_York');
      const nextSummerRun = getNextCronRun('0 9 * * *', summerDate, 'America/New_York');

      // Winter: 9:00 AM in New York is 14:00 UTC
      expect(nextWinterRun.getUTCHours()).toBe(14);
      expect(nextWinterRun.getUTCMinutes()).toBe(0);

      // Summer: 9:00 AM in New York is 13:00 UTC
      expect(nextSummerRun.getUTCHours()).toBe(13);
      expect(nextSummerRun.getUTCMinutes()).toBe(0);
    });
  });

  describe('2. Missed-Run Recovery Policy & Anti-Burst Protection', () => {
    it('enforces missed_run_policy = skip by advancing past downtime without firing', () => {
      const scheduledTime = '2026-01-01T10:00:00.000Z';
      const recoveryNow = '2026-01-01T12:30:00.000Z'; // 2.5 hours downtime

      const result = calculateNextRunAfterRecovery({
        scheduleType: 'recurring',
        cronExpression: '0 * * * *', // hourly
        currentNextRunAt: scheduledTime,
        missedRunPolicy: 'skip',
        now: recoveryNow,
      });

      expect(result.shouldExecuteNow).toBe(false);
      expect(result.nextRunAt).toBeDefined();
      // Should advance directly to 13:00 UTC
      expect(result.nextRunAt?.toISOString()).toBe('2026-01-01T13:00:00.000Z');
    });

    it('enforces missed_run_policy = run_once by firing exactly one catch-up run', () => {
      const scheduledTime = '2026-01-01T10:00:00.000Z';
      const recoveryNow = '2026-01-01T12:30:00.000Z'; // 2.5 hours downtime

      const result = calculateNextRunAfterRecovery({
        scheduleType: 'recurring',
        cronExpression: '0 * * * *', // hourly
        currentNextRunAt: scheduledTime,
        missedRunPolicy: 'run_once',
        now: recoveryNow,
      });

      expect(result.shouldExecuteNow).toBe(true);
      // Next run is still advanced to the next future occurrence (no backlog storm)
      expect(result.nextRunAt?.toISOString()).toBe('2026-01-01T13:00:00.000Z');
    });

    it('handles one-time schedule completion', () => {
      const scheduledTime = '2026-01-01T10:00:00.000Z';
      const now = '2026-01-01T10:00:30.000Z'; // 30s after

      const result = calculateNextRunAfterRecovery({
        scheduleType: 'one_time',
        currentNextRunAt: scheduledTime,
        missedRunPolicy: 'skip',
        now,
      });

      expect(result.shouldExecuteNow).toBe(true);
      expect(result.nextRunAt).toBeNull(); // Completed
    });
  });

  describe('3. Schedule Service CRUD & Execution Integration', () => {
    const service = new ScheduleService();

    it('creates a recurring schedule with validated next_run_at', async () => {
      const schedule = await service.createSchedule(mockWorkspaceId, {
        workflowId: mockWorkflowId,
        name: 'Daily Sync',
        scheduleType: 'recurring',
        cronExpression: '0 0 * * *',
        timezone: 'UTC',
        missedRunPolicy: 'skip',
      });

      expect(schedule.name).toBe('Daily Sync');
      expect(schedule.scheduleType).toBe('recurring');
      expect(schedule.status).toBe('active');
      expect(schedule.nextRunAt).toBeDefined();
    });

    it('creates a one-time schedule with target timestamp', async () => {
      const targetDate = new Date(Date.now() + 86400000).toISOString();
      const schedule = await service.createSchedule(mockWorkspaceId, {
        workflowId: mockWorkflowId,
        name: 'Migration Run',
        scheduleType: 'one_time',
        oneTimeRunAt: targetDate,
        timezone: 'UTC',
      });

      expect(schedule.name).toBe('Migration Run');
      expect(schedule.scheduleType).toBe('one_time');
      expect(schedule.nextRunAt).toBe(targetDate);
    });

    it('pauses and resumes a schedule', async () => {
      mockSchedulesData = [
        {
          id: mockScheduleId,
          workspace_id: mockWorkspaceId,
          workflow_id: mockWorkflowId,
          name: 'Pausable Schedule',
          schedule_type: 'recurring',
          cron_expression: '0 * * * *',
          one_time_run_at: null,
          timezone: 'UTC',
          status: 'active',
          missed_run_policy: 'skip',
          next_run_at: new Date(Date.now() + 3600000).toISOString(),
          last_run_at: null,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const paused = await service.pauseSchedule(mockWorkspaceId, mockScheduleId);
      expect(paused.status).toBe('paused');

      const resumed = await service.resumeSchedule(mockWorkspaceId, mockScheduleId);
      expect(resumed.status).toBe('active');
    });
  });

  describe('4. Concurrency Protection & Multi-Scheduler Collisions', () => {
    it('prevents multiple scheduler instances from executing the same occurrence twice', async () => {
      const scheduler = new WorkflowSchedulerService({ pollIntervalMs: 60000 });

      mockSchedulesData = [
        {
          id: mockScheduleId,
          workspace_id: mockWorkspaceId,
          workflow_id: mockWorkflowId,
          name: 'Concurrent Schedule Test',
          schedule_type: 'recurring',
          cron_expression: '0 * * * *',
          one_time_run_at: null,
          timezone: 'UTC',
          status: 'active',
          missed_run_policy: 'run_once',
          next_run_at: new Date(Date.now() - 5000).toISOString(),
          last_run_at: null,
          created_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          workflows: {
            id: mockWorkflowId,
            workspace_id: mockWorkspaceId,
            is_active: true,
            name: 'Test Flow',
          },
        },
      ];

      // First worker tick claims it
      const count1 = await scheduler.pollDueSchedules();
      expect(count1).toBe(1);

      // Second worker tick concurrently trying to claim the same record fails
      const count2 = await scheduler.pollDueSchedules();
      expect(count2).toBe(0);

      // Verify that execution was queued only once
      expect(mockStartWorkflowExecution).toHaveBeenCalledTimes(1);
      expect(mockStartWorkflowExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'schedule',
          scheduleId: mockScheduleId,
        })
      );
    });
  });
});
