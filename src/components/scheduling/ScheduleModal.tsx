import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  X,
  History,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useWorkflowStore } from '@/store/workflowStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { scheduleClientService } from '@/services/scheduleClientService';
import { isValidCronExpression, describeCronExpression } from '@/server/engine/cronParser';
import type { ScheduleRow, ScheduleType, MissedRunPolicy } from '@flowforge/workflow-schema';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const timezoneOptions = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (PST/PDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
];

const cronPresets = [
  { value: '*/5 * * * *', label: 'Every 5 minutes' },
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '0 * * * *', label: 'Every hour (at minute 0)' },
  { value: '0 0 * * *', label: 'Daily at midnight (00:00)' },
  { value: '0 9 * * 1-5', label: 'Weekdays at 9:00 AM' },
  { value: '0 0 * * 0', label: 'Weekly on Sunday' },
  { value: 'custom', label: 'Custom Cron Expression...' },
];

export function ScheduleModal({ isOpen, onClose }: ScheduleModalProps) {
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const activeWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace());
  const canEdit = useWorkspaceStore((s) => s.canCreateWorkflows());

  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subview: 'list' | 'create' | 'history'
  const [view, setView] = useState<'list' | 'create' | 'history'>('list');
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleRow | null>(null);
  const [executions, setExecutions] = useState<Array<{
    id: string;
    status: string;
    started_at?: string;
    finished_at?: string;
    error_message?: string;
    scheduled_for?: string;
    created_at: string;
  }>>([]);

  // Form State
  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('recurring');
  const [selectedPreset, setSelectedPreset] = useState('0 * * * *');
  const [customCron, setCustomCron] = useState('0 * * * *');
  const [oneTimeDate, setOneTimeDate] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [missedRunPolicy, setMissedRunPolicy] = useState<MissedRunPolicy>('skip');
  const [submitting, setSubmitting] = useState(false);

  const activeCron = selectedPreset === 'custom' ? customCron : selectedPreset;
  const isCronValid = scheduleType === 'one_time' || isValidCronExpression(activeCron);

  const loadSchedules = useCallback(async () => {
    if (!activeWorkspace?.id || !workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await scheduleClientService.listSchedules(activeWorkspace.id, workflowId);
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, workflowId]);

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.id || !workflowId) return;

    let isCancelled = false;
    scheduleClientService
      .listSchedules(activeWorkspace.id, workflowId)
      .then((data) => {
        if (!isCancelled) {
          setSchedules(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load schedules');
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, workflowId, activeWorkspace]);

  if (!isOpen) return null;

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.id) return;

    if (!name.trim()) {
      setError('Please provide a name for this schedule.');
      return;
    }

    if (scheduleType === 'recurring' && !isValidCronExpression(activeCron)) {
      setError('Please enter a valid 5-part cron expression.');
      return;
    }

    if (scheduleType === 'one_time' && !oneTimeDate) {
      setError('Please select a target date and time.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await scheduleClientService.createSchedule(activeWorkspace.id, {
        workflowId,
        name: name.trim(),
        scheduleType,
        cronExpression: scheduleType === 'recurring' ? activeCron : undefined,
        oneTimeRunAt: scheduleType === 'one_time' ? new Date(oneTimeDate).toISOString() : undefined,
        timezone,
        missedRunPolicy,
      });

      await loadSchedules();
      setView('list');
      // Reset form
      setName('');
      setSelectedPreset('0 * * * *');
      setOneTimeDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePause = async (schedule: ScheduleRow) => {
    if (!activeWorkspace?.id) return;
    try {
      if (schedule.status === 'paused') {
        await scheduleClientService.resumeSchedule(activeWorkspace.id, schedule.id);
      } else {
        await scheduleClientService.pauseSchedule(activeWorkspace.id, schedule.id);
      }
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle schedule state');
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!activeWorkspace?.id) return;
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      await scheduleClientService.deleteSchedule(activeWorkspace.id, scheduleId);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const handleViewHistory = async (schedule: ScheduleRow) => {
    if (!activeWorkspace?.id) return;
    setSelectedSchedule(schedule);
    setView('history');
    setLoading(true);
    try {
      const history = await scheduleClientService.getScheduleExecutions(activeWorkspace.id, schedule.id);
      setExecutions(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution history');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-[#2a2a3e] bg-[#12121e] shadow-2xl overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a3e] px-6 py-4 bg-[#161626]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Workflow Schedules</h2>
              <p className="text-xs text-gray-400">
                {view === 'create'
                  ? 'Create new automated schedule'
                  : view === 'history'
                  ? `Execution history for "${selectedSchedule?.name}"`
                  : `Automate: ${workflowName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {view === 'list' && canEdit && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setView('create')}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Schedule</span>
              </Button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ── VIEW 1: SCHEDULES LIST ── */}
          {view === 'list' && (
            <>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                  <span className="text-xs">Loading workflow schedules...</span>
                </div>
              ) : schedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1c1c2e] border border-[#2a2a3e] text-gray-500 mb-3">
                    <Clock className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-200">No schedules configured</h3>
                  <p className="text-xs text-gray-400 max-w-sm mt-1">
                    Set up a one-time execution or recurring cron schedule to automate this workflow.
                  </p>
                  {canEdit && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setView('create')}
                      className="mt-4 bg-teal-600 hover:bg-teal-500 text-white"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Create First Schedule
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((sched) => {
                    const isPaused = sched.status === 'paused';
                    const isCompleted = sched.status === 'completed';

                    return (
                      <div
                        key={sched.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[#2a2a3e] bg-[#161626] p-4 hover:border-[#3a3a52] transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-100">{sched.name}</span>
                            <Badge
                              variant={isPaused ? 'warning' : isCompleted ? 'default' : 'success'}
                            >
                              {sched.status.toUpperCase()}
                            </Badge>
                            <span className="text-[10px] text-gray-400 uppercase font-mono px-1.5 py-0.5 rounded bg-[#1f1f33]">
                              {sched.scheduleType === 'recurring' ? 'Cron' : 'One-Time'}
                            </span>
                          </div>

                          <p className="text-xs text-gray-300 font-mono">
                            {sched.scheduleType === 'recurring'
                              ? `${sched.cronExpression} (${describeCronExpression(sched.cronExpression || '')})`
                              : `Runs at: ${sched.oneTimeRunAt ? new Date(sched.oneTimeRunAt).toLocaleString() : 'N/A'}`}
                          </p>

                          <div className="flex items-center gap-4 text-[11px] text-gray-400">
                            <span>Timezone: <strong className="text-gray-300">{sched.timezone}</strong></span>
                            {sched.nextRunAt && (
                              <span>Next: <strong className="text-teal-300">{new Date(sched.nextRunAt).toLocaleString()}</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => handleViewHistory(sched)}
                            title="View Execution History"
                            className="rounded-md border border-[#2a2a3e] bg-[#1a1a2e] p-2 text-gray-300 hover:text-white hover:bg-[#25253e] transition-colors"
                          >
                            <History className="h-4 w-4" />
                          </button>

                          {canEdit && !isCompleted && (
                            <button
                              type="button"
                              onClick={() => handleTogglePause(sched)}
                              title={isPaused ? 'Resume Schedule' : 'Pause Schedule'}
                              className={`rounded-md border border-[#2a2a3e] p-2 transition-colors ${
                                isPaused
                                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                              }`}
                            >
                              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            </button>
                          )}

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleDelete(sched.id)}
                              title="Delete Schedule"
                              className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── VIEW 2: CREATE SCHEDULE FORM ── */}
          {view === 'create' && (
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-200">Schedule Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Data Ingestion / Midnight Cleanup"
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Schedule Type Selection */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleType('recurring')}
                  className={`flex items-center justify-center gap-2 rounded-md border p-3 text-xs font-semibold transition-colors ${
                    scheduleType === 'recurring'
                      ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                      : 'border-[#2a2a3e] bg-[#161626] text-gray-400 hover:text-white'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span>Recurring (Cron)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleType('one_time')}
                  className={`flex items-center justify-center gap-2 rounded-md border p-3 text-xs font-semibold transition-colors ${
                    scheduleType === 'one_time'
                      ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                      : 'border-[#2a2a3e] bg-[#161626] text-gray-400 hover:text-white'
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  <span>One-Time Execution</span>
                </button>
              </div>

              {/* Recurring Cron Config */}
              {scheduleType === 'recurring' && (
                <div className="space-y-3 rounded-md bg-[#161626] p-3 border border-[#2a2a3e]">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-300">Frequency Preset</label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                    >
                      {cronPresets.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPreset === 'custom' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-300">Custom 5-Part Cron</label>
                      <input
                        type="text"
                        value={customCron}
                        onChange={(e) => setCustomCron(e.target.value)}
                        placeholder="0 * * * *"
                        className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-100 font-mono focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {isCronValid && (
                    <div className="flex items-center gap-1.5 text-xs text-teal-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{describeCronExpression(activeCron)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* One-Time Date Config */}
              {scheduleType === 'one_time' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-200">Execution Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={oneTimeDate}
                    onChange={(e) => setOneTimeDate(e.target.value)}
                    className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-100 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Timezone */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-200">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Missed Run Policy */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-200">Missed Run Policy (After Downtime)</label>
                <select
                  value={missedRunPolicy}
                  onChange={(e) => setMissedRunPolicy(e.target.value as MissedRunPolicy)}
                  className="w-full rounded-md border border-[#2a2a3e] bg-[#1a1a2e] px-3 py-2 text-xs text-gray-200 focus:border-teal-500 focus:outline-none"
                >
                  <option value="skip">Skip Missed Runs (Prevent execution bursts)</option>
                  <option value="run_once">Run Once Immediately (Catch up on recovery)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2a2a3e]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setView('list')}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={submitting || !isCronValid}
                  className="bg-teal-600 hover:bg-teal-500 text-white"
                >
                  {submitting ? 'Saving...' : 'Create Schedule'}
                </Button>
              </div>
            </form>
          )}

          {/* ── VIEW 3: EXECUTION HISTORY ── */}
          {view === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#2a2a3e]">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Schedules</span>
                </button>
                <span className="text-xs text-gray-400 font-mono">
                  {executions.length} recorded run(s)
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
                </div>
              ) : executions.length === 0 ? (
                <p className="text-center py-8 text-xs text-gray-400">
                  No executions recorded for this schedule yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {executions.map((exec) => (
                    <div
                      key={exec.id}
                      className="flex items-center justify-between p-3 rounded-md border border-[#2a2a3e] bg-[#161626] text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-300">{exec.id.slice(0, 8)}...</span>
                          <Badge
                            variant={
                              exec.status === 'success'
                                ? 'success'
                                : exec.status === 'failed'
                                ? 'error'
                                : 'default'
                            }
                          >
                            {exec.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Scheduled for: {exec.scheduled_for ? new Date(exec.scheduled_for).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <span className="text-[11px] text-gray-500 font-mono">
                        {new Date(exec.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
