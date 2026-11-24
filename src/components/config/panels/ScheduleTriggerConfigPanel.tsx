import { useState, useId } from 'react';
import { SelectField } from '../fields/SelectField';
import { InputField } from '../fields/InputField';
import { JsonField } from '../fields/JsonField';
import { Clock, Calendar, AlertCircle } from 'lucide-react';
import { isValidCronExpression, describeCronExpression, getNextCronRun } from '@/server/engine/cronParser';
import type { WorkflowNode } from '@/types/workflow';
import type { ScheduleTriggerConfig } from '@/types/nodeConfigs';

interface ScheduleTriggerConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (config: Partial<ScheduleTriggerConfig>) => void;
}

const cronPresets = [
  { value: '*/5 * * * *', label: 'Every 5 minutes' },
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '*/30 * * * *', label: 'Every 30 minutes' },
  { value: '0 * * * *', label: 'Every hour (at :00)' },
  { value: '0 0 * * *', label: 'Daily at midnight (00:00 UTC)' },
  { value: '0 9 * * 1-5', label: 'Weekdays at 9:00 AM UTC' },
  { value: '0 0 * * 0', label: 'Weekly on Sunday' },
  { value: '0 0 1 * *', label: 'Monthly on 1st' },
  { value: 'custom', label: 'Custom Cron Expression...' },
];

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

export function ScheduleTriggerConfigPanel({
  node,
  onUpdate,
}: ScheduleTriggerConfigPanelProps) {
  const config = node.data.config as unknown as ScheduleTriggerConfig;
  const currentCron = config.cron || '0 * * * *';
  const isPreset = cronPresets.some((p) => p.value === currentCron);
  const [selectedPreset, setSelectedPreset] = useState<string>(isPreset ? currentCron : 'custom');
  const enableCheckboxId = useId();

  const isCronValid = isValidCronExpression(currentCron);

  let nextRunText = 'Invalid cron expression';
  let friendlyDescription = '';
  if (isCronValid) {
    try {
      friendlyDescription = describeCronExpression(currentCron);
      const nextRun = getNextCronRun(currentCron);
      nextRunText = nextRun.toUTCString();
    } catch {
      nextRunText = 'Error calculating next run';
    }
  }

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);
    if (presetValue !== 'custom') {
      onUpdate({ cron: presetValue });
    }
  };

  return (
    <div className="space-y-4">
      {/* Schedule Enable Toggle */}
      <div className="flex items-center justify-between rounded-md bg-[#161626] p-3 border border-[#2a2a3e]">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-teal-400" />
          <label htmlFor={enableCheckboxId} className="text-xs font-semibold text-gray-200 cursor-pointer">
            Schedule Active
          </label>
        </div>
        <input
          id={enableCheckboxId}
          type="checkbox"
          checked={config.enabled ?? true}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-gray-600 text-teal-500 focus:ring-teal-400 focus:ring-offset-0 bg-[#1e1e30] cursor-pointer"
        />
      </div>

      {/* Preset Selector */}
      <SelectField
        label="Schedule Frequency / Preset"
        value={selectedPreset}
        onChange={(e) => handlePresetChange(e.target.value)}
        options={cronPresets}
      />

      {/* Custom Cron Input */}
      {selectedPreset === 'custom' && (
        <InputField
          label="Cron Expression (5-part)"
          description="Format: minute hour dom month dow (e.g. 0 9 * * 1-5)"
          value={config.cron ?? ''}
          onChange={(e) => onUpdate({ cron: e.target.value })}
          placeholder="*/15 * * * *"
        />
      )}

      {/* Validation and Next Run Preview */}
      <div className="rounded-md bg-[#161626] p-3 border border-[#2a2a3e] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Schedule Preview
          </span>
          {isCronValid ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 font-medium">
              <Clock className="h-3 w-3" />
              Valid Cron
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-medium">
              <AlertCircle className="h-3 w-3" />
              Invalid
            </span>
          )}
        </div>

        {isCronValid ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-200">{friendlyDescription}</p>
            <p className="text-[11px] text-gray-400 font-mono">
              Next trigger: <span className="text-teal-300">{nextRunText}</span>
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-rose-300">
            Please enter a valid standard 5-part cron pattern (e.g. &quot;0 * * * *&quot;).
          </p>
        )}
      </div>

      {/* Timezone */}
      <SelectField
        label="Timezone"
        description="Reference timezone for schedule calculations"
        value={config.timezone ?? 'UTC'}
        onChange={(e) => onUpdate({ timezone: e.target.value })}
        options={timezoneOptions}
      />

      {/* Default Payload */}
      <JsonField
        label="Default Execution Payload"
        description="Optional JSON payload delivered on schedule tick"
        value={config.defaultPayload ?? ''}
        onChange={(val) => onUpdate({ defaultPayload: val })}
        rows={4}
        placeholder='{\n  "source": "cron-scheduler"\n}'
      />
    </div>
  );
}
