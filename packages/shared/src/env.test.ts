import { describe, expect, it } from 'vitest';
import { parseEnv, serverEnvSchema } from './env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

describe('parseEnv', () => {

  it('treats empty strings from a copied .env.example as unset', () => {
    const env = parseEnv(serverEnvSchema, {
      ...valid,
      TEXT_API_KEY: '',
      WORKER_TEXT_CONCURRENCY: '',
    });
    expect(env.TEXT_API_KEY).toBeUndefined();
    expect(env.WORKER_TEXT_CONCURRENCY).toBe(50);
  });

  it('fails fast listing every missing variable', () => {
    expect(() => parseEnv(serverEnvSchema, {})).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parseEnv(serverEnvSchema, {})).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it.each(['medium', 'high', 'auto'])('rejects image quality %s instead of escalating cover costs', (quality) => {
    expect(() =>
      parseEnv(serverEnvSchema, { ...valid, REPLICATE_IMAGE_QUALITY: quality }),
    ).toThrowError(/REPLICATE_IMAGE_QUALITY/);
  });

  it('rejects an image model outside the agreed GPT Image 2 policy', () => {
    expect(() =>
      parseEnv(serverEnvSchema, { ...valid, REPLICATE_IMAGE_MODEL: 'another-provider/expensive-model' }),
    ).toThrowError(/REPLICATE_IMAGE_MODEL/);
  });
});
