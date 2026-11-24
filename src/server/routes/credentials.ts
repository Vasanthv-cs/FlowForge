import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES, ADMIN_ROLES } from '../middleware/rbac.ts';
import { credentialVaultService } from '../services/credentialVaultService.ts';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createCredentialBodySchema = z.object({
  name: z.string().min(1, 'Credential name cannot be empty').max(100),
  description: z.string().max(500).optional().nullable(),
  credentialType: z.enum(['api_key', 'bearer_token', 'basic_auth', 'custom_headers']),
  data: z.record(z.string(), z.unknown()),
});

const updateCredentialBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const credentialRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * POST /api/workspaces/:workspaceId/credentials
   * Stores a new secret in the workspace vault.
   * Enforces ADMIN_ROLES ('owner', 'admin').
   */
  app.post(
    '/api/workspaces/:workspaceId/credentials',
    {
      preHandler: [authenticate, requireWorkspaceRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const parseResult = createCredentialBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      try {
        const metadata = await credentialVaultService.createCredential(
          workspaceId,
          request.user?.id || null,
          parseResult.data as unknown as Parameters<typeof credentialVaultService.createCredential>[2]
        );

        return reply.status(201).send({ data: metadata });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 400 ? 'Bad Request' : 'Internal Server Error',
          message: (err as Error).message || 'Failed to create credential',
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/credentials
   * Lists safe metadata for all credentials in the workspace.
   * Enforces READ_ROLES ('owner', 'admin', 'developer', 'viewer').
   */
  app.get(
    '/api/workspaces/:workspaceId/credentials',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      try {
        const list = await credentialVaultService.listCredentials(workspaceId);
        return reply.status(200).send({ data: list });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: 'Internal Server Error',
          message: (err as Error).message || 'Failed to list credentials',
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/credentials/:credentialId
   * Retrieves single credential metadata.
   * Enforces READ_ROLES ('owner', 'admin', 'developer', 'viewer').
   */
  app.get(
    '/api/workspaces/:workspaceId/credentials/:credentialId',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, credentialId } = request.params as {
        workspaceId: string;
        credentialId: string;
      };

      if (!UUID_REGEX.test(credentialId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid credentialId format. Must be a UUID.',
        });
      }

      try {
        const metadata = await credentialVaultService.getCredentialMetadata(workspaceId, credentialId);
        return reply.status(200).send({ data: metadata });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : 'Internal Server Error',
          message: (err as Error).message || 'Failed to retrieve credential metadata',
        });
      }
    }
  );

  /**
   * PUT /api/workspaces/:workspaceId/credentials/:credentialId
   * Updates name/description or rotates the secret.
   * Enforces ADMIN_ROLES ('owner', 'admin').
   */
  app.put(
    '/api/workspaces/:workspaceId/credentials/:credentialId',
    {
      preHandler: [authenticate, requireWorkspaceRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, credentialId } = request.params as {
        workspaceId: string;
        credentialId: string;
      };

      if (!UUID_REGEX.test(credentialId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid credentialId format. Must be a UUID.',
        });
      }

      const parseResult = updateCredentialBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      try {
        const updated = await credentialVaultService.updateCredential(
          workspaceId,
          credentialId,
          parseResult.data as unknown as Parameters<typeof credentialVaultService.updateCredential>[2]
        );
        return reply.status(200).send({ data: updated });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : status === 400 ? 'Bad Request' : 'Internal Server Error',
          message: (err as Error).message || 'Failed to update credential',
        });
      }
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/credentials/:credentialId
   * Removes a credential from the vault.
   * Enforces ADMIN_ROLES ('owner', 'admin').
   */
  app.delete(
    '/api/workspaces/:workspaceId/credentials/:credentialId',
    {
      preHandler: [authenticate, requireWorkspaceRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, credentialId } = request.params as {
        workspaceId: string;
        credentialId: string;
      };

      if (!UUID_REGEX.test(credentialId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid credentialId format. Must be a UUID.',
        });
      }

      try {
        await credentialVaultService.deleteCredential(workspaceId, credentialId);
        return reply.status(200).send({
          success: true,
          message: 'Credential deleted successfully',
        });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : 'Internal Server Error',
          message: (err as Error).message || 'Failed to delete credential',
        });
      }
    }
  );
};
