/**
 * Lightweight, zero-dependency 5-part cron expression parser, next-run calculator,
 * and timezone/DST-aware recovery scheduler.
 * Supports standard syntax: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6 where 0 = Sunday).
 * Supports *, step values (/*, /n), comma lists (1,2,5), ranges (1-5), and common shortcuts.
 */

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  originalExpression: string;
}

export const CRON_PRESETS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
  every_minute: '* * * * *',
  every_5_minutes: '*/5 * * * *',
  every_15_minutes: '*/15 * * * *',
  every_30_minutes: '*/30 * * * *',
  every_hour: '0 * * * *',
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Validates whether an IANA timezone string is recognized.
 */
export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes an expression or preset into a standard 5-part cron string.
 */
export function normalizeCronExpression(expression: string): string {
  const trimmed = expression.trim();
  if (CRON_PRESETS[trimmed]) {
    return CRON_PRESETS[trimmed];
  }
  return trimmed;
}

/**
 * Parses a single cron field with support for *, /, -, and ,
 */
function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  const parts = field.split(',');
  for (const part of parts) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes('/')) {
      const [rangePart, stepPart] = part.split('/');
      const step = parseInt(stepPart, 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid step value in cron field: "${part}"`);
      }

      let start = min;
      let end = max;
      if (rangePart && rangePart !== '*') {
        if (rangePart.includes('-')) {
          const [rStart, rEnd] = rangePart.split('-').map((v) => parseInt(v, 10));
          if (!isNaN(rStart)) start = rStart;
          if (!isNaN(rEnd)) end = rEnd;
        } else {
          start = parseInt(rangePart, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) values.add(i);
      }
    } else if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start > end) {
        throw new Error(`Invalid range in cron field: "${part}"`);
      }
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) values.add(i);
      }
    } else {
      const val = parseInt(part, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Value "${part}" out of allowed bounds [${min}-${max}]`);
      }
      values.add(val);
    }
  }

  return values;
}

/**
 * Parses a standard 5-part cron expression.
 */
export function parseCronExpression(expression: string): ParsedCron {
  const normalized = normalizeCronExpression(expression);
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}": expected 5 fields (minute hour day-of-month month day-of-week), received ${parts.length}`
    );
  }

  const [minStr, hourStr, domStr, monthStr, dowStr] = parts;

  const minutes = parseField(minStr, 0, 59);
  const hours = parseField(hourStr, 0, 23);
  const daysOfMonth = parseField(domStr, 1, 31);
  const months = parseField(monthStr, 1, 12);
  const daysOfWeek = parseField(dowStr, 0, 6); // 0=Sunday, 6=Saturday

  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    originalExpression: expression,
  };
}

/**
 * Validates whether a cron expression or preset is valid.
 */
export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression);
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  let month = 0,
    day = 0,
    hour = 0,
    minute = 0,
    weekday = 0;

  for (const p of parts) {
    if (p.type === 'month') month = parseInt(p.value, 10);
    else if (p.type === 'day') day = parseInt(p.value, 10);
    else if (p.type === 'hour') {
      const h = parseInt(p.value, 10);
      hour = h === 24 ? 0 : h;
    } else if (p.type === 'minute') minute = parseInt(p.value, 10);
    else if (p.type === 'weekday') weekday = weekdayMap[p.value] ?? 0;
  }

  return { month, day, weekday, hour, minute };
}

/**
 * Computes the next occurrence Date after the given `fromDate` (default: now).
 * Evaluates candidate minutes respecting daylight saving time (DST) in target timeZone.
 */
