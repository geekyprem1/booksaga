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
}

export interface ComposeInput {
  art: Buffer;
  width: number;
  height: number;
  layers: CoverLayer[];
  fontFamily: CoverFontFamily;
  /** 0–1, JPEG quality. */
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

    const maxWidth = layer.w * width;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = fontSize * 1.18;
    const blockHeight = lines.length * lineHeight;
    const centerX = layer.x * width;
    const startY = layer.y * height - blockHeight / 2 + lineHeight / 2;

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
      ctx.fillStyle = layer.color;
      ctx.fillText(line, centerX, y, maxWidth);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  return canvas.toBuffer('image/jpeg', input.quality ?? 0.9);
}

/** The default layout used for every book: series name, title, book number, author. */
export function defaultLayers(input: {
  seriesTitle: string;
  title: string;
  partNumber: number;
  author: string;
  palette?: string[];
}): CoverLayer[] {
  const accent = input.palette?.[1] ?? '#f0e6d2';
  return [
    {
      kind: 'series',
      text: input.seriesTitle,
      x: 0.5,
      y: 0.085,
      w: 0.82,
      align: 'center',
      size: 0.026,
      color: '#ffffff',
      uppercase: true,
      weight: 'regular',
    },
    {
      kind: 'title',
      text: input.title,
      x: 0.5,
      y: 0.63,
      w: 0.84,
      align: 'center',
      size: 0.072,
      weight: 'bold',
      color: '#ffffff',
    },
    {
      kind: 'part',
      text: `Book ${input.partNumber}`,
      x: 0.5,
      y: 0.79,
      w: 0.6,
      align: 'center',
      size: 0.022,
      color: accent,
      uppercase: true,
    },
    {
      kind: 'author',
      text: input.author,
      x: 0.5,
      y: 0.9,
      w: 0.8,
      align: 'center',
      size: 0.034,
      color: '#ffffff',
      uppercase: true,
    },
  ];
}
