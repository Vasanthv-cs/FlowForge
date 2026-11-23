import { z } from 'zod';

/**
 * Splits comma-separated CORS origins into an array or returns a single trimmed origin.
 */
export function parseCorsOrigins(corsOrigin: string): string[] | string {
  if (corsOrigin.includes(',')) {
    const list = corsOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return list.length > 1 ? list : list[0] || '*';
  }
  return corsOrigin.trim();
}

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('127.0.0.1'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SUPABASE_URL: z.string().url().default(process.env.VITE_SUPABASE_URL || 'https://rnkaowxaaxdzumliicku.supabase.co'),
    SUPABASE_ANON_KEY: z.string().default(process.env.VITE_SUPABASE_ANON_KEY || ''),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    BODY_LIMIT: z.coerce.number().default(1048576), // 1MB
    ENFORCE_HTTPS: z.coerce.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // Strict production safeguards: prevent insecure defaults from reaching production
    if (data.NODE_ENV === 'production') {
      if (!data.SUPABASE_SERVICE_ROLE_KEY || data.SUPABASE_SERVICE_ROLE_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SUPABASE_SERVICE_ROLE_KEY is required in production for secure server execution.',
          path: ['SUPABASE_SERVICE_ROLE_KEY'],
        });
      }
      if (!data.SUPABASE_ANON_KEY || data.SUPABASE_ANON_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SUPABASE_ANON_KEY is required in production.',
          path: ['SUPABASE_ANON_KEY'],
        });
      }
      if (
        !data.CORS_ORIGIN ||
        data.CORS_ORIGIN.trim() === '' ||
        data.CORS_ORIGIN === 'http://localhost:5173'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'CORS_ORIGIN must be explicitly configured with production origins (cannot default to localhost in production).',
          path: ['CORS_ORIGIN'],
        });
      }
    }
  });

export type ServerConfig = z.infer<typeof envSchema>;

let cachedConfig: ServerConfig | null = null;

export function resetConfigCache(): void {
  cachedConfig = null;
}

export function loadConfig(env = process.env): ServerConfig {
  if (cachedConfig && env === process.env) {
    return cachedConfig;
  }
  const parsed = envSchema.parse({
    PORT: env.PORT,
    HOST: env.HOST,
    NODE_ENV: env.NODE_ENV,
    SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    CORS_ORIGIN: env.CORS_ORIGIN,
    RATE_LIMIT_MAX: env.RATE_LIMIT_MAX,
    BODY_LIMIT: env.BODY_LIMIT,
    ENFORCE_HTTPS: env.ENFORCE_HTTPS,
  });

  if (env === process.env) {
    cachedConfig = parsed;
  }
  return parsed;
}
