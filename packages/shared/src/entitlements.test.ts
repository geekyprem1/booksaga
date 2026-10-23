import { describe, expect, it } from 'vitest';
import { resolveCreditSource, bookCreditAction } from './credits';
import { assertCan, resolveEntitlements } from './entitlements';
import { AppError } from './errors';
import { getPlanGrants, PLAN_CODES, PLANS } from './plans';

describe('plan matrix', () => {
  it('defines exactly 11 plans (FE + 5 OTOs + 5 downsells)', () => {
    expect(PLAN_CODES).toHaveLength(11);
    expect(PLAN_CODES.every((c) => PLANS[c].code === c)).toBe(true);
    expect(PLAN_CODES.filter((c) => PLANS[c].isDownsell)).toHaveLength(5);
  });

  it('matches the one-time grants from PRD §3.2', () => {
    expect(getPlanGrants('fe')).toEqual({ main: 300, audio: 0, agency: 0 });
    expect(getPlanGrants('oto1_lite').main).toBe(1000);
    expect(getPlanGrants('oto1').main).toBe(3000);
    expect(getPlanGrants('oto3_lite').audio).toBe(300);
    expect(getPlanGrants('oto3').audio).toBe(1000);
    expect(getPlanGrants('oto4_lite').agency).toBe(2000);
    expect(getPlanGrants('oto4').agency).toBe(5000);
    expect(getPlanGrants('oto2')).toEqual({ main: 0, audio: 0, agency: 0 });
    expect(getPlanGrants('oto5')).toEqual({ main: 0, audio: 0, agency: 0 });
  });

  it('reduces the FE grant for reseller customers to 100', () => {
    expect(getPlanGrants('fe', { isResellerCustomer: true }).main).toBe(100);
    // Only FE is affected.
    expect(getPlanGrants('oto1', { isResellerCustomer: true }).main).toBe(3000);
  });

  it('stacks credits: FE + U-Lite + U = 4,300 main', () => {
    const total = (['fe', 'oto1_lite', 'oto1'] as const).reduce(
      (sum, c) => sum + getPlanGrants(c).main,
      0,
    );
    expect(total).toBe(4300);
  });
});

describe('resolveEntitlements', () => {
  it('gives nothing to an account with no plans', () => {
    const e = resolveEntitlements([]);
    expect(e.maxSeries).toBe(0);
    expect(e.lengthPresets).toEqual([]);
    expect(e.dailyBookCap).toBe(0);
  });

  it('FE only: 3 series, 5 books, short+standard, no OTO features', () => {
    const e = resolveEntitlements(['fe']);
    expect(e.maxSeries).toBe(3);
    expect(e.maxBooksPerSeries).toBe(5);
    expect(e.lengthPresets).toEqual(['short', 'standard']);
    expect(e.paperbackWrap).toBe(false);
    expect(e.boxSets).toBe(false);
    expect(e.templatesTier).toBe('none');
    expect(e.audiobook).toBe(false);
    expect(e.maxClients).toBe(0);
    expect(e.maxResellLicenses).toBe(0);
    expect(e.dailyBookCap).toBe(10);
  });

  it('FE + OTO1 (Unlimited): unlimited series, 30 books, full length, wrap + box sets', () => {
    const e = resolveEntitlements(['fe', 'oto1']);
    expect(e.maxSeries).toBeNull();
    expect(e.maxBooksPerSeries).toBe(30);
    expect(e.lengthPresets).toEqual(['short', 'standard', 'full']);
    expect(e.paperbackWrap).toBe(true);
    expect(e.boxSets).toBe(true);
    // OTO1 does not include templates (PRD §8.8).
    expect(e.templatesTier).toBe('none');
  });

  it('FE + OTO1_lite: 25 series', () => {
    expect(resolveEntitlements(['fe', 'oto1_lite']).maxSeries).toBe(25);
  });

  it('downsell + full OTO together: full OTO wins', () => {
    const e = resolveEntitlements(['fe', 'oto1_lite', 'oto1', 'oto4_lite', 'oto4']);
    expect(e.maxSeries).toBeNull();
    expect(e.maxClients).toBe(100);
  });

  it('applies the FE baseline when only an OTO is held', () => {
    const e = resolveEntitlements(['oto2']);
    expect(e.maxSeries).toBe(3);
    expect(e.templatesTier).toBe('full');
    expect(e.dfyPacks).toBe('full');
  });

  it('templates tiers: lite < full', () => {
    expect(resolveEntitlements(['fe', 'oto2_lite']).templatesTier).toBe('lite');
    expect(resolveEntitlements(['fe', 'oto2_lite', 'oto2']).templatesTier).toBe('full');
  });

  it('OTO3, OTO4, OTO5 feature flags', () => {
    expect(resolveEntitlements(['fe', 'oto3_lite']).audiobook).toBe(true);
    expect(resolveEntitlements(['fe', 'oto4_lite']).maxClients).toBe(25);
    const reseller = resolveEntitlements(['fe', 'oto5_lite']);
    expect(reseller.maxResellLicenses).toBe(50);
    expect(reseller.franchiseKit).toBe(true);
  });

  it('reseller customers always get FE features regardless of plans passed', () => {
    const e = resolveEntitlements(['fe', 'oto1', 'oto4'], { isResellerCustomer: true });
    expect(e.maxSeries).toBe(3);
    expect(e.maxClients).toBe(0);
    expect(e.lengthPresets).toEqual(['short', 'standard']);
  });

  it('agency client gets the owner features (caller passes owner plans)', () => {
    const e = resolveEntitlements(['fe', 'oto1', 'oto4']);
    expect(e.lengthPresets).toContain('full');
  });

  it('applies overrides last', () => {
    const e = resolveEntitlements(['fe'], {}, { dailyBookCap: 3 });
    expect(e.dailyBookCap).toBe(3);
  });

  it('ignores duplicate plan codes', () => {
    expect(resolveEntitlements(['fe', 'fe']).maxSeries).toBe(3);
  });
});

