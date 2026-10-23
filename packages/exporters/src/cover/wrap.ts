/**
 * Paperback full-wrap cover (T6.3).
 *
 * One PDF containing back cover, spine and front cover at the exact KDP wrap size for the book's
 * real page count. The spine width depends on the paper stock, so the file is only valid for one
 * page count — the UI marks it stale when a later export reports a different count.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { TrimSize } from '../pdf/print';
import { TRIM_INCHES } from '../pdf/print';

export type PaperStock = 'white' | 'cream' | 'premium-color';

/** Inches of paper per printed page (KDP stock thickness). */
export const PAPER_THICKNESS: Record<PaperStock, number> = {
  white: 0.002252,
  cream: 0.0025,
  'premium-color': 0.002347,
};

export const BLEED = 0.125;
export const BARCODE_WIDTH = 2;
export const BARCODE_HEIGHT = 1.2;

export interface WrapDimensions {
  /** Full wrap width in inches. */
  width: number;
  /** Full wrap height in inches. */
  height: number;
  spine: number;
  trimWidth: number;
  trimHeight: number;
  bleed: number;
}

export function wrapDimensions(
  trim: TrimSize,
  pageCount: number,
  paper: PaperStock = 'white',
): WrapDimensions {
  const { width, height } = TRIM_INCHES[trim];
  const spine = Number((pageCount * PAPER_THICKNESS[paper]).toFixed(4));
  return {
    width: Number((BLEED + width + spine + width + BLEED).toFixed(4)),
    height: Number((height + BLEED * 2).toFixed(4)),
    spine,
    trimWidth: width,
    trimHeight: height,
    bleed: BLEED,
  };
}

/** Spine text is only safe from 79 pages up (KDP rule). */
export const SPINE_TEXT_MIN_PAGES = 79;

export interface WrapInput {
  trim: TrimSize;
  pageCount: number;
  paper?: PaperStock;
  title: string;
  author: string;
  blurb?: string;
  /** The print-size cover art (1856×2784 for a 6×9 book). */
  frontArt: { buffer: Buffer; width: number; height: number };
  backgroundColor?: string;
  isbn?: string;
}

export interface WrapResult {
  buffer: Buffer;
  dimensions: WrapDimensions;
  /** Effective DPI of the front artwork inside its 6.125 × 9.25 in area. */
  frontDpi: number;
}

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean.length === 3 ? clean.repeat(2) : clean, 16);
  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
};

/** Greedy wrap using the real font metrics. */
function wrapLines(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildWrapPdf(input: WrapInput): Promise<WrapResult> {
  const dimensions = wrapDimensions(input.trim, input.pageCount, input.paper ?? 'white');
  const dpi = 72;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([dimensions.width * dpi, dimensions.height * dpi]);

  const bodyFont = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sansFont = await pdf.embedFont(StandardFonts.Helvetica);

  const background = hexToRgb(input.backgroundColor ?? '#121937');
  const pageHeight = dimensions.height * dpi;

  // Whole wrap background (covers the spine and back; the front art paints over its own area).
  page.drawRectangle({ x: 0, y: 0, width: dimensions.width * dpi, height: pageHeight, color: background });

  const frontX = dimensions.bleed + dimensions.trimWidth + dimensions.spine;
  const frontWidth = dimensions.trimWidth + dimensions.bleed;

  // Front cover art at full bleed.
  const image =
    input.frontArt.buffer.subarray(0, 4).toString('hex') === 'ffd8ffe0' ||
    input.frontArt.buffer[0] === 0xff
      ? await pdf.embedJpg(input.frontArt.buffer)
      : await pdf.embedPng(input.frontArt.buffer);
  page.drawImage(image, {
    x: frontX * dpi,
    y: 0,
    width: frontWidth * dpi,
    height: pageHeight,
  });

  // Back cover text area.
  const backX = dimensions.bleed * dpi;
  const backWidth = dimensions.trimWidth * dpi;
  const padding = 0.5 * dpi;
  let cursor = pageHeight - 1.2 * dpi;

  const titleSize = 26;
  for (const line of wrapLines(input.title, boldFont, titleSize, backWidth - padding * 2)) {
    page.drawText(line, {
      x: backX + padding,
      y: cursor,
      size: titleSize,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    cursor -= titleSize * 1.15;
  }

  cursor -= 0.25 * dpi;

  if (input.blurb) {
    const blurbSize = 11.5;
    const lineHeight = blurbSize * 1.45;
    const maxLines = Math.floor((cursor - 2.4 * dpi) / lineHeight);

    for (const line of wrapLines(input.blurb, bodyFont, blurbSize, backWidth - padding * 2).slice(
      0,
      Math.max(0, maxLines),
    )) {
      page.drawText(line, {
        x: backX + padding,
        y: cursor,
        size: blurbSize,
        font: bodyFont,
        color: rgb(0.92, 0.93, 1),
      });
      cursor -= lineHeight;
    }
  }

  // Author at the bottom of the back cover, above the barcode.
  page.drawText(input.author, {
    x: backX + padding,
    y: 1.5 * dpi,
    size: 14,
    font: sansFont,
    color: rgb(1, 1, 1),
  });

  // Barcode zone: KDP needs a clear white rectangle, bottom-right of the back cover.
  const barcodeWidth = BARCODE_WIDTH * dpi;
  const barcodeHeight = BARCODE_HEIGHT * dpi;
  page.drawRectangle({
    x: backX + backWidth - barcodeWidth - 0.25 * dpi,
    y: 0.25 * dpi,
    width: barcodeWidth,
    height: barcodeHeight,
    color: rgb(1, 1, 1),
  });
  page.drawText(input.isbn ?? 'ISBN / BARCODE', {
    x: backX + backWidth - barcodeWidth - 0.25 * dpi + 12,
    y: 0.25 * dpi + barcodeHeight / 2 - 4,
    size: 7,
    font: sansFont,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Spine text, only when the spine is wide enough to be legible.
  if (input.pageCount >= SPINE_TEXT_MIN_PAGES && dimensions.spine >= 0.25) {
    const spineX = (dimensions.bleed + dimensions.trimWidth) * dpi + (dimensions.spine * dpi) / 2;
    const spineSize = Math.min(13, dimensions.spine * dpi * 0.55);
    const spineText = `${input.title}  ·  ${input.author}`;
    const textWidth = sansFont.widthOfTextAtSize(spineText, spineSize);

    page.drawText(spineText, {
      x: spineX + spineSize / 2 - 2,
      y: pageHeight / 2 - textWidth / 2,
      size: spineSize,
      font: sansFont,
      color: rgb(1, 1, 1),
      rotate: degrees(90),
    });
  }

  const bytes = await pdf.save();
  return {
    buffer: Buffer.from(bytes),
    dimensions,
    frontDpi: Math.round(input.frontArt.width / frontWidth),
  };
}
