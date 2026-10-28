/**
 * Colour normalisation for cover text layers.
 *
 * The cover art director returns palette entries as descriptive names ("tidewater green"), not hex
 * codes. Layers, the editor's <input type="color"> and the save schema all need `#rrggbb`.
 */

const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#e03131',
  green: '#2f9e44',
  blue: '#1c7ed6',
  yellow: '#fcc419',
  orange: '#f76707',
  purple: '#7048e8',
  pink: '#e64980',
  teal: '#12b886',
  grey: '#868e96',
  gray: '#868e96',
  gold: '#d4af37',
  silver: '#c0c0c0',
  ivory: '#fffff0',
  cream: '#f0e6d2',
  beige: '#e8dcc2',
  brown: '#8d5a2b',
  navy: '#1b2a4a',
  indigo: '#3b3b98',
  crimson: '#c0132f',
  ochre: '#cc7722',
  amber: '#ffbf00',
  emerald: '#2ecc71',
  violet: '#8f5fe8',
};

/** Words that tint a base colour. */
const LIGHT = ['light', 'pale', 'bright', 'pastel', 'sailcloth', 'bone', 'ivory'];
const DARK = ['dark', 'deep', 'drowned', 'midnight', 'coal', 'smoke'];

export const DEFAULT_ACCENT = '#f0e6d2';

const HEX6 = /^#[0-9a-f]{6}$/i;

/** True for exactly `#rrggbb`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

function mix(hex: string, target: number, amount: number): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) =>
      Math.round(c + (target - c) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DEFAULT_PAPER_ACCENT = '#5b4636';

/**
 * An accent colour that stays readable as text on white paper. Cover palette entries are often
 * pale (they sit on dark art), so darken them until the contrast against white is at least ~5:1.
 */
export function readableOnPaper(value: unknown, fallback: string = DEFAULT_PAPER_ACCENT): string {
  let hex = toHexColor(value, fallback);
  for (let i = 0; i < 12 && luminance(hex) > 0.18; i++) hex = mix(hex, 0, 0.15);
  return hex;
}

/**
 * Turn any colour-ish string into `#rrggbb`. Accepts `#rgb`, `#rrggbb`, `#rrggbbaa` (alpha is
 * dropped) and common colour words ("dark teal"). Unknown text returns `fallback`.
 */
export function toHexColor(value: unknown, fallback: string = DEFAULT_ACCENT): string {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().toLowerCase();
  if (!text) return fallback;

  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(text)) return text.slice(0, 7);

  const words = text.split(/[\s-]+/);
  const base = words.map((w) => NAMED[w]).find(Boolean);
  if (!base) return fallback;

  if (words.some((w) => LIGHT.includes(w))) return mix(base, 255, 0.35);
  if (words.some((w) => DARK.includes(w))) return mix(base, 0, 0.35);
  return base;
}
