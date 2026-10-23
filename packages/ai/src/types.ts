import type { z } from 'zod';

export type AiMode = 'live' | 'mock';

/** Where a call came from — written to `ai_usage_log` and used by the mock fixtures. */
export interface UsageContext {
  userId: string;
  jobId?: string;
  /** Pipeline step: series_plan | book_outline | chapter | chapter_extract | continuity | metadata | enhance | suggestions | rewrite */
  purpose: string;
}

export interface TextMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Values the mock provider uses to produce realistic fixtures. Ignored in live mode. */
export interface MockHints {
  books?: number;
  chapters?: number;
  words?: number;
  part?: number;
  seriesTitle?: string;
  genre?: string;
  isFiction?: boolean;
  idea?: string;
  chapterTitle?: string;
  chapterNumber?: number;
}

export interface TextRequest {
  system: string;
  messages: TextMessage[];
  maxTokens: number;
  temperature?: number;
  usage: UsageContext;
  mock?: MockHints;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface TextResult extends TokenUsage {
  text: string;
  costUsd: number;
  model: string;
}

export interface JsonRequest<S extends z.ZodTypeAny = z.ZodTypeAny> extends TextRequest {
  schema: S;
  /** Used in the repair prompt, e.g. "BookOutline". */
  label: string;
}

export interface JsonResult<T> extends TextResult {
  data: T;
}

export class AiError extends Error {
  readonly code: 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE' | 'AI_SCHEMA_INVALID' | 'AI_NOT_CONFIGURED';
  readonly status?: number;

  constructor(
    code: AiError['code'],
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AiError';
    this.code = code;
    this.status = options.status;
  }
}

export class AiSchemaError extends AiError {
  readonly raw: string;

  constructor(label: string, raw: string, cause: unknown) {
    super('AI_SCHEMA_INVALID', `The AI response for ${label} did not match the expected shape.`, {
      cause,
    });
    this.name = 'AiSchemaError';
    this.raw = raw;
  }
}
