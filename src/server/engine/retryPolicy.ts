export interface NodeRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  retryableErrors?: string[];
}

export interface RetryAttemptRecord {
  attempt: number;
  error: string;
  timestamp: number;
  delayMs: number;
}

export const DEFAULT_RETRY_CONFIG: Readonly<NodeRetryConfig> = {
  maxAttempts: 3, // 1 initial execution + up to 2 retries
  initialDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 10000,
};

/**
 * Known non-retryable error substrings: validation, syntax, authorization, and cancellation.
 */
const NON_RETRYABLE_PATTERNS = [
  'abort',
  'cancel',
  'validation failed',
  'invalid json',
  '400 bad request',
  '401 unauthorized',
  '403 forbidden',
  '404 not found',
  'ssrf',
  'private ip address',
  'disallowed',
];

/**
 * Known retryable error substrings: transient network glitches, 5xx server errors, rate limits.
 */
const RETRYABLE_PATTERNS = [
  '502',
  '503',
  '504',
  '429',
  'rate limit',
  'timeout',
  'timed out',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
  'socket hang up',
  'network error',
  'fetch failed',
];

/**
 * Evaluates whether a node execution failure is eligible for automatic retry.
 */
export function isErrorRetryable(err: unknown, nodeType?: string): boolean {
  if (!err) return false;

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // 1. User cancellation or abort is NEVER retryable
  if (msg.includes('cancel') || msg.includes('abort')) {
    return false;
  }

  // 2. Explicit non-retryable patterns
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (msg.includes(pattern)) {
      return false;
    }
  }

  // 3. Status codes from HTTP responses or error objects
  const statusCode = (err as { statusCode?: number; status?: number })?.statusCode ||
                     (err as { statusCode?: number; status?: number })?.status;
  if (statusCode) {
    if (statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504) {
      return true;
    }
    if (statusCode >= 400 && statusCode < 500) {
      return false; // Standard client errors are non-retryable
    }
  }

  // 4. Retryable pattern matching
  for (const pattern of RETRYABLE_PATTERNS) {
    if (msg.includes(pattern)) {
      return true;
    }
  }

  // 5. HTTP Request nodes are eligible for retry on unexpected network exceptions
  if (nodeType === 'http-request') {
    return true;
  }

  // Pure logic, manual triggers, transforms, and console nodes do not have transient failures
  return false;
}

/**
 * Computes exponential backoff delay with jitter cap.
 */
export function calculateBackoffDelay(attemptNumber: number, config: Partial<NodeRetryConfig> = {}): number {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  if (attemptNumber <= 1) return 0;

  const rawDelay = cfg.initialDelayMs * Math.pow(cfg.backoffFactor, attemptNumber - 2);
  return Math.min(rawDelay, cfg.maxDelayMs);
}

/**
 * Helper to pause execution with abort signal listener.
 */
export function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error('Operation cancelled during retry delay'));

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new Error('Operation cancelled during retry delay'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}
