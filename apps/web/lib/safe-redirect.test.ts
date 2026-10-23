import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('allows same-origin paths with query strings', () => {
    expect(safeNextPath('/my-series?tab=1')).toBe('/my-series?tab=1');
    expect(safeNextPath('/admin/users')).toBe('/admin/users');
  });

  it('falls back for empty values', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
  });

  it('blocks open redirects', () => {
    for (const bad of [
      'https://evil.com',
      'http://evil.com/x',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      'evil.com',
      '/ok\nhttps://evil.com',
    ]) {
      expect(safeNextPath(bad), bad).toBe('/dashboard');
    }
  });

  it('does not loop back into auth pages', () => {
    expect(safeNextPath('/login')).toBe('/dashboard');
    expect(safeNextPath('/login?next=/x')).toBe('/dashboard');
    expect(safeNextPath('/auth/signout')).toBe('/dashboard');
  });

  it('uses a custom fallback', () => {
    expect(safeNextPath('//x', '/home')).toBe('/home');
  });
});
