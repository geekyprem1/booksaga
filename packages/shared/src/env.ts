import { z } from 'zod';

/** Treat empty strings (as found in a copied .env.example) as "not set". */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const requiredString = z.string().min(1);
const intWithDefault = (def: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(def));

/** Variables safe to expose to the browser. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString,
});

/** Server-only variables (web server + worker). */
export const serverEnvSchema = publicEnvSchema.extend({
  APP_URL: z.url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: requiredString,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SETTINGS_ENCRYPTION_KEY: optionalString,

  AI_MODE: z.enum(['live', 'mock']).default('live'),
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_TEXT_MODEL: z.string().default('deepseek/deepseek-v4.1-flash-1017'),
  /**
   * Model for structured, low-creativity steps (chapter facts, continuity, metadata). Falls back to
   * the main model when unset. A non-reasoning model is 3–4× cheaper and 2× faster here.
   */
  OPENROUTER_FAST_MODEL: optionalString,
  REPLICATE_API_TOKEN: optionalString,
  REPLICATE_IMAGE_MODEL: z.string().default('openai/gpt-image-2'),
  REPLICATE_IMAGE_QUALITY: z.enum(['low', 'medium', 'high']).default('low'),
  REPLICATE_TTS_MODEL: z.string().default('jaaari/kokoro-82m'),

  WORKER_QUEUES: z.string().default('text,image,export,audio,system'),
  WORKER_TEXT_CONCURRENCY: intWithDefault(50),
  WORKER_IMAGE_CONCURRENCY: intWithDefault(5),
  WORKER_EXPORT_CONCURRENCY: intWithDefault(2),
  WORKER_AUDIO_CONCURRENCY: intWithDefault(3),
  WORKER_HEALTH_PORT: intWithDefault(3001),
  OPENROUTER_RPM: intWithDefault(300),
  REPLICATE_RPM: intWithDefault(120),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parse env vars and fail fast with a readable message listing every problem.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cachedServerEnv: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseEnv(serverEnvSchema);
  return cachedServerEnv;
}
