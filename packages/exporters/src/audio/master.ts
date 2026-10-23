/**
 * Audio mastering with ffmpeg (T6.13).
 *
 * ACX asks for: mono, 44.1 kHz, 192 kbps CBR, RMS between -23 and -18 dB, peak at or below -3 dB,
 * and a noise floor under -60 dB. `loudnorm` with I=-19 / TP=-3 lands inside that window, and the
 * silence between chunks keeps sentences from running together.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface AudioProbe {
  durationSec: number;
  bitrateKbps: number;
  sampleRate: number;
  channels: number;
  codec: string;
}

export interface LoudnessReport {
  integratedLufs: number;
  truePeakDb: number;
  lra: number;
}

const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH ?? 'ffprobe';

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) =>
      reject(new Error(`${command} could not start: ${err.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

/** Concatenate WAV chunks with a short pause between them and master to a 192k mono MP3. */
export async function masterChapter(
  chunks: Buffer[],
  opts: { silenceMs?: number; loudnessLufs?: number; truePeakDb?: number } = {},
): Promise<Buffer> {
  if (chunks.length === 0) throw new Error('No audio chunks to master.');

  const silenceMs = opts.silenceMs ?? 350;
  const dir = await mkdtemp(join(tmpdir(), 'booksaga-audio-'));

  try {
    const silencePath = join(dir, 'silence.wav');
    await run(FFMPEG, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=22050:cl=mono`,
      '-t',
      String(silenceMs / 1000),
      silencePath,
    ]);

    const listLines: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const chunkPath = join(dir, `chunk-${String(index).padStart(4, '0')}.wav`);
      await writeFile(chunkPath, chunk);
      listLines.push(`file '${chunkPath.replace(/\\/g, '/')}'`);
      if (index < chunks.length - 1) listLines.push(`file '${silencePath.replace(/\\/g, '/')}'`);
    }

    const listPath = join(dir, 'list.txt');
    await writeFile(listPath, listLines.join('\n'), 'utf8');

    const outPath = join(dir, 'chapter.mp3');
    await run(FFMPEG, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-af',
      `loudnorm=I=${opts.loudnessLufs ?? -19}:TP=${opts.truePeakDb ?? -3}:LRA=7`,
      '-ar',
      '44100',
      '-ac',
      '1',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function probeAudio(buffer: Buffer, extension = 'mp3'): Promise<AudioProbe> {
  const dir = await mkdtemp(join(tmpdir(), 'booksaga-probe-'));
  try {
    const path = join(dir, `audio.${extension}`);
    await writeFile(path, buffer);

    const { stdout } = await run(FFPROBE, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ]);

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: { codec_name?: string; sample_rate?: string; channels?: number }[];
    };
    const stream = parsed.streams?.[0] ?? {};

    return {
      durationSec: Number(parsed.format?.duration ?? 0),
      bitrateKbps: Math.round(Number(parsed.format?.bit_rate ?? 0) / 1000),
      sampleRate: Number(stream.sample_rate ?? 0),
      channels: Number(stream.channels ?? 0),
      codec: stream.codec_name ?? 'unknown',
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Measure the integrated loudness and true peak of a finished chapter. */
export async function measureLoudness(buffer: Buffer, extension = 'mp3'): Promise<LoudnessReport> {
  const dir = await mkdtemp(join(tmpdir(), 'booksaga-loud-'));
  try {
    const path = join(dir, `audio.${extension}`);
    await writeFile(path, buffer);

    const { stderr } = await run(FFMPEG, [
      '-y',
      '-i',
      path,
      '-af',
      'loudnorm=print_format=json',
      '-f',
      'null',
      '-',
    ]);

    const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as {
      input_i: string;
      input_tp: string;
      input_lra: string;
    };

    return {
      integratedLufs: Number(parsed.input_i),
      truePeakDb: Number(parsed.input_tp),
      lra: Number(parsed.input_lra),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** ACX pass/fail for one chapter. */
export function acxCheck(probe: AudioProbe, loudness: LoudnessReport): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (probe.channels !== 1) problems.push(`expected mono, got ${probe.channels} channels`);
  if (probe.sampleRate !== 44100) problems.push(`expected 44.1 kHz, got ${probe.sampleRate}`);
  if (probe.bitrateKbps < 190) problems.push(`bitrate too low (${probe.bitrateKbps} kbps)`);
  if (loudness.integratedLufs > -18 || loudness.integratedLufs < -23) {
    problems.push(`RMS ${loudness.integratedLufs} dB outside -23..-18`);
  }
  if (loudness.truePeakDb > -3) problems.push(`true peak ${loudness.truePeakDb} dB above -3`);
  return { ok: problems.length === 0, problems };
}
