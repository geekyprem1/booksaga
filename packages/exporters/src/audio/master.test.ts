import { describe, expect, it } from 'vitest';
import { acxCheck, masterChapter, measureLoudness, probeAudio } from './master';

/** A real PCM WAV, so the ffmpeg path is exercised end to end. */
function toneWav(seconds: number, hz = 180): Buffer {
  const sampleRate = 22_050;
  const samples = Math.floor(seconds * sampleRate);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 4) * Math.min(1, (seconds - t) * 4);
    buffer.writeInt16LE(
      Math.round(Math.sin(2 * Math.PI * hz * t) * 0.18 * envelope * 32767),
      44 + i * 2,
    );
  }
  return buffer;
}

describe('audio mastering', () => {
  it(
    'masters chunks into a 192k mono 44.1 kHz MP3 that passes ACX checks',
    async () => {
      const mp3 = await masterChapter([toneWav(1.2), toneWav(1.1, 220)]);

      expect(mp3.length).toBeGreaterThan(5000);
      // libmp3lame writes an ID3 tag first; either that or a raw frame sync is a valid MP3.
      expect(mp3.subarray(0, 3).toString('ascii') === 'ID3' || mp3[0] === 0xff).toBe(true);

      const probe = await probeAudio(mp3);
      expect(probe.codec).toBe('mp3');
      expect(probe.channels).toBe(1);
      expect(probe.sampleRate).toBe(44100);
      expect(probe.bitrateKbps).toBeGreaterThanOrEqual(190);
      expect(probe.durationSec).toBeGreaterThan(1.5);

      const loudness = await measureLoudness(mp3);
      const check = acxCheck(probe, loudness);
      expect(check.problems).toEqual([]);
      expect(check.ok).toBe(true);
    },
    120_000,
  );

  it(
    'flags a file that is not mono',
    async () => {
      const mp3 = await masterChapter([toneWav(0.8)]);
      const probe = await probeAudio(mp3);
      const check = acxCheck({ ...probe, channels: 2 }, {
        integratedLufs: -19,
        truePeakDb: -3,
        lra: 7,
      });
      expect(check.ok).toBe(false);
      expect(check.problems[0]).toContain('mono');
    },
    120_000,
  );
});
