import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES, WRITE_ROLES } from '../middleware/rbac.ts';
import { workspaceService } from '../services/workspaceService.ts';
import { executionEngineService } from '../services/executionEngineService.ts';
import { webhookService } from '../services/webhookService.ts';
import { workflowSchedulerService } from '../services/workflowSchedulerService.ts';
import { getSupabaseAdminClient } from '../supabase.ts';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createWorkflowBodySchema = z.object({
  name: z.string().min(1, 'Workflow name cannot be empty').max(100),
  description: z.string().max(500).optional(),
  definition: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const updateWorkflowBodySchema = z.object({
  name: z.string().min(1, 'Workflow name cannot be empty').max(100).optional(),
  description: z.string().max(500).optional(),
  definition: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const executeWorkflowBodySchema = z.object({
  versionId: z.string().regex(UUID_REGEX, 'versionId must be a valid UUID').optional(),
  triggerPayload: z.record(z.string(), z.unknown()).optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * GET /api/workspaces/:workspaceId/workflows
   * List workflows belonging to the workspace.
   */
  app.get(
    '/api/workspaces/:workspaceId/workflows',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const workflows = await workspaceService.listWorkflows(workspaceId);
      return reply.status(200).send({ workflows });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/workflows/:workflowId
   * Retrieve a single workflow by ID.
   * Strictly enforces workspace isolation (returns 404 if workflow belongs to another workspace).
   */
  app.get(
    '/api/workspaces/:workspaceId/workflows/:workflowId',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params as {
        workspaceId: string;
        workflowId: string;
      };

      if (!UUID_REGEX.test(workflowId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workflowId. Must be a valid UUID.',
        });
      }

      const workflow = await workspaceService.getWorkflow(workspaceId, workflowId);
      if (!workflow) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow not found in this workspace',
        });
      }

      return reply.status(200).send({ workflow });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/workflows
   * Create a new workflow in the workspace.
   * Strictly enforces WRITE_ROLES: Viewers are rejected with 403.
   */
  app.post(
    '/api/workspaces/:workspaceId/workflows',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const parseResult = createWorkflowBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      const supabase = getSupabaseAdminClient();
      const { data, error } = await supabase
        .from('workflows')
        .insert({
          workspace_id: workspaceId,
          name: parseResult.data.name,
          description: parseResult.data.description || null,
          definition: parseResult.data.definition || { nodes: [], edges: [] },
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: error.message,
        });
      }

      if (data?.id) {
        const nodes = ((parseResult.data.definition?.nodes as unknown[]) || []) as Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }>;
        void webhookService.syncWorkflowWebhooks(workspaceId, data.id, nodes).catch(() => {});
        void workflowSchedulerService.syncWorkflowSchedules(workspaceId, data.id, nodes).catch(() => {});
      }

      return reply.status(201).send({ workflow: data });
    }
  );

  /**
   * PUT /api/workspaces/:workspaceId/workflows/:workflowId
   * Updates an existing workflow and syncs triggers (webhooks/schedules).
   */
  app.put(
    '/api/workspaces/:workspaceId/workflows/:workflowId',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params as {
        workspaceId: string;
        workflowId: string;
      };

      if (!UUID_REGEX.test(workflowId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workflowId. Must be a valid UUID.',
        });
      }

      const parseResult = updateWorkflowBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      const supabase = getSupabaseAdminClient();
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (parseResult.data.name !== undefined) updateData.name = parseResult.data.name;
      if (parseResult.data.description !== undefined) updateData.description = parseResult.data.description;
      if (parseResult.data.definition !== undefined) updateData.definition = parseResult.data.definition;
      if (parseResult.data.isActive !== undefined) updateData.is_active = parseResult.data.isActive;

      const { data, error } = await supabase
        .from('workflows')
        .update(updateData)
        .eq('id', workflowId)
        .eq('workspace_id', workspaceId)
        .select()
        .maybeSingle();

      if (error) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: error.message,
        });
      }

      if (!data) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow not found in this workspace',
        });
      }

      if (parseResult.data.definition?.nodes) {
        const nodes = (parseResult.data.definition.nodes as unknown[]) as Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }>;
        void webhookService.syncWorkflowWebhooks(workspaceId, workflowId, nodes).catch(() => {});
        void workflowSchedulerService.syncWorkflowSchedules(workspaceId, workflowId, nodes).catch(() => {});
      }

      return reply.status(200).send({ workflow: data });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/workflows/:workflowId/execute
   * Executes a workflow server-side using the authoritative saved definition or immutable version.
   * Enforces WRITE_ROLES (rejects Viewers with 403), captures exact snapshot, and initiates execution.
   */
  app.post(
    '/api/workspaces/:workspaceId/workflows/:workflowId/execute',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params as {
        workspaceId: string;
        workflowId: string;
      };
      const query = (request.query || {}) as { wait?: string };

      if (!UUID_REGEX.test(workflowId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workflowId. Must be a valid UUID.',
        });
      }

      const bodyParse = executeWorkflowBodySchema.safeParse(request.body || {});
      if (!bodyParse.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid execution request payload',
          issues: bodyParse.error.issues,
        });
      }

      try {
        const execution = await executionEngineService.startWorkflowExecution({
          workspaceId,
          workflowId,
          versionId: bodyParse.data.versionId,
          triggerPayload: bodyParse.data.triggerPayload,
          userId: request.user?.id,
          waitForCompletion: query.wait === 'true',
        });

        const status = query.wait === 'true' ? 200 : 202;
        return reply.status(status).send({
          executionId: execution.executionId,
          status: execution.status,
          startedAt: execution.startedAt,
          workflowId,
          workspaceId,
          result: execution.result,
        });
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        const statusCode = errorObj.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : statusCode === 429 ? 'Too Many Requests' : 'Bad Request',
          message: errorObj.message || 'Execution initiation failed',
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/executions
   * List executions belonging to the workspace.
   */
  app.get(
    '/api/workspaces/:workspaceId/executions',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const query = request.query as { status?: string; limit?: string; offset?: string };

      const executions = await workspaceService.listExecutions(workspaceId, {
        status: query.status,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });

      return reply.status(200).send({ executions });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/executions/:executionId
   * Retrieve single execution details including node runs and timeline events.
   * Strictly enforces workspace isolation (returns 404 if execution belongs to another workspace).
   */
  app.get(
    '/api/workspaces/:workspaceId/executions/:executionId',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, executionId } = request.params as {
        workspaceId: string;
        executionId: string;
      };

      if (!UUID_REGEX.test(executionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid executionId. Must be a valid UUID.',
        });
      }

      const execution = await workspaceService.getExecution(workspaceId, executionId);
      if (!execution) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Execution not found in this workspace',
        });
      }

      return reply.status(200).send({ execution });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/executions/:executionId/status
   * Lightweight status poll endpoint for active runs.
   */
  app.get(
    '/api/workspaces/:workspaceId/executions/:executionId/status',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, executionId } = request.params as {
        workspaceId: string;
        executionId: string;
      };

      if (!UUID_REGEX.test(executionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid executionId. Must be a valid UUID.',
        });
      }

      const status = await workspaceService.getExecutionStatus(workspaceId, executionId);
      if (!status) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Execution not found in this workspace',
        });
      }

      return reply.status(200).send({ status });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/executions/:executionId/cancel
   * Safely cancels an active or running execution.
   */
  app.post(
    '/api/workspaces/:workspaceId/executions/:executionId/cancel',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, executionId } = request.params as {
        workspaceId: string;
        executionId: string;
      };

      if (!UUID_REGEX.test(executionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid executionId. Must be a valid UUID.',
        });
      }

      try {
        const result = await executionEngineService.cancelExecution(workspaceId, executionId);
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        const statusCode = errorObj.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 404 ? 'Not Found' : 'InternalServerError',
          message: errorObj.message || 'Failed to cancel execution',
        });
      }
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/executions/:executionId/replay
   * Replays a past execution starting from a designated targetNodeId.
   * Reuses upstream outputs, executes downstream nodes fresh,
   * enforces safe replay mode by default (auto-mocking external requests with recorded outputs),
   * links the execution lineage via metadata, and preserves the original execution record.
   */
  app.post(
    '/api/workspaces/:workspaceId/executions/:executionId/replay',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, executionId } = request.params as {
        workspaceId: string;
        executionId: string;
      };

      if (!UUID_REGEX.test(executionId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid executionId. Must be a valid UUID.',
        });
      }

      const body = (request.body || {}) as {
        targetNodeId?: string;
        editedInput?: Record<string, unknown>;
        safeReplay?: boolean;
        waitForCompletion?: boolean;
      };

      if (!body.targetNodeId || typeof body.targetNodeId !== 'string') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'targetNodeId is required and must be a string.',
        });
      }

      try {
        const result = await executionEngineService.replayWorkflowExecution({
          workspaceId,
          originalExecutionId: executionId,
          targetNodeId: body.targetNodeId,
          editedInput: body.editedInput,
          safeReplay: body.safeReplay !== false,
          userId: request.user?.id,
          waitForCompletion: body.waitForCompletion,
        });

        return reply.status(200).send(result);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        const statusCode = errorObj.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error:
            statusCode === 404
              ? 'Not Found'
              : statusCode === 400
              ? 'Bad Request'
              : statusCode === 429
              ? 'TooManyRequests'
              : 'InternalServerError',
          message: errorObj.message || 'Failed to replay workflow execution',
        });
      }
    }
  );
};
