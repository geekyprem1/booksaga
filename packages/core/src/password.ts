import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I) so credentials are easy to read out or copy by hand.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

/**
 * Cryptographically random password with at least one upper, lower, digit and symbol.
 * Default length 14 (PRD §14).
 */
export function generatePassword(length = 14): string {
  if (length < 8) throw new Error('Password length must be at least 8');
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates shuffle with a CSPRNG so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
