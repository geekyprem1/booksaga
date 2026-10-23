/**
 * AI suggestions for the Create Series side panel (T2.16). Cheap (1 credit) and interactive, so it
 * runs at priority 1 and returns through `jobs.meta.result` like the enhance flow.
 */
import { suggestionsSchema } from '@booksaga/shared';
import type { AiClient } from '@booksaga/ai';
import type { JobRunner } from '../../lib/jobs';
import { suggestionsPrompt } from '../../prompts/v1';

export interface SuggestionsJobData {
  jobId: string;
  userId: string;
  idea: string;
  genre: string;
}

export async function processSuggestions(
  deps: { ai: AiClient },
  runner: JobRunner,
  data: SuggestionsJobData,
): Promise<void> {
  await runner.progress(30, 'Thinking about your story');

  const result = await deps.ai.json({
    ...suggestionsPrompt({ idea: data.idea, genre: data.genre }),
    schema: suggestionsSchema,
    label: 'Suggestions',
    usage: { userId: data.userId, jobId: runner.jobId, purpose: 'suggestions' },
  });

  await runner.progress(90, 'Saving suggestions', { result: result.data });
  await runner.complete({ title: 'New story suggestions', type: 'suggestions_ready' });
}
