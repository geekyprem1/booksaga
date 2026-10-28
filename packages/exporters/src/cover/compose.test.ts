import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { composeCover, defaultLayers, jpegQuality, layerAnchorX, wrapText } from './compose';

function fakeArt(): Buffer {
  const canvas = createCanvas(1024, 1536);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20304a';
  ctx.fillRect(0, 0, 1024, 1536);
  return canvas.toBuffer('image/png');
}

describe('cover compose', () => {
  it('wraps text to the given width', () => {
    const ctx = { measureText: (text: string) => ({ width: text.length * 10 }) };
    const lines = wrapText(ctx, 'the lantern garden of small debts', 120);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('the lantern garden of small debts');
  });

  it('anchors left, right and centred layers to the same box the editor draws', () => {
    const layer = { x: 0.5, w: 0.4, align: 'left' as const };
    expect(layerAnchorX(layer, 1000)).toBe(300);
    expect(layerAnchorX({ ...layer, align: 'right' }, 1000)).toBe(700);
    expect(layerAnchorX({ ...layer, align: 'center' }, 1000)).toBe(500);
  });

  it('renders a 1600x2560 JPEG for the ebook', async () => {
    const output = await composeCover({
      art: fakeArt(),
      width: 1600,
      height: 2560,
      fontFamily: 'serif',
      layers: defaultLayers({
        seriesTitle: 'The Ledger of Small Debts',
        title: 'The Lantern Garden',
        partNumber: 2,
        author: 'Local Admin',
      }),
    });

    expect(output.length).toBeGreaterThan(10_000);
    // JPEG magic bytes.
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
  });

  it('renders the print size too', async () => {
    const output = await composeCover({
      art: fakeArt(),
      width: 1856,
      height: 2784,
      fontFamily: 'display',
      layers: defaultLayers({
        seriesTitle: 'S',
        title: 'T',
        partNumber: 1,
        author: 'A',
      }),
    });
    expect(output.length).toBeGreaterThan(10_000);
  });
});

describe('jpegQuality', () => {
  it('defaults to 92 and uses the 0-100 scale', () => {
    expect(jpegQuality()).toBe(92);
    expect(jpegQuality(85)).toBe(85);
    expect(jpegQuality(100)).toBe(100);
  });

  it('converts a 0-1 fraction (the old unit) instead of producing quality ~1', () => {
    expect(jpegQuality(0.9)).toBe(90);
    expect(jpegQuality(1)).toBe(100);
  });

  it('clamps out-of-range and invalid values', () => {
    expect(jpegQuality(500)).toBe(100);
    expect(jpegQuality(0)).toBe(1);
    expect(jpegQuality(Number.NaN)).toBe(92);
  });
});