export function getNextCronRun(
  expression: string,
  fromDate: Date = new Date(),
  timeZone: string = 'UTC'
): Date {
  const parsed = parseCronExpression(expression);
  const isUtc = timeZone === 'UTC';

  // Start at the next whole minute
  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Safety ceiling: 5 years (approx 2,628,000 minutes)
  const maxIterations = 60 * 24 * 365 * 5;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    if (isUtc) {
      const month = candidate.getUTCMonth() + 1; // 1-12
      if (!parsed.months.has(month)) {
        candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      const dayOfMonth = candidate.getUTCDate(); // 1-31
      const dayOfWeek = candidate.getUTCDay(); // 0-6
      if (!parsed.daysOfMonth.has(dayOfMonth) || !parsed.daysOfWeek.has(dayOfWeek)) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      const hour = candidate.getUTCHours(); // 0-23
      if (!parsed.hours.has(hour)) {
        candidate.setUTCHours(candidate.getUTCHours() + 1, 0, 0, 0);
        continue;
      }

      const minute = candidate.getUTCMinutes(); // 0-59
      if (!parsed.minutes.has(minute)) {
        candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
        continue;
      }

      return candidate;
    } else {
      // Timezone-aware check
      const parts = getZonedParts(candidate, timeZone);

      if (!parsed.months.has(parts.month)) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      if (!parsed.daysOfMonth.has(parts.day) || !parsed.daysOfWeek.has(parts.weekday)) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
        candidate.setUTCHours(0, 0, 0, 0);
        continue;
      }

      if (!parsed.hours.has(parts.hour) || !parsed.minutes.has(parts.minute)) {
        candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
        continue;
      }

      return candidate;
    }
  }

  throw new Error(`Unable to find next run for cron expression "${expression}" within search window`);
}

export interface RecoveryCalculationParams {
  scheduleType: 'one_time' | 'recurring';
  cronExpression?: string | null;
  oneTimeRunAt?: string | null;
  timezone?: string;
  missedRunPolicy?: 'skip' | 'run_once';
  currentNextRunAt: Date | string;
  now?: Date | string;
}

export interface RecoveryCalculationResult {
  shouldExecuteNow: boolean;
  nextRunAt: Date | null;
  scheduledOccurrence: string;
}

/**
 * Calculates whether a schedule should trigger after downtime or recovery,
 * enforcing the configured missed_run_policy (skip vs run_once) to prevent bursts.
 */
export function calculateNextRunAfterRecovery(
  params: RecoveryCalculationParams
): RecoveryCalculationResult {
  const {
    scheduleType,
    cronExpression,
    timezone = 'UTC',
    missedRunPolicy = 'skip',
  } = params;

  const now = new Date(params.now ?? Date.now());
  const scheduledTime = new Date(params.currentNextRunAt);
  const scheduledOccurrence = scheduledTime.toISOString();

  // If in the future, it is not due
  if (scheduledTime.getTime() > now.getTime()) {
    return {
      shouldExecuteNow: false,
      nextRunAt: scheduledTime,
      scheduledOccurrence,
    };
  }

  // If due/past:
  if (scheduleType === 'one_time') {
    // If within 1 minute or policy is run_once
    const shouldExecuteNow =
      missedRunPolicy === 'run_once' || now.getTime() - scheduledTime.getTime() < 60000;
    return {
      shouldExecuteNow,
      nextRunAt: null, // Marked completed
      scheduledOccurrence,
    };
  }

  // Recurring schedule
  if (!cronExpression) {
    throw new Error('cronExpression is required for recurring schedule');
  }

  const nextFutureRun = getNextCronRun(cronExpression, now, timezone);

  if (missedRunPolicy === 'skip') {
    return {
      shouldExecuteNow: false,
      nextRunAt: nextFutureRun,
      scheduledOccurrence,
    };
  } else {
    // 'run_once': Run exactly once to catch up, then schedule the next future occurrence
    return {
      shouldExecuteNow: true,
      nextRunAt: nextFutureRun,
      scheduledOccurrence,
    };
  }
}

/**
 * Returns a human-friendly description for popular cron presets.
 */
export function describeCronExpression(expression: string): string {
  const trimmed = expression.trim();
  switch (trimmed) {
    case '* * * * *':
    case 'every_minute':
      return 'Every minute';
    case '*/5 * * * *':
    case 'every_5_minutes':
      return 'Every 5 minutes';
    case '*/15 * * * *':
    case 'every_15_minutes':
      return 'Every 15 minutes';
    case '*/30 * * * *':
    case 'every_30_minutes':
      return 'Every 30 minutes';
    case '0 * * * *':
    case '@hourly':
    case 'every_hour':
      return 'Every hour (at minute 0)';
    case '0 0 * * *':
    case '@daily':
    case '@midnight':
      return 'Every day at midnight (UTC)';
    case '0 9 * * 1-5':
      return 'Every weekday at 9:00 AM (UTC)';
    case '0 0 * * 0':
    case '@weekly':
      return 'Every Sunday at midnight (UTC)';
    case '0 0 1 * *':
    case '@monthly':
      return 'First day of every month at midnight (UTC)';
    default:
      return `Custom cron: ${expression}`;
  }
}
