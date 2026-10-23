import { describe, expect, it } from 'vitest';
import { parseEnv, serverEnvSchema } from './env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(serverEnvSchema, valid);
    expect(env.WORKER_TEXT_CONCURRENCY).toBe(50);
    expect(env.WORKER_EXPORT_CONCURRENCY).toBe(2);
    expect(env.OPENROUTER_TEXT_MODEL).toBe('deepseek/deepseek-v4.1-flash-1017');
    expect(env.AI_MODE).toBe('live');
  });

  it('treats empty strings from a copied .env.example as unset', () => {
    const env = parseEnv(serverEnvSchema, {
      ...valid,
      OPENROUTER_API_KEY: '',
      WORKER_TEXT_CONCURRENCY: '',
    });
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.WORKER_TEXT_CONCURRENCY).toBe(50);
  });

  it('fails fast listing every missing variable', () => {
    expect(() => parseEnv(serverEnvSchema, {})).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseEnv(serverEnvSchema, {})).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
