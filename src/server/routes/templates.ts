import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES, WRITE_ROLES, ADMIN_ROLES } from '../middleware/rbac.ts';
import { templateService } from '../services/templateService.ts';
import { validateWorkflowTemplate } from '@flowforge/workflow-schema';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createTemplateBodySchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional().default(''),
  category: z.string().optional().default('general'),
  icon: z.string().optional().default('Workflow'),
  color: z.string().optional().default('#6366f1'),
  definition: z.record(z.string(), z.unknown()),
  requiredConfig: z.array(z.string()).optional(),
  requiredEnvVars: z.array(z.string()).optional(),
});

export const templateRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/workspaces/:workspaceId/templates
   * Lists available starter and workspace templates.
   */
  app.get(
    '/api/workspaces/:workspaceId/templates',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const query = request.query as { category?: string; search?: string };

      if (!UUID_REGEX.test(workspaceId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workspaceId. Must be a valid UUID.',
        });
      }

      const templates = await templateService.listTemplates(workspaceId, {
        category: query.category,
        search: query.search,
      });

      return reply.status(200).send({ templates });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/templates/:templateId
   * Retrieves single template details.
   */
  app.get(
    '/api/workspaces/:workspaceId/templates/:templateId',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, templateId } = request.params as {
        workspaceId: string;
        templateId: string;
      };

      if (!UUID_REGEX.test(workspaceId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workspaceId. Must be a valid UUID.',
        });
      }

      const template = await templateService.getTemplate(workspaceId, templateId);
      if (!template) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Template not found.',
        });
      }

      return reply.status(200).send({ template });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/templates
   * Creates a private workspace template from a workflow.
   */
  app.post(
    '/api/workspaces/:workspaceId/templates',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      if (!UUID_REGEX.test(workspaceId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workspaceId. Must be a valid UUID.',
        });
      }

      const parseResult = createTemplateBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parseResult.error.issues.map((i) => i.message).join(', '),
        });
      }

      try {
        const result = await templateService.createWorkspaceTemplate(
          workspaceId,
          parseResult.data,
          request.user?.id
        );
        return reply.status(201).send(result);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        const statusCode = errorObj.statusCode || 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 400 ? 'Bad Request' : 'InternalServerError',
          message: errorObj.message || 'Failed to save workspace template',
        });
      }
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/templates/:templateId
   * Deletes a workspace private template.
   */
  app.delete(
    '/api/workspaces/:workspaceId/templates/:templateId',
    {
      preHandler: [authenticate, requireWorkspaceRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, templateId } = request.params as {
        workspaceId: string;
        templateId: string;
      };

      if (!UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(templateId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'workspaceId and templateId must be valid UUIDs.',
        });
      }

      try {
        await templateService.deleteWorkspaceTemplate(workspaceId, templateId);
        return reply.status(200).send({ success: true, message: 'Template deleted successfully.' });
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; message?: string };
        return reply.status(500).send({
          statusCode: 500,
          error: 'InternalServerError',
          message: errorObj.message || 'Failed to delete template',
        });
      }
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/templates/validate
   * Validates a candidate workflow template without saving.
   */
  app.post(
    '/api/workspaces/:workspaceId/templates/validate',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (_request, reply) => {
      const report = validateWorkflowTemplate(_request.body);
      return reply.status(200).send({ validation: report });
    }
  );
};
