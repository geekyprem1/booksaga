/**
 * OpenAI-compatible chat-completions client (T2.2). Defaults to OpenRouter; set `baseUrl`
 * (env `TEXT_API_BASE_URL`) to use any other OpenAI-compatible provider. Everything here is deliberately dependency-free (global fetch) so the worker
 * does not pull an SDK for one endpoint.
 *
 * Reasoning models (DeepSeek V4.1 Flash) spend a large share of `max_tokens` on hidden reasoning.
 * Two guards keep that from truncating real output:
 *  - `reasoning: { effort: 'low', exclude: true }` by default (measured: ~50% fewer reasoning
 *    tokens, and the reasoning text stays out of the response).
 *  - `finish_reason: 'length'` triggers an immediate retry with a bigger budget instead of a
 *    "repair" round, because a truncated answer can never validate.
 */
import { AiError, type TextRequest, type TextResult } from './types';
import { computeCost, pricingFor, type ModelPricing } from './usage';

export interface ReasoningOptions {
  effort?: 'low' | 'medium' | 'high';
  /** Keep the reasoning text out of the response body. */
  exclude?: boolean;
  max_tokens?: number;
}

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  maxAttempts?: number;
  referer?: string;
  title?: string;
  pricing?: Record<string, ModelPricing>;
  /** `null` disables the reasoning hint entirely. */
  reasoning?: ReasoningOptions | null;
  /**
   * Reasoning effort for non-OpenRouter providers, sent as the `reasoning_effort` field.
   * Unset = don't send anything (strict providers reject unknown fields).
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

interface OpenRouterResponse {
  choices?: {
    message?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: number | string };
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const DEFAULT_REASONING: ReasoningOptions = { effort: 'low', exclude: true };
const MAX_OUTPUT_TOKENS = 32_000;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Exponential backoff with jitter, capped at 8s. */
export function backoffDelay(attempt: number, baseMs = 500): number {
  const exp = Math.min(baseMs * 2 ** (attempt - 1), 8000);
  return Math.round(exp * (0.75 + Math.random() * 0.5));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const DEFAULT_TEXT_BASE_URL = 'https://openrouter.ai/api/v1';

/** True when the endpoint is OpenRouter (enables its `reasoning` param and attribution headers). */
export function isOpenRouterUrl(baseUrl: string | undefined): boolean {
  try {
    const host = new URL(baseUrl ?? DEFAULT_TEXT_BASE_URL).hostname;
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

/** Short provider label for logs and `ai_usage_log.provider` ("openrouter", "api.openai.com"…). */
export function textProviderName(baseUrl: string | undefined): string {
  if (isOpenRouterUrl(baseUrl)) return 'openrouter';
  try {
    return new URL(baseUrl ?? DEFAULT_TEXT_BASE_URL).hostname;
  } catch {
    return 'openai-compatible';
  }
}

/**
 * Chat completion against any OpenAI-compatible endpoint. OpenRouter-only extras (`reasoning`,
 * `HTTP-Referer`, `X-Title`) are sent only when the base URL is OpenRouter, because strict
 * providers (e.g. api.openai.com) reject unknown body params with a 400.
 */
export async function openRouterComplete(
  opts: OpenRouterOptions,
  req: TextRequest & { json?: boolean },
): Promise<TextResult> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_TEXT_BASE_URL).replace(/\/$/, '');
  const openRouter = isOpenRouterUrl(baseUrl);
  const label = textProviderName(baseUrl);
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const maxAttempts = opts.maxAttempts ?? 3;

  let maxTokens = req.maxTokens;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      max_tokens: maxTokens,
    };
    if (typeof req.temperature === 'number') body.temperature = req.temperature;
    if (req.json) body.response_format = { type: 'json_object' };
    if (openRouter) {
      if (opts.reasoning !== null) body.reasoning = opts.reasoning ?? DEFAULT_REASONING;
    } else if (opts.reasoningEffort) {
      body.reasoning_effort = opts.reasoningEffort;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Local servers (Ollama, vLLM) often run without a key.
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
    if (openRouter) {
      headers['HTTP-Referer'] = opts.referer ?? 'https://booksaga.app';
      headers['X-Title'] = opts.title ?? 'BookSaga';
    }

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          lastError = new AiError(
            'AI_UNAVAILABLE',
            `${label} ${res.status}: ${text.slice(0, 300)}`,
            { status: res.status },
          );
          await sleep(backoffDelay(attempt));
          continue;
        }
        throw new AiError('AI_UNAVAILABLE', `${label} ${res.status}: ${text.slice(0, 300)}`, {
          status: res.status,
        });
      }

      const json = (await res.json()) as OpenRouterResponse;
      const choice = json.choices?.[0];
      const content = choice?.message?.content;
      const finish = choice?.finish_reason;

      // The budget ran out (reasoning models can burn it before writing anything): retry bigger.
      if (finish === 'length' && attempt < maxAttempts && maxTokens < MAX_OUTPUT_TOKENS) {
        maxTokens = Math.min(Math.round(maxTokens * 1.8) + 1000, MAX_OUTPUT_TOKENS);
        lastError = new AiError(
          'AI_INVALID_RESPONSE',
          `The response was cut off at ${req.maxTokens} tokens; retrying with ${maxTokens}.`,
        );
        continue;
      }

      if (typeof content !== 'string' || content.length === 0) {
        throw new AiError(
          'AI_INVALID_RESPONSE',
          `${label} returned an empty completion (finish: ${finish ?? 'unknown'}).`,
        );
      }

      const inputTokens = json.usage?.prompt_tokens ?? 0;
      const outputTokens = json.usage?.completion_tokens ?? 0;
      const cachedInputTokens = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const usage = { inputTokens, cachedInputTokens, outputTokens };

      return {
        text: content,
        ...usage,
        costUsd: computeCost(pricingFor(opts.model, opts.pricing), usage, json.usage?.cost),
        model: opts.model,
      };
    } catch (err) {
      lastError = err;
      const retryable =
        !(err instanceof AiError) ||
        err.status === undefined ||
        isRetryableStatus(err.status) ||
        err.code === 'AI_INVALID_RESPONSE';
      if (attempt >= maxAttempts || !retryable) break;
      await sleep(backoffDelay(attempt));
    }
  }

  if (lastError instanceof AiError) throw lastError;
  throw new AiError('AI_UNAVAILABLE', `${label} request failed.`, { cause: lastError });
}
