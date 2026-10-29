import { DEFAULT_PRICING } from '@booksaga/ai';
import type { DbClient } from '@booksaga/core';
import { aiSettingsSchema, type TextLlmConfig } from '@booksaga/shared';

/** Load once per worker startup; fail closed when settings cannot be read or are invalid. */
export async function loadWorkerAiSettings(db: DbClient, defaults: TextLlmConfig) {
  const configured = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_models')
    .maybeSingle();
  if (configured.error) throw new Error(`Could not load AI settings: ${configured.error.message}`);
  const settings = configured.data ? aiSettingsSchema.parse(configured.data.value) : null;
  return {
    text: {
      ...defaults,
      model: settings?.model || defaults.model,
      fastModel: settings?.fastModel || defaults.fastModel,
    },
    pricing: { ...DEFAULT_PRICING, ...(settings?.pricing ?? {}) },
  };
}
