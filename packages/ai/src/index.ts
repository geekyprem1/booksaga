/**
 * The AI facade used by the worker (T2.2–T2.5, T4.2).
 *
 *   const ai = createAi({ mode, apiKey, model, db });
 *   const chapter = await ai.text({ ... });           // plain prose
 *   const outline = await ai.json({ ..., schema });   // validated structured output
 *   const art = await ai.image({ ... });              // Replicate image
 *
 * Every call writes one `ai_usage_log` row. In mock mode the call never leaves the process.
 */
import type { z } from 'zod';
import { completeJson } from './json';
import { mockComplete } from './mock';
import { openRouterComplete, type OpenRouterOptions } from './openrouter';
import { mockImage, replicateImage, type ReplicateOptions } from './replicate';
import { mockSpeech, replicateSpeech } from './speech';
import {
  AiError,
  type AiMode,
  type ImageRequest,
  type SpeechRequest,
  type SpeechResult,
  type ImageResult,
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
export { replicateImage, mockImage } from './replicate';
export { replicateSpeech, mockSpeech } from './speech';

export interface AiClient {
  readonly mode: AiMode;
  readonly model: string;
  text(req: TextRequest): Promise<TextResult>;
  json<S extends z.ZodTypeAny>(req: JsonRequest<S>): Promise<JsonResult<z.infer<S>>>;
  image(req: ImageRequest): Promise<ImageResult>;
  speech(req: SpeechRequest): Promise<SpeechResult>;
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

  /** Replicate (image generation). */
  replicateToken?: string;
  imageModel?: string;
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';

  /** Replicate TTS (audiobooks). */
  speechModel?: string;
  speechPricePerKchar?: number;
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

  const replicate: ReplicateOptions | null =
    opts.mode === 'live' && opts.replicateToken
      ? {
          token: opts.replicateToken,
          model: opts.imageModel ?? 'openai/gpt-image-2',
          timeoutMs: opts.timeoutMs,
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

    image: async (req) => {
      const quality = req.quality ?? opts.imageQuality ?? 'low';
      const result = replicate
        ? await replicateImage(replicate, { ...req, quality })
        : mockImage({ ...req, quality });

      if (opts.db) {
        await logUsage(opts.db, {
          userId: req.usage.userId,
          jobId: req.usage.jobId,
          provider: replicate ? 'replicate' : 'mock',
          model: result.model,
          purpose: req.usage.purpose,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          images: 1,
          costUsd: result.costUsd,
        });
      }
      return result;
    },

    speech: async (req) => {
      const result = replicate
        ? await replicateSpeech(
            {
              token: replicate.token,
              model: opts.speechModel ?? 'jaaari/kokoro-82m',
              baseUrl: replicate.baseUrl,
              timeoutMs: replicate.timeoutMs,
              pricePerKchar: opts.speechPricePerKchar,
            },
            req,
          )
        : mockSpeech(req);

      if (opts.db) {
        await logUsage(opts.db, {
          userId: req.usage.userId,
          jobId: req.usage.jobId,
          provider: replicate ? 'replicate' : 'mock',
          model: result.model,
          purpose: req.usage.purpose,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          costUsd: result.costUsd,
        });
      }
      return result;
    },
  };
}
