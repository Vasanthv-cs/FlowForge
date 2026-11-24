import type { ExecutionStatus } from '@flowforge/workflow-schema';

export type DurableExecutionStatus = ExecutionStatus;

/**
 * Authoritative state machine mapping of allowed execution lifecycle transitions.
 * Immutable / terminal states strictly forbid reopening or overwriting.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<DurableExecutionStatus, ReadonlySet<DurableExecutionStatus>>> = {
  // A queued execution can transition to running (when claimed by a worker)
  // or directly to cancelled (if user cancels before worker picks it up).
  queued: new Set<DurableExecutionStatus>(['running', 'cancelled']),

  // A running execution can transition to terminal statuses or temporary waiting
  running: new Set<DurableExecutionStatus>([
    'success',
    'failed',
    'cancelled',
    'interrupted',
    'waiting',
  ]),

  // Waiting (e.g. for long external pause or resume)
  waiting: new Set<DurableExecutionStatus>(['running', 'cancelled', 'failed', 'interrupted']),

  // TERMINAL STATES:
  // Success is immutable: a completed execution cannot become running again
  success: new Set<DurableExecutionStatus>([]),

  // Cancelled is immutable: late worker results or racing completions cannot overwrite cancelled
  cancelled: new Set<DurableExecutionStatus>([]),

  // Failed: terminal, unless an explicit retry policy re-queues the execution
  failed: new Set<DurableExecutionStatus>(['queued']),

  // Interrupted: terminal, unless an explicit recovery process re-queues the execution
  interrupted: new Set<DurableExecutionStatus>(['queued']),
};

export const TERMINAL_STATUSES: ReadonlySet<DurableExecutionStatus> = new Set<DurableExecutionStatus>([
  'success',
  'cancelled',
  'failed',
  'interrupted',
]);

/**
 * Normalizes input status string (e.g. 'completed' maps to 'success').
 */
export function normalizeExecutionStatus(status: string): DurableExecutionStatus {
  const s = status.trim().toLowerCase();
  if (s === 'completed') return 'success';
  return s as DurableExecutionStatus;
}

/**
 * Returns true if the status transition is permitted by the lifecycle rules.
 */
export function isValidTransition(
  from: DurableExecutionStatus,
  to: DurableExecutionStatus,
): boolean {
  if (from === to) return true; // Idempotent no-op
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

/**
 * Asserts that a state transition is permitted. Throws an explicit error if rejected.
 */
export function assertValidTransition(
  from: DurableExecutionStatus,
  to: DurableExecutionStatus,
  executionId?: string,
): void {
  if (!isValidTransition(from, to)) {
    const idMsg = executionId ? ` on execution "${executionId}"` : '';
    throw new Error(
      `Invalid execution state transition${idMsg}: cannot transition from "${from}" to "${to}". ` +
      (from === 'success' ? 'A completed execution cannot become running again.' :
       from === 'cancelled' ? 'A cancelled execution cannot be overwritten by a completion or failure.' :
       'This transition violates the durable execution lifecycle.')
    );
  }
}

/**
 * Returns true if an execution in this status is allowed to be cancelled.
 */
export function canCancel(status: DurableExecutionStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'waiting';
}

/**
 * Returns true if the status represents a final terminal state.
 */
export function isTerminal(status: DurableExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
