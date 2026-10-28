/**
 * Replicate image generation (T4.2).
 *
 * gpt-image-2 exposes an `aspect_ratio` enum rather than width/height; the largest portrait option
 * is `1024x1536` (2:3), which is the print front's ratio. The worker upscales/crops from there to
 * 1856×2784 (print) and 1600×2560 (ebook) with sharp.
 *
 * Uses the HTTP API with `Prefer: wait` so most calls return in one round-trip; slower ones fall
 * back to polling.
 */
import { createCanvas } from '@napi-rs/canvas';
import type { ImageRequest, ImageResult } from './types';
import { retryOn429 } from './limiter';
import { AiError } from './types';

export interface ReplicateOptions {
  token: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/** Estimated USD per output image; Replicate does not return actual cost. */
const ESTIMATED_IMAGE_COST_USD = 0.012;

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function outputUrls(output: Prediction['output']): string[] {
  if (!output) return [];
  if (typeof output === 'string') return [output];
  return output.filter((value): value is string => typeof value === 'string');
}

export async function replicateImage(
  opts: ReplicateOptions,
  req: ImageRequest,
): Promise<ImageResult> {
  const baseUrl = (opts.baseUrl ?? 'https://api.replicate.com/v1').replace(/\/$/, '');
  const [owner, name] = opts.model.split('/');
  if (opts.model !== 'openai/gpt-image-2') {
    throw new AiError('AI_NOT_CONFIGURED', 'Cover images require the OpenAI GPT Image 2 low-cost model.');
  }

  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollMs = opts.pollIntervalMs ?? 2000;

  const input: Record<string, unknown> = {
    prompt: req.prompt,
    aspect_ratio: req.aspectRatio ?? '1024x1536',
    quality: 'low',
    output_format: 'png',
    number_of_images: 1,
  };
  if (req.referenceImages?.length) input.input_images = req.referenceImages;

  const started = Date.now();

  const create = await retryOn429(() =>
    fetch(`${baseUrl}/models/${owner}/${name}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );

  let prediction = (await create.json()) as Prediction;
  if (!create.ok) {
    throw new AiError('AI_UNAVAILABLE', `Replicate ${create.status}: ${prediction.error ?? 'request failed'}`, {
      status: create.status,
    });
  }

  while (
    (prediction.status === 'starting' || prediction.status === 'processing') &&
    Date.now() - started < timeoutMs
  ) {
    await sleep(pollMs);
    const poll = await fetch(prediction.urls?.get ?? `${baseUrl}/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${opts.token}` },
      signal: AbortSignal.timeout(30_000),
    });
    prediction = (await poll.json()) as Prediction;
  }

  if (prediction.status !== 'succeeded') {
    throw new AiError(
      'AI_UNAVAILABLE',
      `Replicate image ${prediction.status}: ${prediction.error ?? 'no output'}`,
    );
  }

  const [url] = outputUrls(prediction.output);
  if (!url) throw new AiError('AI_INVALID_RESPONSE', 'Replicate returned no image URL.');

  const file = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!file.ok) throw new AiError('AI_UNAVAILABLE', `Could not download the image (${file.status}).`);

  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    buffer,
    mime: 'image/png',
    costUsd: ESTIMATED_IMAGE_COST_USD,
    width: 1024,
    height: 1536,
    model: opts.model,
  };
}

/**
 * Deterministic placeholder art for `AI_MODE=mock`: a gradient with the prompt's hash, so the UI,
 * storage and compose paths can be exercised without spending money.
 */
export function mockImage(req: ImageRequest): ImageResult {
  const width = 1024;
  const height = 1536;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  let hash = 2166136261;
  for (let i = 0; i < req.prompt.length; i++) {
    hash ^= req.prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue}, 45%, 18%)`);
  gradient.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 55%, 32%)`);
  gradient.addColorStop(1, `hsl(${(hue + 90) % 360}, 40%, 12%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // A couple of shapes so the placeholder reads as artwork, not a flat colour.
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(width * 0.3, height * 0.35, width * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.1;
  ctx.fillRect(0, height * 0.62, width, height * 0.2);

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '28px sans-serif';
  ctx.fillText('MOCK ARTWORK', 48, height - 72);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`seed ${(hash >>> 0).toString(16)}`, 48, height - 36);

  return {
    buffer: canvas.toBuffer('image/png'),
    mime: 'image/png',
    costUsd: 0,
    width,
    height,
    model: 'mock',
  };
}
