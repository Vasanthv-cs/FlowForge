import { z } from 'zod';

/* ── Node Types ─────────────────────────────────────── */
export type CustomNodeType =
  | 'manual-trigger'
  | 'http-request'
  | 'transform-data'
  | 'condition'
  | 'delay'
  | 'console-output';

export const customNodeTypeSchema = z.enum([
  'manual-trigger',
  'http-request',
  'transform-data',
  'condition',
  'delay',
  'console-output',
]);

/* ── Manual Trigger Config ──────────────────────────── */
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

export type ManualTriggerConfig = z.infer<typeof manualTriggerSchema>;

/* ── HTTP Request Config ────────────────────────────── */
export const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const httpRequestSchema = z.object({
  method: httpMethodSchema,
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

export type HttpRequestConfig = z.infer<typeof httpRequestSchema>;

/* ── Transform Data Config ──────────────────────────── */
export const transformModeSchema = z.enum([
  'property-path',
  'json-parse',
  'json-stringify',
  'uppercase',
  'lowercase',
  'trim',
]);
export type TransformMode = z.infer<typeof transformModeSchema>;

export const transformDataSchema = z.object({
  mode: transformModeSchema,
  propertyPath: z.string().default(''),
  outputKey: z.string().default('result'),
});

export type TransformDataConfig = z.infer<typeof transformDataSchema>;

/* ── Condition Config ───────────────────────────────── */
export const conditionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
  'starts_with',
  'is_empty',
  'is_not_empty',
]);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const conditionSchema = z.object({
  leftOperand: z.string().min(1, 'Left operand is required'),
  operator: conditionOperatorSchema,
  rightOperand: z.string().default(''),
});

export type ConditionConfig = z.infer<typeof conditionSchema>;

/* ── Delay Config ───────────────────────────────────── */
export const MAX_SAFE_DELAY_MS = 60000; // 60 seconds safe maximum
export const MIN_SAFE_DELAY_MS = 0;

export const delaySchema = z.object({
  delayMs: z
    .number()
    .min(MIN_SAFE_DELAY_MS, 'Delay must be at least 0ms')
    .max(
      MAX_SAFE_DELAY_MS,
      `Delay cannot exceed ${MAX_SAFE_DELAY_MS.toLocaleString()}ms (60s)`,
    ),
});

export type DelayConfig = z.infer<typeof delaySchema>;

/* ── Console Output Config ──────────────────────────── */
export const consoleLogLevelSchema = z.enum(['info', 'warn', 'error', 'log']);
export type ConsoleLogLevel = z.infer<typeof consoleLogLevelSchema>;

export const consoleOutputSchema = z.object({
  level: consoleLogLevelSchema,
  prefix: z.string().default(''),
});

export type ConsoleOutputConfig = z.infer<typeof consoleOutputSchema>;
