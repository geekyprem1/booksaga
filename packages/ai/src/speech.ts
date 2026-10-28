/**
 * Text-to-speech (T6.12): Replicate Kokoro in live mode, a deterministic WAV in mock mode.
 *
 * Kokoro takes ~1000 characters per call, so the worker chunks the chapter and concatenates the
 * pieces with ffmpeg. The mock renderer produces a real PCM WAV so the whole audio pipeline
 * (concat, loudnorm, MP3 encode, ACX checks) runs without spending money.
 */
import type { SpeechRequest, SpeechResult } from './types';
import { retryOn429 } from './limiter';
import { AiError } from './types';

export interface SpeechOptions {
  token: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Estimated USD per 1k characters. */
  pricePerKchar?: number;
}

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function firstUrl(output: Prediction['output']): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  return output.find((value) => typeof value === 'string') ?? null;
}

export async function replicateSpeech(
  opts: SpeechOptions,
  req: SpeechRequest,
): Promise<SpeechResult> {
  const baseUrl = (opts.baseUrl ?? 'https://api.replicate.com/v1').replace(/\/$/, '');
  const [owner, name] = opts.model.split('/');
  if (!owner || !name) throw new AiError('AI_NOT_CONFIGURED', `Invalid Replicate model: ${opts.model}`);

  const timeoutMs = opts.timeoutMs ?? 240_000;
  const pollMs = opts.pollIntervalMs ?? 2000;

  // Community models (kokoro-82m) have no /models/{owner}/{name}/predictions route (it 404s), so
  // resolve the latest version and predict against it.
  const modelRes = await fetch(`${baseUrl}/models/${owner}/${name}`, {
    headers: { authorization: `Bearer ${opts.token}` },
  });
  if (!modelRes.ok) {
    throw new AiError('AI_UNAVAILABLE', `Replicate model lookup failed (${modelRes.status}) for ${opts.model}`);
  }
  const versionId = ((await modelRes.json()) as { latest_version?: { id?: string } }).latest_version?.id;
  if (!versionId) throw new AiError('AI_UNAVAILABLE', `No version found for ${opts.model}`);

  const create = await retryOn429(() =>
    fetch(`${baseUrl}/predictions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${opts.token}`,
        'content-type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        version: versionId,
        input: {
          text: req.text,
          voice: req.voice,
          speed: req.speed ?? 1,
        },
      }),
    }),
  );

  if (!create.ok) {
    const body = await create.text().catch(() => '');
    throw new AiError('AI_UNAVAILABLE', `Replicate TTS failed (${create.status}): ${body.slice(0, 200)}`);
  }

  let prediction = (await create.json()) as Prediction;
  const started = Date.now();

  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (Date.now() - started > timeoutMs) {
      throw new AiError('AI_UNAVAILABLE', 'Replicate TTS timed out.');
    }
    await sleep(pollMs);
    const poll = await fetch(`${baseUrl}/predictions/${prediction.id}`, {
      headers: { authorization: `Bearer ${opts.token}` },
    });
    if (!poll.ok) throw new AiError('AI_UNAVAILABLE', `Replicate poll failed (${poll.status})`);
    prediction = (await poll.json()) as Prediction;
  }

  if (prediction.status !== 'succeeded') {
    throw new AiError('AI_UNAVAILABLE', prediction.error ?? `TTS ${prediction.status}`);
  }

  const url = firstUrl(prediction.output);
  if (!url) throw new AiError('AI_UNAVAILABLE', 'TTS returned no audio.');

  const audio = await fetch(url);
  if (!audio.ok) throw new AiError('AI_UNAVAILABLE', `Could not download the audio (${audio.status})`);
  const buffer = Buffer.from(await audio.arrayBuffer());

  return {
    buffer,
    mime: 'audio/wav',
    model: opts.model,
    characters: req.text.length,
    costUsd: ((opts.pricePerKchar ?? 0.002) * req.text.length) / 1000,
  };
}

/** Deterministic mock: a real PCM WAV whose length follows the text (≈150 wpm). */
export function mockSpeech(req: SpeechRequest): SpeechResult {
  const words = req.text.trim().split(/\s+/).filter(Boolean).length;
  const speed = req.speed ?? 1;
  const durationSec = Math.min(40, Math.max(0.6, words / (2.6 * speed)));

  const sampleRate = 22_050;
  const samples = Math.floor(durationSec * sampleRate);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  // A soft 180 Hz tone with a slow amplitude envelope, so the file is audible but obviously mock.
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 4) * Math.min(1, (durationSec - t) * 4);
    const value = Math.sin(2 * Math.PI * 180 * t) * 0.18 * envelope;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }

  return {
    buffer,
    mime: 'audio/wav',
    model: 'mock-tts',
    characters: req.text.length,
    costUsd: 0,
  };
}
