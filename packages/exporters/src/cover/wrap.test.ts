import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { buildWrapPdf, SPINE_TEXT_MIN_PAGES, wrapDimensions } from './wrap';

const frontArt = () => {
  const canvas = createCanvas(1856, 2784);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#334455';
  ctx.fillRect(0, 0, 1856, 2784);
  return { buffer: canvas.toBuffer('image/jpeg'), width: 1856, height: 2784 };
};

describe('paperback wrap', () => {
  it('matches the KDP spine math for 6x9 / 200 pages / white paper', () => {
    const dims = wrapDimensions('6x9', 200, 'white');
    expect(dims.spine).toBe(0.4504);
    expect(dims.width).toBe(12.7004);
    expect(dims.height).toBe(9.25);
  });

  it('grows the spine with cream paper', () => {
    const white = wrapDimensions('6x9', 300, 'white');
    const cream = wrapDimensions('6x9', 300, 'cream');
    expect(cream.spine).toBeGreaterThan(white.spine);
    // 0.125 + 6 + 300*0.0025 + 6 + 0.125
    expect(cream.width).toBeCloseTo(13, 4);
  });

  it('renders a PDF at the exact wrap size', async () => {
    const result = await buildWrapPdf({
      trim: '6x9',
      pageCount: 200,
      title: 'The Lantern Machine',
      author: 'Local Admin',
      blurb: 'A harbour city where debts are inherited like weather.',
      frontArt: frontArt(),
    });

    const pdf = await PDFDocument.load(result.buffer);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();

    expect(result.dimensions.width).toBe(12.7004);
    expect(width / 72).toBeCloseTo(12.7004, 2);
    expect(height / 72).toBeCloseTo(9.25, 2);
    expect(result.frontDpi).toBeGreaterThanOrEqual(300);
  });

  it('knows when the spine is too thin for text', () => {
    expect(SPINE_TEXT_MIN_PAGES).toBe(79);
    expect(wrapDimensions('6x9', 78, 'white').spine).toBeLessThan(0.25);
  });
});
