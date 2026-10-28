import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT, isHexColor, toHexColor } from './color';

describe('toHexColor', () => {
  it('keeps valid hex and expands short hex', () => {
    expect(toHexColor('#AABBCC')).toBe('#aabbcc');
    expect(toHexColor('#fa0')).toBe('#ffaa00');
  });

  it('drops the alpha channel of 8-digit hex', () => {
    expect(toHexColor('#11223344')).toBe('#112233');
  });

  it('maps colour words, with light/dark tints', () => {
    expect(toHexColor('gold')).toBe('#d4af37');
    expect(isHexColor(toHexColor('tidewater green'))).toBe(true);
    expect(toHexColor('dark green')).not.toBe(toHexColor('green'));
  });

  it('falls back for unknown or non-string input', () => {
    expect(toHexColor('coal-smoke zzz')).toBe(DEFAULT_ACCENT);
    expect(toHexColor(undefined)).toBe(DEFAULT_ACCENT);
    expect(toHexColor('', '#123456')).toBe('#123456');
  });

  it('always returns something the save schema accepts', () => {
    for (const input of ['tidewater green', 'sailcloth ochre', 'drowned indigo', 'rgb(1,2,3)', '#12']) {
      expect(isHexColor(toHexColor(input))).toBe(true);
    }
  });
});
