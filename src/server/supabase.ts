import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { loadConfig } from './config.ts';

let adminClientInstance: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client for privileged or system operations.
 * Uses SUPABASE_SERVICE_ROLE_KEY if available, falling back to SUPABASE_ANON_KEY.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClientInstance) {
    return adminClientInstance;
  }

  const config = loadConfig();
  const key = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_ANON_KEY;

  if (!config.SUPABASE_URL || !key) {
    throw new Error('Supabase URL or Key is missing in server environment configuration.');
  }

  adminClientInstance = createClient(config.SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'flowforge-server-admin',
    },
  });

  return adminClientInstance;
}

/**
 * Creates a per-request Supabase client scoped to the authenticated user's JWT.
 * This client inherits the user's RLS permissions and identity for Postgres queries.
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const config = loadConfig();
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `flowforge-user-${accessToken.slice(-8)}`,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Validates a Supabase JWT access token directly with Supabase Auth service.
 * Verifies cryptographic signature, expiration, and user revocation status.
 * Never trusts a client-supplied user ID.
 */
export async function verifyAccessToken(
  token: string,
  clientOverride?: SupabaseClient
): Promise<{ user: User | null; error: string | null }> {
  try {
    if (!token || typeof token !== 'string') {
      return { user: null, error: 'Token is missing or empty' };
    }

    const client = clientOverride || getSupabaseAdminClient();
    const { data, error } = await client.auth.getUser(token);

    if (error || !data.user) {
      return {
        user: null,
        error: error?.message || 'Invalid or expired authentication token',
      };
    }

    return { user: data.user, error: null };
  } catch (err) {
    return {
      user: null,
      error: err instanceof Error ? err.message : 'Token verification failed',
    };
  }
}
