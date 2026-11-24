import { z } from 'zod';

/* ── Node Types ─────────────────────────────────────── */
export type CustomNodeType =
  | 'manual-trigger'
  | 'webhook-trigger'
  | 'schedule-trigger'
  | 'http-request'
  | 'transform-data'
  | 'condition'
  | 'delay'
  | 'console-output'
  | 'json-parse'
  | 'json-stringify'
  | 'set-data'
  | 'merge-data'
  | 'filter-data'
  | 'map-data'
  | 'string-operations'
  | 'date-time'
  | 'math-operations'
  | 'webhook-response';

export const customNodeTypeSchema = z.enum([
  'manual-trigger',
  'webhook-trigger',
  'schedule-trigger',
  'http-request',
  'transform-data',
  'condition',
  'delay',
  'console-output',
  'json-parse',
  'json-stringify',
  'set-data',
  'merge-data',
  'filter-data',
  'map-data',
  'string-operations',
  'date-time',
  'math-operations',
  'webhook-response',
]);

/* ── Manual Trigger Config ──────────────────────────── */
export const manualTriggerSchema = z.object({
  payload: z
    .string()
    .default('{}')
    .refine(
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
  queryParams: z.record(z.string(), z.string()).optional().default({}),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().default(''),
  credentialId: z.string().uuid().optional().nullable(),
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

/* ── Webhook Trigger Config ─────────────────────────── */
export const webhookAuthTypeSchema = z.enum(['none', 'header-secret', 'bearer-token', 'hmac-sha256']);
export type WebhookAuthType = z.infer<typeof webhookAuthTypeSchema>;

export const webhookHttpMethodSchema = z.enum(['POST', 'GET', 'PUT', 'ALL']);
export type WebhookHttpMethod = z.infer<typeof webhookHttpMethodSchema>;

export const webhookRespondModeSchema = z.enum(['immediate', 'sync']);
export type WebhookRespondMode = z.infer<typeof webhookRespondModeSchema>;

export const webhookTriggerSchema = z.object({
  path: z
    .string()
    .min(3, 'Webhook path must be at least 3 characters')
    .max(100, 'Webhook path must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Webhook path may only contain alphanumeric characters, hyphens, and underscores'),
  httpMethod: webhookHttpMethodSchema.default('POST'),
  authType: webhookAuthTypeSchema.default('none'),
  secret: z.string().optional().default(''),
  headerName: z.string().min(1).default('X-Webhook-Secret'),
  respondMode: webhookRespondModeSchema.default('immediate'),
});

export type WebhookTriggerConfig = z.infer<typeof webhookTriggerSchema>;

/* ── Schedule Trigger Config ────────────────────────── */
export const scheduleTriggerSchema = z.object({
  cron: z.string().min(1, 'Cron expression is required').default('0 * * * *'),
  timezone: z.string().min(1).default('UTC'),
  enabled: z.boolean().default(true),
  defaultPayload: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === '') return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Default payload must be valid JSON or empty' }
    ),
});

export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerSchema>;

/* ── 7. JSON Parse Config ────────────────────────────── */
export const jsonParseSchema = z.object({
  inputPath: z.string().default(''),
  outputKey: z.string().min(1, 'Output key cannot be empty').default('parsed'),
});
export type JsonParseConfig = z.infer<typeof jsonParseSchema>;

/* ── 8. JSON Stringify Config ────────────────────────── */
export const jsonStringifySchema = z.object({
  inputPath: z.string().default(''),
  outputKey: z.string().min(1, 'Output key cannot be empty').default('jsonString'),
  prettyPrint: z.boolean().default(false),
  indentSpaces: z.number().int().min(0).max(8).default(2),
});
export type JsonStringifyConfig = z.infer<typeof jsonStringifySchema>;

/* ── 9. Set Data Config ──────────────────────────────── */
export const setFieldMappingSchema = z.object({
  key: z.string().min(1, 'Field key is required'),
  value: z.string().default(''),
  valueType: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
});
export type SetFieldMapping = z.infer<typeof setFieldMappingSchema>;

export const setDataSchema = z.object({
  fields: z.array(setFieldMappingSchema).default([]),
  mergeWithIncoming: z.boolean().default(true),
});
export type SetDataConfig = z.infer<typeof setDataSchema>;

/* ── 10. Merge Data Config ───────────────────────────── */
export const mergeStrategySchema = z.enum(['shallow', 'deep']);
export type MergeStrategy = z.infer<typeof mergeStrategySchema>;

export const conflictResolutionSchema = z.enum(['overwrite', 'keep_original', 'error']);
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

export const mergeDataSchema = z.object({
  strategy: mergeStrategySchema.default('shallow'),
  conflictResolution: conflictResolutionSchema.default('overwrite'),
  secondaryData: z.string().default(''),
});
export type MergeDataConfig = z.infer<typeof mergeDataSchema>;

/* ── 11. Filter Data Config ──────────────────────────── */
export const filterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'contains',
  'starts_with',
  'is_empty',
  'is_not_empty',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const filterDataSchema = z.object({
  arrayPath: z.string().default(''),
  itemField: z.string().default(''),
  operator: filterOperatorSchema.default('equals'),
  targetValue: z.string().default(''),
  outputKey: z.string().min(1, 'Output key is required').default('filtered'),
});
export type FilterDataConfig = z.infer<typeof filterDataSchema>;

/* ── 12. Map Data Config ─────────────────────────────── */
export const mapFieldMappingSchema = z.object({
  sourceField: z.string().min(1, 'Source field is required'),
  targetField: z.string().min(1, 'Target field is required'),
});
export type MapFieldMapping = z.infer<typeof mapFieldMappingSchema>;

export const mapDataSchema = z.object({
  arrayPath: z.string().default(''),
  mappings: z.array(mapFieldMappingSchema).default([]),
  outputKey: z.string().min(1, 'Output key is required').default('mapped'),
});
export type MapDataConfig = z.infer<typeof mapDataSchema>;

/* ── 13. String Operations Config ────────────────────── */
export const stringOperationTypeSchema = z.enum([
  'trim',
  'uppercase',
  'lowercase',
  'replace',
  'split',
  'join',
]);
export type StringOperationType = z.infer<typeof stringOperationTypeSchema>;

export const stringOperationsSchema = z.object({
  operation: stringOperationTypeSchema.default('trim'),
  inputPath: z.string().default(''),
  outputKey: z.string().min(1, 'Output key is required').default('result'),
  findText: z.string().optional().default(''),
  replaceWith: z.string().optional().default(''),
  separator: z.string().optional().default(','),
});
export type StringOperationsConfig = z.infer<typeof stringOperationsSchema>;

/* ── 14. Date and Time Config ────────────────────────── */
export const dateOperationTypeSchema = z.enum([
  'current_timestamp',
  'format',
  'add',
  'subtract',
]);
export type DateOperationType = z.infer<typeof dateOperationTypeSchema>;

export const dateFormatSchema = z.enum([
  'iso',
  'utc_string',
  'timestamp_ms',
  'date_only',
  'time_only',
]);
export type DateFormat = z.infer<typeof dateFormatSchema>;

export const dateUnitSchema = z.enum(['seconds', 'minutes', 'hours', 'days']);
export type DateUnit = z.infer<typeof dateUnitSchema>;

export const dateTimeSchema = z.object({
  operation: dateOperationTypeSchema.default('current_timestamp'),
  inputDate: z.string().optional().default(''),
  outputFormat: dateFormatSchema.default('iso'),
  amount: z.number().default(0),
  unit: dateUnitSchema.default('hours'),
  outputKey: z.string().min(1, 'Output key is required').default('timestamp'),
});
export type DateTimeConfig = z.infer<typeof dateTimeSchema>;

/* ── 15. Math Operations Config ──────────────────────── */
export const mathOperationTypeSchema = z.enum([
  'add',
  'subtract',
  'multiply',
  'divide',
  'round',
  'min',
  'max',
]);
export type MathOperationType = z.infer<typeof mathOperationTypeSchema>;

export const mathOperationsSchema = z.object({
  operation: mathOperationTypeSchema.default('add'),
  leftOperand: z.string().min(1, 'Left operand is required').default('0'),
  rightOperand: z.string().optional().default('0'),
  precision: z.number().int().min(0).max(10).default(2),
  outputKey: z.string().min(1, 'Output key is required').default('result'),
});
export type MathOperationsConfig = z.infer<typeof mathOperationsSchema>;

/* ── 16. Webhook Response Config ─────────────────────── */
export const webhookResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string(), z.string()).default({ 'Content-Type': 'application/json' }),
  body: z.string().default('{\n  "status": "success"\n}'),
});
export type WebhookResponseConfig = z.infer<typeof webhookResponseSchema>;

