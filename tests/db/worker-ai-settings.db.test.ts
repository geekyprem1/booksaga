import { expect, it, vi } from 'vitest';
import { createAi } from '@booksaga/ai';
import { loadWorkerAiSettings } from '../../apps/worker/src/lib/ai-settings';
import { db } from './helpers';

it('loads saved AI settings at worker startup and applies pricing to text calls', async () => {
  const original = await db
    .from('app_settings')
    .select('key, value')
    .eq('key', 'ai_models')
    .maybeSingle();
  expect(original.error).toBeNull();
  const defaults = {
    baseUrl: 'https://example.test/v1',
    apiKey: 'test',
    model: 'default-model',
    fastModel: undefined,
    reasoningEffort: undefined,
  };
  try {
    const saved = await db.from('app_settings').upsert({
      key: 'ai_models',
      value: {
        model: 'test/main',
        fastModel: 'test/fast',
        pricing: { 'test/main': { inputPerM: 2, cachedInputPerM: 1, outputPerM: 4 } },
      },
    });
    expect(saved.error).toBeNull();
    const { text, pricing } = await loadWorkerAiSettings(db, defaults);
    expect(text.model).toBe('test/main');
    expect(text.fastModel).toBe('test/fast');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 1000000,
            completion_tokens: 1000000,
            prompt_tokens_details: { cached_tokens: 500000 },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const ai = createAi({
      mode: 'live',
      model: text.model,
      apiKey: text.apiKey,
      baseUrl: text.baseUrl,
      pricing,
    });
    const result = await ai.text({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 10,
      usage: { userId: 'test', purpose: 'test' },
    });
    expect(result.model).toBe('test/main');
    expect(result.costUsd).toBe(5.5);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe('test/main');
    vi.restoreAllMocks();
    const empty = await db
      .from('app_settings')
      .update({ value: { model: '', fastModel: '', pricing: {} } })
      .eq('key', 'ai_models');
    expect(empty.error).toBeNull();
    expect((await loadWorkerAiSettings(db, defaults)).text.model).toBe('default-model');
    const invalid = await db
      .from('app_settings')
      .update({
        value: {
          model: 'x',
          fastModel: '',
          pricing: { x: { inputPerM: -1, cachedInputPerM: 0, outputPerM: 0 } },
        },
      })
      .eq('key', 'ai_models');
    expect(invalid.error).toBeNull();
    await expect(loadWorkerAiSettings(db, defaults)).rejects.toThrow();
  } finally {
    vi.restoreAllMocks();
    const restore = original.data
      ? await db.from('app_settings').upsert(original.data)
      : await db.from('app_settings').delete().eq('key', 'ai_models');
    expect(restore.error).toBeNull();
  }
});
