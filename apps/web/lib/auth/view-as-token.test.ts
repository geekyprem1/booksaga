import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseViewAs, signViewAs } from './view-as-token';

it('accepts a signed unexpired state and rejects tampering, expiration and another key', () => {
  const state = { adminId: randomUUID(), userId: randomUUID(), expiresAt: Date.now() + 10000 };
  const signed = signViewAs(state, 'private key');
  expect(parseViewAs(signed, 'private key')).toEqual(state);
  expect(parseViewAs(signed, 'wrong key')).toBeNull();
  expect(parseViewAs(`${signed}x`, 'private key')).toBeNull();
  expect(
    parseViewAs(signViewAs({ ...state, expiresAt: Date.now() - 1 }, 'private key'), 'private key'),
  ).toBeNull();
  const expired = { ...state, expiresAt: Date.now() - 1000 };
  expect(parseViewAs(signViewAs(expired, 'private key'), 'private key', true)).toEqual(expired);
  expect(parseViewAs('invalid', 'private key')).toBeNull();
});
