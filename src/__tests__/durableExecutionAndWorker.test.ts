import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidTransition,
  assertValidTransition,
  canCancel,
  isTerminal,
  normalizeExecutionStatus,
} from '../server/engine/executionStateMachine.ts';
import {
  isErrorRetryable,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
} from '../server/engine/retryPolicy.ts';
import { DurableWorkerService } from '../server/services/durableWorkerService.ts';

describe('Batch 9: Durable Workflow Execution, State Machine & Retry Policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ── 1. Execution State Machine & Lifecycle Validation ──────────── */
  describe('1. Execution State Machine & Transitions', () => {
    it('allows valid state transitions according to lifecycle specification', () => {
      // queued transitions
      expect(isValidTransition('queued', 'running')).toBe(true);
      expect(isValidTransition('queued', 'cancelled')).toBe(true);
      expect(isValidTransition('queued', 'queued')).toBe(true); // idempotent

      // running transitions
      expect(isValidTransition('running', 'success')).toBe(true);
      expect(isValidTransition('running', 'failed')).toBe(true);
      expect(isValidTransition('running', 'cancelled')).toBe(true);
      expect(isValidTransition('running', 'interrupted')).toBe(true);
      expect(isValidTransition('running', 'waiting')).toBe(true);

      // retry recovery transitions
      expect(isValidTransition('failed', 'queued')).toBe(true);
      expect(isValidTransition('interrupted', 'queued')).toBe(true);
    });

    it('strictly forbids invalid transitions from terminal states', () => {
      // Success is immutable: completed execution cannot become running again
      expect(isValidTransition('success', 'running')).toBe(false);
      expect(isValidTransition('success', 'queued')).toBe(false);
      expect(isValidTransition('success', 'failed')).toBe(false);
      expect(isValidTransition('success', 'cancelled')).toBe(false);

      // Cancelled is immutable: late worker completion cannot overwrite cancelled
      expect(isValidTransition('cancelled', 'running')).toBe(false);
      expect(isValidTransition('cancelled', 'success')).toBe(false);
      expect(isValidTransition('cancelled', 'failed')).toBe(false);

      // Throws descriptive error on assertValidTransition
      expect(() => assertValidTransition('success', 'running', 'exec-123')).toThrow(
        /A completed execution cannot become running again/
      );
      expect(() => assertValidTransition('cancelled', 'success', 'exec-456')).toThrow(
        /A cancelled execution cannot be overwritten/
      );
    });

    it('identifies terminal and cancellable statuses correctly', () => {
      expect(isTerminal('success')).toBe(true);
      expect(isTerminal('cancelled')).toBe(true);
      expect(isTerminal('failed')).toBe(true);
      expect(isTerminal('interrupted')).toBe(true);
      expect(isTerminal('running')).toBe(false);
      expect(isTerminal('queued')).toBe(false);

      expect(canCancel('queued')).toBe(true);
      expect(canCancel('running')).toBe(true);
      expect(canCancel('waiting')).toBe(true);
      expect(canCancel('success')).toBe(false);
      expect(canCancel('cancelled')).toBe(false);
    });

    it('normalizes status aliases like "completed" to "success"', () => {
      expect(normalizeExecutionStatus('completed')).toBe('success');
      expect(normalizeExecutionStatus('COMPLETED')).toBe('success');
      expect(normalizeExecutionStatus('running')).toBe('running');
      expect(normalizeExecutionStatus('queued')).toBe('queued');
    });
  });

  /* ── 2. Retry Policies & Error Classification ────────────────────── */
  describe('2. Retry Policies & Error Classifier', () => {
    it('classifies transient network and server errors as retryable', () => {
      expect(isErrorRetryable(new Error('Connection timed out: ETIMEDOUT'))).toBe(true);
      expect(isErrorRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(isErrorRetryable(new Error('fetch failed: socket hang up'))).toBe(true);
      expect(isErrorRetryable({ statusCode: 503, message: 'Service Unavailable' })).toBe(true);
      expect(isErrorRetryable({ statusCode: 504, message: 'Gateway Timeout' })).toBe(true);
      expect(isErrorRetryable({ statusCode: 429, message: 'Rate limit exceeded' })).toBe(true);
      expect(isErrorRetryable(new Error('Transient failure'), 'http-request')).toBe(true);
    });

    it('strictly classifies validation, auth, and client errors as non-retryable', () => {
      expect(isErrorRetryable(new Error('Validation failed: graph contains a cycle'))).toBe(false);
      expect(isErrorRetryable(new Error('Invalid JSON payload'))).toBe(false);
      expect(isErrorRetryable({ statusCode: 400, message: 'Bad Request' })).toBe(false);
      expect(isErrorRetryable({ statusCode: 401, message: 'Unauthorized' })).toBe(false);
      expect(isErrorRetryable({ statusCode: 403, message: 'Forbidden' })).toBe(false);
      expect(isErrorRetryable({ statusCode: 404, message: 'Not Found' })).toBe(false);
      expect(isErrorRetryable(new Error('SSRF: Disallowed private IP address 10.0.0.1'))).toBe(false);
      expect(isErrorRetryable(new Error('Workflow execution cancelled by user request'))).toBe(false);
    });

    it('calculates exponential backoff delay correctly with capping', () => {
      // First attempt (no delay before first execution)
      expect(calculateBackoffDelay(1)).toBe(0);

      // Attempt 2: initial delay (1000ms)
      expect(calculateBackoffDelay(2, DEFAULT_RETRY_CONFIG)).toBe(1000);

      // Attempt 3: 1000 * 2^1 = 2000ms
      expect(calculateBackoffDelay(3, DEFAULT_RETRY_CONFIG)).toBe(2000);

      // Attempt 4: 1000 * 2^2 = 4000ms
      expect(calculateBackoffDelay(4, DEFAULT_RETRY_CONFIG)).toBe(4000);

      // Capped at maxDelayMs (10000ms)
      expect(calculateBackoffDelay(10, { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 10000 })).toBe(10000);
    });
  });

  /* ── 3. Durable Worker Service & Claiming ────────────────────────── */
  describe('3. Durable Worker Service, Atomic Claiming & Recovery', () => {
    it('initializes worker service with unique worker ID and default configuration', () => {
      const worker = new DurableWorkerService();
      expect(worker.workerId).toMatch(/^worker-[a-f0-9]{8}$/);
      expect(worker.pollIntervalMs).toBe(1000);
      expect(worker.leaseDurationSeconds).toBe(30);
      expect(worker.getActiveJobCount()).toBe(0);
      expect(worker.isWorkerRunning()).toBe(false);
    });

    it('atomically claims next queued job when candidate is available', async () => {
      const worker = new DurableWorkerService({ workerId: 'worker-unit-test' });

      const mockCandidate = {
        id: '11111111-2222-3333-4444-555555555555',
        workflow_id: 'wf-101',
        retry_count: 0,
        max_retries: 3,
        input_payload: {
          definition: { nodes: [{ id: 'n1' }], edges: [] },
          triggerPayload: { test: true },
        },
        workflows: {
          workspace_id: 'ws-202',
          name: 'Payment Processing',
        },
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'executions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              lte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [mockCandidate], error: null }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: mockCandidate.id }, error: null }),
              }),
            };
          }
          return {};
        }),
      };

      const claimed = await worker.claimNextJob(mockSupabase as never);
      expect(claimed).not.toBeNull();
      expect(claimed?.executionId).toBe(mockCandidate.id);
      expect(claimed?.workflowId).toBe('wf-101');
      expect(claimed?.workspaceId).toBe('ws-202');
    });

    it('prevents multiple workers from claiming the same execution concurrently', async () => {
      const worker1 = new DurableWorkerService({ workerId: 'worker-1' });
      const worker2 = new DurableWorkerService({ workerId: 'worker-2' });

      const mockCandidate = {
        id: 'exec-race-101',
        workflow_id: 'wf-race',
        retry_count: 0,
        max_retries: 3,
        input_payload: {},
        workflows: { workspace_id: 'ws-race' },
      };

      // Worker 1 succeeds in atomic update
      const mockSupabaseWorker1 = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [mockCandidate], error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: mockCandidate.id }, error: null }),
          }),
        }),
      };

      // Worker 2 sees candidate, but update returns null due to optimistic lock (status != 'queued' anymore)
      const mockSupabaseWorker2 = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [mockCandidate], error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // race lost
          }),
        }),
      };

      const claim1 = await worker1.claimNextJob(mockSupabaseWorker1 as never);
      const claim2 = await worker2.claimNextJob(mockSupabaseWorker2 as never);

      expect(claim1).not.toBeNull();
      expect(claim2).toBeNull(); // Worker 2 avoided duplicate processing
    });

    it('cancels an active job cleanly and sends abort signal', () => {
      const worker = new DurableWorkerService();
      const executionId = 'exec-cancel-active';

      // Simulate active job
      const abortController = new AbortController();
      (worker as unknown as { activeJobs: Map<string, unknown> }).activeJobs.set(executionId, {
        executionId,
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        abortController,
        startedAt: Date.now(),
      });

      expect(worker.getActiveJobCount()).toBe(1);

      const didCancel = worker.cancelActiveJob(executionId, 'User requested stop');
      expect(didCancel).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
      expect(worker.getActiveJobCount()).toBe(0);
    });

    it('gracefully shuts down within grace period and cleans up timers', async () => {
      const worker = new DurableWorkerService({ pollIntervalMs: 50 });
      vi.spyOn(worker, 'recoverStaleLeases').mockResolvedValue({ recoveredCount: 0, interruptedCount: 0 });
      vi.spyOn(worker, 'pollAndProcessNextJob').mockResolvedValue(false);

      await worker.start();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stop(500);
      expect(worker.isWorkerRunning()).toBe(false);
      expect(worker.getActiveJobCount()).toBe(0);
    });
  });
});
