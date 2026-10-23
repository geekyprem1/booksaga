/**
 * "Enhance with AI" (T2.16): expands the idea on the Create Series form into a richer concept and
 * title options. Costs 1 credit; the result is stored on the job row so the UI can read it from the
 * same Realtime subscription it already uses for progress.
 */
import { enhanceResultSchema } from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import type { JobRunner } from '../../lib/jobs';
import { enhancePrompt } from '../../prompts/v1';

export interface EnhanceJobData {
  jobId: string;
  userId: string;
  idea: string;
  genre: string;
  tone: string;
  audience: string;
}

export async function processEnhance(
  deps: { ai: AiClient },
  runner: JobRunner,
  data: EnhanceJobData,
): Promise<void> {
  await runner.progress(20, 'Expanding your idea');

  const result = await deps.ai.json({
    ...enhancePrompt({
      idea: data.idea,
      genre: data.genre,
      tone: data.tone,
      audience: data.audience,
    }),
    schema: enhanceResultSchema,
    label: 'EnhanceResult',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'enhance' },
  });

  await runner.progress(90, 'Saving the result', { result: result.data });
  await runner.complete({ title: 'Your enhanced concept is ready', type: 'enhance_ready' });
}
