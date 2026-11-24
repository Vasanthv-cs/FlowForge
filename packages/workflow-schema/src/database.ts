import { z } from 'zod';
import type { SavedWorkflow } from './workflow';

/* ── Workspace Roles ─────────────────────────────────────────── */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'developer', 'viewer']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/* ── Execution Statuses ───────────────────────────────────────── */
export const executionStatusSchema = z.enum([
  'queued',
  'running',
  'success',
  'failed',
  'cancelled',
  'waiting',
  'interrupted',
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

/* ── Profiles ─────────────────────────────────────────────────── */
export const profileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

/* ── Workspaces ───────────────────────────────────────────────── */
export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

/* ── Workspace Members ────────────────────────────────────────── */
export const workspaceMemberSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: workspaceRoleSchema,
  createdAt: z.string(),
});
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;

/* ── Workflow DB Row ─────────────────────────────────────────── */
export const workflowRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  definition: z.record(z.string(), z.unknown()),
  isActive: z.boolean().default(true).optional(),
  createdBy: z.string().uuid().nullable().optional(),
  updatedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowRow = z.infer<typeof workflowRowSchema> & {
  definition: SavedWorkflow;
};

/* ── Workflow Webhook Row ────────────────────────────────────── */
export const workflowWebhookRowSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  nodeId: z.string(),
  path: z.string(),
  httpMethod: z.enum(['POST', 'GET', 'PUT', 'ALL']),
  authType: z.enum(['none', 'header-secret', 'bearer-token', 'hmac-sha256']),
  secretToken: z.string().nullable().optional(),
  headerName: z.string().default('X-Webhook-Secret'),
  respondMode: z.enum(['immediate', 'sync']).default('immediate'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowWebhookRow = z.infer<typeof workflowWebhookRowSchema>;

/* ── Workflow Schedule Row ───────────────────────────────────── */
export const workflowScheduleRowSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  nodeId: z.string(),
  cronExpression: z.string(),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
  lastRunAt: z.string().nullable().optional(),
  nextRunAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowScheduleRow = z.infer<typeof workflowScheduleRowSchema>;

/* ── Schedule Row ───────────────────────────────────────────── */
export const scheduleStatusSchema = z.enum(['active', 'paused', 'completed']);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const scheduleTypeSchema = z.enum(['one_time', 'recurring']);
export type ScheduleType = z.infer<typeof scheduleTypeSchema>;

export const missedRunPolicySchema = z.enum(['skip', 'run_once']);
export type MissedRunPolicy = z.infer<typeof missedRunPolicySchema>;

export const scheduleRowSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  name: z.string().min(1),
  scheduleType: scheduleTypeSchema,
  cronExpression: z.string().nullable().optional(),
  oneTimeRunAt: z.string().nullable().optional(),
  timezone: z.string().default('UTC'),
  status: scheduleStatusSchema,
  missedRunPolicy: missedRunPolicySchema,
  nextRunAt: z.string().nullable().optional(),
  lastRunAt: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScheduleRow = z.infer<typeof scheduleRowSchema>;

/* ── Workflow Version Row ────────────────────────────────────── */
export const workflowVersionRowSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  name: z.string().nullable().optional(),
  definition: z.record(z.string(), z.unknown()),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type WorkflowVersionRow = z.infer<typeof workflowVersionRowSchema> & {
  definition: SavedWorkflow;
};

/* ── Execution Row ───────────────────────────────────────────── */
export const executionRowSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowVersionId: z.string().uuid().nullable().optional(),
  status: executionStatusSchema,
  triggerType: z.string(),
  inputPayload: z.unknown().nullable().optional(),
  outputPayload: z.unknown().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  workerId: z.string().nullable().optional(),
  leaseExpiresAt: z.string().nullable().optional(),
  lastHeartbeatAt: z.string().nullable().optional(),
  retryCount: z.number().int().optional(),
  maxRetries: z.number().int().optional(),
  cancellationRequested: z.boolean().optional(),
  cancellationReason: z.string().nullable().optional(),
  availableAt: z.string().optional(),
  scheduleId: z.string().uuid().nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
});
export type ExecutionRow = z.infer<typeof executionRowSchema>;

/* ── Node Execution Row ──────────────────────────────────────── */
export const nodeExecutionRowSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  nodeId: z.string(),
  nodeType: z.string(),
  nodeLabel: z.string().nullable().optional(),
  status: z.string(),
  inputPayload: z.unknown().nullable().optional(),
  outputPayload: z.unknown().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  retryCount: z.number().int().optional(),
  maxRetries: z.number().int().optional(),
  retryHistory: z.unknown().optional(),
});
export type NodeExecutionRow = z.infer<typeof nodeExecutionRowSchema>;

/* ── Execution Event Row ─────────────────────────────────────── */
export const executionEventRowSchema = z.object({
  id: z.number().int(),
  executionId: z.string().uuid(),
  nodeId: z.string().nullable().optional(),
  eventType: z.string(),
  message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type ExecutionEventRow = z.infer<typeof executionEventRowSchema>;

/* ── Credential Types & Schema ───────────────────────────────── */
export const credentialTypeSchema = z.enum([
  'api_key',
  'bearer_token',
  'basic_auth',
  'custom_headers',
]);
export type CredentialType = z.infer<typeof credentialTypeSchema>;

export const credentialMetadataSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1, 'Credential name is required'),
  description: z.string().nullable().optional(),
  credentialType: credentialTypeSchema,
  keyVersion: z.string().default('v1'),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;

export const credentialRowSchema = credentialMetadataSchema.extend({
  encryptedData: z.string(),
  iv: z.string(),
  authTag: z.string(),
});
export type CredentialRow = z.infer<typeof credentialRowSchema>;

