/**
 * Server-side cover compose (T4.3).
 *
 * The AI produces text-less artwork; this module paints the title block on top with
 * `@napi-rs/canvas`. Layer positions are normalised (0–1) so the same JSON renders correctly at
 * both ebook (1600×2560) and print (1856×2784) sizes — and, later, in the browser Konva editor.
 *
 * The server output is canonical: the editor preview is only an approximation.
 */
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { toHexColor } from '@booksaga/shared';

export type CoverFontFamily = 'serif' | 'sans' | 'display';

export interface CoverLayer {
  kind: 'series' | 'title' | 'part' | 'author' | 'tagline';
  text: string;
  /** Normalised centre of the text block (0–1). */
  x: number;
  y: number;
  /** Normalised max width (0–1). */
  w: number;
  align: 'left' | 'center' | 'right';
  /** Font size as a fraction of the canvas height. */
  size: number;
  weight?: 'regular' | 'bold';
  color: string;
  uppercase?: boolean;
  shadow?: boolean;
  /** Letter spacing in em (0.3 gives the wide-set caps used for series and author lines). */
  tracking?: number;
}

export interface ComposeInput {
  art: Buffer;
  width: number;
  height: number;
  layers: CoverLayer[];
  fontFamily: CoverFontFamily;
  /** JPEG quality, 1-100 (a 0-1 fraction is also accepted). Default 92. */
  quality?: number;
}

const FONT_DIR = fileURLToPath(new URL('../../fonts/', import.meta.url));

const FAMILIES: Record<CoverFontFamily, { regular: string; bold: string }> = {
  serif: { regular: 'PlayfairDisplay', bold: 'PlayfairDisplay' },
  sans: { regular: 'Montserrat', bold: 'Montserrat' },
  display: { regular: 'Cinzel', bold: 'Cinzel' },
};

let registered = false;

function registerFonts(): void {
  if (registered) return;
  const files: [string, string][] = [
    ['PlayfairDisplay', 'PlayfairDisplay-VF.ttf'],
    ['Montserrat', 'Montserrat-VF.ttf'],
    ['Cinzel', 'Cinzel-VF.ttf'],
    ['Lora', 'Lora-VF.ttf'],
    ['BebasNeue', 'BebasNeue-Regular.ttf'],
  ];
  for (const [name, file] of files) {
    try {
      GlobalFonts.registerFromPath(`${FONT_DIR}${file}`, name);
    } catch {
      // A missing font falls back to the canvas default; never fail a cover over it.
    }
  }
  registered = true;
}

/** Greedy word wrap using the real text metrics. */
export function wrapText(
  ctx: { measureText: (text: string) => { width: number } },
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * X anchor for a layer, in canvas pixels.
 *
 * `x` is the normalised CENTRE of the text box (the Konva editor stores it that way), so left and
 * right aligned layers must be anchored to the box edge — otherwise the server render is shifted by
 * half the box width compared with the editor preview.
 */
export function layerAnchorX(
  layer: Pick<CoverLayer, 'x' | 'w' | 'align'>,
  width: number,
): number {
  if (layer.align === 'left') return (layer.x - layer.w / 2) * width;
  if (layer.align === 'right') return (layer.x + layer.w / 2) * width;
  return layer.x * width;
}

/** Normalise a quality value to the 0-100 scale. Accepts 0-1 fractions too. Default 92. */
export function jpegQuality(quality?: number): number {
  if (quality === undefined || !Number.isFinite(quality)) return 92;
  const scaled = quality <= 1 ? quality * 100 : quality;
  return Math.min(100, Math.max(1, Math.round(scaled)));
}

export async function composeCover(input: ComposeInput): Promise<Buffer> {
  registerFonts();

  const { width, height } = input;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Artwork, cropped to fill (same framing as the ebook/print crop).
  const art = await loadImage(input.art);
  const scale = Math.max(width / art.width, height / art.height);
  const drawW = art.width * scale;
  const drawH = art.height * scale;
  ctx.drawImage(art, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);

  // 2. A soft scrim top and bottom so light text stays readable on light art.
  const topScrim = ctx.createLinearGradient(0, 0, 0, height * 0.42);
  topScrim.addColorStop(0, 'rgba(0,0,0,0.55)');
  topScrim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * 0.42);

  const bottomScrim = ctx.createLinearGradient(0, height * 0.55, 0, height);
  bottomScrim.addColorStop(0, 'rgba(0,0,0,0)');
  bottomScrim.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);

  // 3. Text layers.
  const family = FAMILIES[input.fontFamily] ?? FAMILIES.serif;

  for (const layer of input.layers) {
    const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
    if (!text.trim()) continue;

    const fontSize = Math.round(layer.size * height);
    const weight = layer.weight === 'bold' ? 'bold' : 'normal';
    ctx.font = `${weight} ${fontSize}px ${family[weight === 'bold' ? 'bold' : 'regular']}`;
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'middle';
    // Set after `font`, and before measuring, so wrapping accounts for the extra spacing.
    ctx.letterSpacing = layer.tracking ? `${(layer.tracking * fontSize).toFixed(1)}px` : '0px';

    const maxWidth = layer.w * width;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontSize * 1.18;
    const anchorX = layerAnchorX(layer, width);
    // `y` is the TOP of the text block (the editor draws it the same way).
    const startY = layer.y * height + lineHeight / 2;

    for (const [index, line] of lines.entries()) {
      const y = startY + index * lineHeight;
      if (layer.shadow !== false) {
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = fontSize * 0.25;
        ctx.shadowOffsetY = fontSize * 0.05;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.fillStyle = toHexColor(layer.color, '#ffffff');
      ctx.fillText(line, anchorX, y, maxWidth);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  // @napi-rs/canvas takes JPEG quality as 0-100 (not 0-1): passing 0.9 gives ~quality 1, which
  // produced blocky, posterised covers.
  return canvas.toBuffer('image/jpeg', jpegQuality(input.quality));
}

/** The default layout used for every book: series name, title, book number, author. */
export function defaultLayers(input: {
  seriesTitle: string;
  title: string;
  partNumber: number;
  author: string;
  palette?: string[];
}): CoverLayer[] {
  // Palette entries are colour names from the art director ("tidewater green"), not hex codes.
  const accent = toHexColor(input.palette?.[1]);
  // Bestseller-style stack: wide-set series + book line, a large title right under them, and the
  // author alone at the foot. The same positions on every book make a series read as one set.
  return [
    {
      kind: 'series',
      text: input.seriesTitle,
      x: 0.5,
      y: 0.04,
      w: 0.9,
      align: 'center',
      size: 0.021,
      color: '#ffffff',
      uppercase: true,
      weight: 'regular',
      tracking: 0.32,
    },
    {
      kind: 'part',
      text: `Book ${input.partNumber}`,
      x: 0.5,
      y: 0.072,
      w: 0.6,
      align: 'center',
      size: 0.02,
      color: accent,
      uppercase: true,
      tracking: 0.4,
    },
    {
      kind: 'title',
      text: input.title,
      x: 0.5,
      y: 0.11,
      w: 0.88,
      align: 'center',
      size: 0.082,
      weight: 'bold',
      color: '#ffffff',
    },
    {
      kind: 'author',
      text: input.author,
      x: 0.5,
      y: 0.915,
      w: 0.86,
      align: 'center',
      size: 0.03,
      color: '#ffffff',
      uppercase: true,
      tracking: 0.3,
    },
  ];
}