describe('assertCan', () => {
  const fe = resolveEntitlements(['fe']);
  const unlimited = resolveEntitlements(['fe', 'oto1']);

  const codeOf = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return e instanceof AppError ? e.code : 'OTHER';
    }
    return 'OK';
  };

  it('blocks full-length books on FE with PLAN_REQUIRED', () => {
    expect(codeOf(() => assertCan(fe, { kind: 'generateBook', lengthPreset: 'full' }))).toBe(
      'PLAN_REQUIRED',
    );
    expect(codeOf(() => assertCan(fe, { kind: 'generateBook', lengthPreset: 'standard' }))).toBe(
      'OK',
    );
    expect(codeOf(() => assertCan(unlimited, { kind: 'generateBook', lengthPreset: 'full' }))).toBe(
      'OK',
    );
  });

  it('enforces the series limit with LIMIT_REACHED', () => {
    expect(codeOf(() => assertCan(fe, { kind: 'createSeries', activeSeriesCount: 2 }))).toBe('OK');
    expect(codeOf(() => assertCan(fe, { kind: 'createSeries', activeSeriesCount: 3 }))).toBe(
      'LIMIT_REACHED',
    );
    expect(
      codeOf(() => assertCan(unlimited, { kind: 'createSeries', activeSeriesCount: 999 })),
    ).toBe('OK');
  });

  it('blocks series creation entirely when there is no plan', () => {
    const none = resolveEntitlements([]);
    expect(codeOf(() => assertCan(none, { kind: 'createSeries', activeSeriesCount: 0 }))).toBe(
      'PLAN_REQUIRED',
    );
  });

  it('enforces books per series', () => {
    expect(codeOf(() => assertCan(fe, { kind: 'addBook', booksInSeries: 5 }))).toBe(
      'LIMIT_REACHED',
    );
    expect(codeOf(() => assertCan(unlimited, { kind: 'addBook', booksInSeries: 29 }))).toBe('OK');
    expect(codeOf(() => assertCan(unlimited, { kind: 'addBook', booksInSeries: 30 }))).toBe(
      'LIMIT_REACHED',
    );
  });

  it('gates OTO features', () => {
    expect(codeOf(() => assertCan(fe, { kind: 'paperbackWrap' }))).toBe('PLAN_REQUIRED');
    expect(codeOf(() => assertCan(unlimited, { kind: 'boxSet' }))).toBe('OK');
    expect(codeOf(() => assertCan(fe, { kind: 'audiobook' }))).toBe('PLAN_REQUIRED');
    expect(codeOf(() => assertCan(fe, { kind: 'franchiseKit' }))).toBe('PLAN_REQUIRED');
  });

  it('gates template tiers', () => {
    const lite = resolveEntitlements(['fe', 'oto2_lite']);
    expect(codeOf(() => assertCan(lite, { kind: 'templates', tier: 'lite' }))).toBe('OK');
    expect(codeOf(() => assertCan(lite, { kind: 'templates', tier: 'full' }))).toBe(
      'PLAN_REQUIRED',
    );
    expect(codeOf(() => assertCan(fe, { kind: 'templates', tier: 'lite' }))).toBe('PLAN_REQUIRED');
  });

  it('enforces agency client and reseller license counts', () => {
    const agency = resolveEntitlements(['fe', 'oto4_lite']);
    expect(codeOf(() => assertCan(agency, { kind: 'agency', clientCount: 24 }))).toBe('OK');
    expect(codeOf(() => assertCan(agency, { kind: 'agency', clientCount: 25 }))).toBe(
      'LIMIT_REACHED',
    );
    expect(codeOf(() => assertCan(fe, { kind: 'agency', clientCount: 0 }))).toBe('PLAN_REQUIRED');
    const res = resolveEntitlements(['fe', 'oto5']);
    expect(codeOf(() => assertCan(res, { kind: 'reseller', licenseCount: 100 }))).toBe(
      'LIMIT_REACHED',
    );
  });
});

describe('resolveCreditSource', () => {
  it('charges a normal user their own main pool', () => {
    expect(resolveCreditSource({ id: 'u1', parentAgencyId: null }, 'book_standard')).toEqual({
      ownerId: 'u1',
      pool: 'main',
      actingUserId: 'u1',
    });
  });

  it('charges audiobooks to the audio pool', () => {
    expect(resolveCreditSource({ id: 'u1', parentAgencyId: null }, 'audiobook').pool).toBe('audio');
  });

  it("charges an agency client's main-type actions to the owner's agency pool", () => {
    expect(resolveCreditSource({ id: 'c1', parentAgencyId: 'owner' }, 'cover')).toEqual({
      ownerId: 'owner',
      pool: 'agency',
      actingUserId: 'c1',
    });
  });

  it("charges an agency client's audiobook to the owner's audio pool", () => {
    expect(resolveCreditSource({ id: 'c1', parentAgencyId: 'owner' }, 'audiobook')).toEqual({
      ownerId: 'owner',
      pool: 'audio',
      actingUserId: 'c1',
    });
  });

  it('maps length presets to book actions', () => {
    expect(bookCreditAction('short')).toBe('book_short');
    expect(bookCreditAction('full')).toBe('book_full');
  });
});
