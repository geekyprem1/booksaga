import { describe, expect, it } from 'vitest';
import { generatePassword } from './password';

describe('generatePassword', () => {
  it('is 14 characters by default and contains every character class', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%&*?]/);
    }
  });

  it('never uses look-alike characters', () => {
    for (let i = 0; i < 200; i++) expect(generatePassword(32)).not.toMatch(/[0OIl1]/);
  });

  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(set.size).toBe(500);
  });

  it('rejects unsafe lengths', () => {
    expect(() => generatePassword(7)).toThrow();
    expect(generatePassword(8)).toHaveLength(8);
  });
});
