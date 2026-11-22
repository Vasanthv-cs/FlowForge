import type { FastifyRequest, FastifyReply } from 'fastify';
import { getSupabaseAdminClient } from '../supabase.ts';
import type { WorkspaceRole } from '../types.ts';
import '../types.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const READ_ROLES: WorkspaceRole[] = ['owner', 'admin', 'developer', 'viewer'];
export const WRITE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'developer'];
export const ADMIN_ROLES: WorkspaceRole[] = ['owner', 'admin'];

/**
 * Factory creating Fastify preHandler hook to verify workspace membership and enforce RBAC.
 * Strictly verifies that the authenticated user belongs to the requested workspace and holds
 * an authorized role before proceeding.
 */
export function requireWorkspaceRole(allowedRoles: WorkspaceRole[] = READ_ROLES) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      await reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required before checking workspace permissions',
      });
      return;
    }

    const params = request.params as { workspaceId?: string };
    const workspaceId = params.workspaceId;

    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      await reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid or missing workspaceId. Must be a valid UUID.',
      });
      return;
    }

    // Query database for membership using admin client to check role directly
    const supabase = getSupabaseAdminClient();
    const { data: member, error } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', request.user.id)
      .maybeSingle();

    if (error || !member) {
      await reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied: You are not a member of this workspace',
      });
      return;
    }

    const currentRole = member.role as WorkspaceRole;
    if (!allowedRoles.includes(currentRole)) {
      if (currentRole === 'viewer') {
        await reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Access denied: Viewers have read-only access and cannot modify or execute workflows',
        });
        return;
      }

      await reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Access denied: Role "${currentRole}" does not have required permissions`,
      });
      return;
    }

    request.workspaceRole = currentRole;
  };
}
