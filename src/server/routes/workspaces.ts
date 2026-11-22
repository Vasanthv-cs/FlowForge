import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES, WRITE_ROLES } from '../middleware/rbac.ts';
import { workspaceService } from '../services/workspaceService.ts';
import { getSupabaseAdminClient } from '../supabase.ts';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createWorkflowBodySchema = z.object({
  name: z.string().min(1, 'Workflow name cannot be empty').max(100),
  description: z.string().max(500).optional(),
  definition: z.record(z.string(), z.unknown()).optional(),
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

      return reply.status(201).send({ workflow: data });
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
};
