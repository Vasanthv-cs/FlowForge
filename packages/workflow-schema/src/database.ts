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
  createdBy: z.string().uuid().nullable().optional(),
  updatedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowRow = z.infer<typeof workflowRowSchema> & {
  definition: SavedWorkflow;
};

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
