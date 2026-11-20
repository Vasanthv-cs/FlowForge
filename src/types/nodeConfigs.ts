import { z } from 'zod';

/* ── Node Types ─────────────────────────────────────── */
export type CustomNodeType =
  | 'manual-trigger'
  | 'http-request'
  | 'transform-data'
  | 'condition'
  | 'delay'
  | 'console-output';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error';

/* ── Manual Trigger Config ──────────────────────────── */
export interface ManualTriggerConfig {
  payload: string; // JSON string
}

export const manualTriggerSchema = z.object({
  payload: z.string().refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Payload must be valid JSON or empty' },
  ),
});

/* ── HTTP Request Config ────────────────────────────── */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestConfig {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export const httpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z
    .string()
    .min(1, 'URL is required')
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'URL must be a valid HTTP or HTTPS address' },
    ),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default(''),
  timeoutMs: z
    .number()
    .min(100, 'Timeout must be at least 100ms')
    .max(60000, 'Timeout cannot exceed 60,000ms (60s)'),
});

/* ── Transform Data Config ──────────────────────────── */
export type TransformMode =
  | 'property-path'
  | 'json-parse'
  | 'json-stringify'
  | 'uppercase'
  | 'lowercase'
  | 'trim';

export interface TransformDataConfig {
  mode: TransformMode;
  propertyPath: string; // e.g., "data.user.name" or "items"
  outputKey: string;    // destination property name
}

export const transformDataSchema = z.object({
  mode: z.enum([
    'property-path',
    'json-parse',
    'json-stringify',
    'uppercase',
    'lowercase',
    'trim',
  ]),
  propertyPath: z.string().default(''),
  outputKey: z.string().default('result'),
});

/* ── Condition Config ───────────────────────────────── */
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'is_empty'
  | 'is_not_empty';

export interface ConditionConfig {
  leftOperand: string; // e.g. "status" or "{{input.code}}"
  operator: ConditionOperator;
  rightOperand: string; // e.g. "200" or "active"
}

export const conditionSchema = z.object({
  leftOperand: z.string().min(1, 'Left operand is required'),
  operator: z.enum([
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'contains',
    'starts_with',
    'is_empty',
    'is_not_empty',
  ]),
  rightOperand: z.string().default(''),
});

/* ── Delay Config ───────────────────────────────────── */
export const MAX_SAFE_DELAY_MS = 60000; // 60 seconds safe maximum
export const MIN_SAFE_DELAY_MS = 0;

export interface DelayConfig {
  delayMs: number;
}

export const delaySchema = z.object({
  delayMs: z
    .number()
    .min(MIN_SAFE_DELAY_MS, 'Delay must be at least 0ms')
    .max(
      MAX_SAFE_DELAY_MS,
      `Delay cannot exceed ${MAX_SAFE_DELAY_MS.toLocaleString()}ms (60s)`,
    ),
});

/* ── Console Output Config ──────────────────────────── */
export type ConsoleLogLevel = 'info' | 'warn' | 'error' | 'log';

export interface ConsoleOutputConfig {
  level: ConsoleLogLevel;
  prefix: string;
}

export const consoleOutputSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'log']),
  prefix: z.string().default(''),
});
