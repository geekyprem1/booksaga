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
  /**
   * Text LLM: any OpenAI-compatible chat-completions endpoint (OpenRouter, OpenAI, DeepSeek,
   * Together, Groq, a local vLLM/Ollama...). The URL is the part before `/chat/completions`.
   */
  TEXT_API_BASE_URL: z.preprocess(emptyToUndefined, z.url().default('https://openrouter.ai/api/v1')),
  TEXT_API_KEY: optionalString,
  TEXT_MODEL: z.preprocess(emptyToUndefined, z.string().default('deepseek/deepseek-v4.1-flash-1017')),
  /**
   * Model for structured, low-creativity steps (chapter facts, continuity, metadata). Falls back to
   * the main model when unset. A non-reasoning model is 3–4× cheaper and 2× faster here.
   */
  TEXT_FAST_MODEL: optionalString,
  /** Reasoning effort (low/medium/high). Lower = fewer hidden reasoning tokens, faster answers. */
  TEXT_REASONING_EFFORT: z.preprocess(emptyToUndefined, z.enum(['low', 'medium', 'high']).optional()),
  REPLICATE_API_TOKEN: optionalString,
  REPLICATE_IMAGE_MODEL: z.literal('openai/gpt-image-2').default('openai/gpt-image-2'),
  REPLICATE_IMAGE_QUALITY: z.literal('low').default('low'),
  REPLICATE_TTS_MODEL: z.string().default('jaaari/kokoro-82m'),

  WORKER_QUEUES: z.string().default('text,image,export,audio,system'),
  WORKER_TEXT_CONCURRENCY: intWithDefault(50),
  WORKER_IMAGE_CONCURRENCY: intWithDefault(5),
  WORKER_EXPORT_CONCURRENCY: intWithDefault(2),
  WORKER_AUDIO_CONCURRENCY: intWithDefault(3),
  WORKER_HEALTH_PORT: intWithDefault(3001),
  /** Chromium binary used for the print PDF (Playwright's download or the Docker path). */
  CHROME_EXECUTABLE_PATH: optionalString,
  TEXT_RPM: intWithDefault(300),
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

export interface TextLlmConfig {
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  /** Undefined when no separate fast model is configured. */
  fastModel: string | undefined;
  reasoningEffort: 'low' | 'medium' | 'high' | undefined;
}

/** Text LLM settings (TEXT_* env vars). */
export function resolveTextLlm(env: ServerEnv): TextLlmConfig {
  return {
    baseUrl: env.TEXT_API_BASE_URL,
    apiKey: env.TEXT_API_KEY,
    model: env.TEXT_MODEL,
    fastModel: env.TEXT_FAST_MODEL,
    reasoningEffort: env.TEXT_REASONING_EFFORT,
  };
}

let cachedServerEnv: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseEnv(serverEnvSchema);
  return cachedServerEnv;
}
