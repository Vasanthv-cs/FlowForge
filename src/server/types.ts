import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'viewer';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    token?: string;
    workspaceRole?: WorkspaceRole;
    supabaseClient?: SupabaseClient;
  }
}
