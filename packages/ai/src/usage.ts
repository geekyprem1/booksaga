/**
 * Cost accounting + `ai_usage_log` writes (T2.4).
 *
 * Prices are per million tokens. `cachedInputPerM` is the discounted rate for prompt-cache hits
 * (OpenRouter reports them under `prompt_tokens_details.cached_tokens`). When the provider returns
 * its own `usage.cost`, that number wins over this table.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@booksaga/db-types';
import type { TokenUsage, UsageContext } from './types';

export type AiDb = SupabaseClient<Database>;

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM: number;
}

/** Placeholder prices from ARCH §5.3; T2.21 replaces these with measured values. */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'deepseek/deepseek-v4.1-flash-1017': { inputPerM: 0.09, outputPerM: 0.18, cachedInputPerM: 0.018 },
  default: { inputPerM: 0.2, outputPerM: 0.6, cachedInputPerM: 0.04 },
};

export function pricingFor(
  model: string,
  table: Record<string, ModelPricing> = DEFAULT_PRICING,
): ModelPricing {
  return table[model] ?? table.default ?? { inputPerM: 0.2, outputPerM: 0.6, cachedInputPerM: 0.04 };
}

export function computeCost(
  pricing: ModelPricing,
  usage: TokenUsage,
  reportedCost?: number,
): number {
  if (typeof reportedCost === 'number' && Number.isFinite(reportedCost) && reportedCost > 0) {
    return reportedCost;
  }
  const uncached = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const cost =
    (uncached / 1_000_000) * pricing.inputPerM +
    (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputPerM +
    (usage.outputTokens / 1_000_000) * pricing.outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface AiUsageRow extends TokenUsage {
  userId: string;
  jobId?: string;
  provider: string;
  model: string;
  purpose: string;
  images?: number;
  audioSeconds?: number;
  costUsd: number;
}

/**
 * Insert one usage row. Never throws: a logging failure must not fail a generation job.
 */
export async function logUsage(db: AiDb, row: AiUsageRow): Promise<void> {
  const { error } = await db.from('ai_usage_log').insert({
    user_id: row.userId,
    job_id: row.jobId ?? null,
    provider: row.provider,
    model: row.model,
    purpose: row.purpose,
    input_tokens: row.inputTokens,
    cached_input_tokens: row.cachedInputTokens,
    output_tokens: row.outputTokens,
    images: row.images ?? 0,
    audio_seconds: row.audioSeconds ?? 0,
    cost_usd: row.costUsd,
  });
  if (error) console.warn(`[ai] failed to log usage: ${error.message}`);
}

export function usageContext(req: UsageContext, provider: string, model: string): AiUsageRow {
  return {
    userId: req.userId,
    jobId: req.jobId,
    provider,
    model,
    purpose: req.purpose,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  };
}
