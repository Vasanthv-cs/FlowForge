import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, getSupabaseUserClient } from '../supabase.ts';
import '../types.ts';

/**
 * Fastify preHandler hook for Supabase JWT authentication.
 * Rejects missing, malformed, or expired tokens.
 * Derives user identity strictly from the verified JWT payload.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    await reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
    return;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    await reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected "Bearer <token>"',
    });
    return;
  }

  const token = parts[1];
  const { user, error } = await verifyAccessToken(token);

  if (error || !user) {
    await reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: error || 'Invalid or expired session token',
    });
    return;
  }

  request.user = {
    id: user.id,
    email: user.email,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  };
  request.token = token;
  request.supabaseClient = getSupabaseUserClient(token);
}
