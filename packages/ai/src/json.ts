/**
 * Structured output with a repair loop (T2.3).
 *
 * The model is asked for JSON mode, the result is parsed and validated with zod. If it fails, one
 * follow-up call shows the model its own output plus the validation error and asks for a fix —
 * twice at most, then `AiSchemaError` (the job fails and the credits are refunded).
 */
import type { z } from 'zod';
import { AiSchemaError, type JsonRequest, type JsonResult, type TextResult } from './types';

export type CompleteFn = (req: {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
  usage: { userId: string; jobId?: string; purpose: string };
  json?: boolean;
}) => Promise<TextResult>;

/** Models sometimes wrap JSON in a fence or add a sentence before it. */
export function extractJson(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function describeIssues(error: unknown): string {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return 'The JSON did not match the schema.';
  return issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

const REPAIR_INSTRUCTION = (label: string, detail: string) =>
  `Your previous response was not valid for the ${label} schema. Fix it and return ONLY the corrected JSON object — no prose, no code fences.\n\nProblems:\n${detail}`;

export async function completeJson<S extends z.ZodTypeAny>(
  complete: CompleteFn,
  req: JsonRequest<S>,
  maxRepairs = 2,
): Promise<JsonResult<z.infer<S>>> {
  let result = await complete({ ...req, json: true });
  let tokens = {
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const raw = extractJson(result.text);
    let parsed: unknown;
    let parseError: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      parseError = err;
    }

    if (parseError === undefined) {
      const validated = req.schema.safeParse(parsed);
      if (validated.success) {
        return { ...result, ...tokens, data: validated.data };
      }
      parseError = validated.error;
    }

    if (attempt === maxRepairs) {
      throw new AiSchemaError(req.label, result.text, parseError);
    }

    result = await complete({
      system: req.system,
      messages: [
        ...req.messages,
        { role: 'assistant', content: raw.slice(0, 12_000) },
        { role: 'user', content: REPAIR_INSTRUCTION(req.label, describeIssues(parseError)) },
      ],
      maxTokens: req.maxTokens,
      temperature: 0,
      usage: req.usage,
      json: true,
    });

    tokens = {
      inputTokens: tokens.inputTokens + result.inputTokens,
      cachedInputTokens: tokens.cachedInputTokens + result.cachedInputTokens,
      outputTokens: tokens.outputTokens + result.outputTokens,
      costUsd: Math.round((tokens.costUsd + result.costUsd) * 1_000_000) / 1_000_000,
    };
  }

  // Unreachable: the loop either returns or throws.
  throw new AiSchemaError(req.label, result.text, new Error('repair loop exhausted'));
}
