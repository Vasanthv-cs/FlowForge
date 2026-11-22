import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url().default(process.env.VITE_SUPABASE_URL || 'https://rnkaowxaaxdzumliicku.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default(process.env.VITE_SUPABASE_ANON_KEY || ''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  BODY_LIMIT: z.coerce.number().default(1048576), // 1MB
});

export type ServerConfig = z.infer<typeof envSchema>;

let cachedConfig: ServerConfig | null = null;

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
  });

  if (env === process.env) {
    cachedConfig = parsed;
  }
  return parsed;
}
