/**
 * The AI facade used by the worker (T2.2–T2.5).
 *
 *   const ai = createAi({ mode, apiKey, model, db });
 *   const chapter = await ai.text({ ... });           // plain prose
 *   const outline = await ai.json({ ..., schema });   // validated structured output
 *
 * Every call writes one `ai_usage_log` row. In mock mode the call never leaves the process.
 */
import type { z } from 'zod';
import { completeJson } from './json';
import { mockComplete } from './mock';
import { openRouterComplete, type OpenRouterOptions } from './openrouter';
import {
  AiError,
  type AiMode,
  type JsonRequest,
  type JsonResult,
  type TextRequest,
  type TextResult,
} from './types';
import { logUsage, type AiDb, type ModelPricing } from './usage';

export * from './types';
export * from './usage';
export { extractJson, completeJson } from './json';
export { mockComplete } from './mock';
export { backoffDelay, isRetryableStatus } from './openrouter';

export interface AiClient {
  readonly mode: AiMode;
  readonly model: string;
  text(req: TextRequest): Promise<TextResult>;
  json<S extends z.ZodTypeAny>(req: JsonRequest<S>): Promise<JsonResult<z.infer<S>>>;
}

export interface CreateAiOptions {
  mode: AiMode;
  model: string;
  apiKey?: string;
  /** When set, every call is logged to `ai_usage_log`. */
  db?: AiDb;
  pricing?: Record<string, ModelPricing>;
  baseUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export function createAi(opts: CreateAiOptions): AiClient {
  const live: OpenRouterOptions | null =
    opts.mode === 'live'
      ? {
          apiKey: opts.apiKey ?? '',
          model: opts.model,
          pricing: opts.pricing,
          baseUrl: opts.baseUrl,
          timeoutMs: opts.timeoutMs,
          maxAttempts: opts.maxAttempts,
        }
      : null;

  if (live && !live.apiKey) {
    throw new AiError(
      'AI_NOT_CONFIGURED',
      'OPENROUTER_API_KEY is missing. Set it, or run with AI_MODE=mock.',
    );
  }

  const complete = async (
    req: TextRequest & { json?: boolean },
  ): Promise<TextResult> => {
    const result = live ? await openRouterComplete(live, req) : mockComplete(req);
    if (opts.db) {
      await logUsage(opts.db, {
        userId: req.usage.userId,
        jobId: req.usage.jobId,
        provider: live ? 'openrouter' : 'mock',
        model: result.model,
        purpose: req.usage.purpose,
        inputTokens: result.inputTokens,
        cachedInputTokens: result.cachedInputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });
    }
    return result;
  };

  return {
    mode: opts.mode,
    model: live ? opts.model : 'mock',
    text: (req) => complete(req),
    json: <S extends z.ZodTypeAny>(req: JsonRequest<S>) => completeJson(complete, req),
  };
}
