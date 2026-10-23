import type { LengthPreset } from './credits';
import { AppError } from './errors';
import {
  DEFAULT_DAILY_BOOK_CAP,
  PLANS,
  SYSTEM_MAX_BOOKS_PER_SERIES,
  type ContentTier,
  type PlanCode,
  type PlanLimits,
} from './plans';

export interface Entitlements extends PlanLimits {
  dailyBookCap: number;
}

/** Entitlements of an account with no active plan. */
export const NO_ENTITLEMENTS: Entitlements = {
  maxSeries: 0,
  maxBooksPerSeries: 0,
  lengthPresets: [],
  paperbackWrap: false,
  boxSets: false,
  templatesTier: 'none',
  dfyPacks: 'none',
  audiobook: false,
  maxClients: 0,
  maxResellLicenses: 0,
  franchiseKit: false,
  dailyBookCap: 0,
};

const TIER_RANK: Record<ContentTier, number> = { none: 0, lite: 1, full: 2 };

function maxTier(a: ContentTier, b: ContentTier): ContentTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** null means unlimited, so it always wins. */
function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a, b);
}

export interface ResolveContext {
  /** Reseller customers always get FE features only (PRD §3.2). */
  isResellerCustomer?: boolean;
}

/**
 * Effective feature entitlements = union/max across all active plans.
 *
 * - An account with at least one active plan always gets the FE baseline (every buyer owns FE).
 * - A downsell and its full OTO may both be held; max() makes the full OTO win.
 * - Agency clients: pass the OWNER's plans (client's own plans are ignored by the caller).
 * - Credits are NOT part of entitlements; they are one-time grants held in credit_balances.
 */
export function resolveEntitlements(
  plans: readonly PlanCode[],
  ctx: ResolveContext = {},
  overrides: Partial<Entitlements> = {},
): Entitlements {
  const active: PlanCode[] = ctx.isResellerCustomer ? ['fe'] : [...new Set(plans)];
  if (active.length === 0) return { ...NO_ENTITLEMENTS, ...overrides };

  const codes = new Set<PlanCode>(active);
  codes.add('fe');

  const result: Entitlements = { ...NO_ENTITLEMENTS, dailyBookCap: DEFAULT_DAILY_BOOK_CAP };
  const presets = new Set<LengthPreset>();
  let seriesCap: number | null | undefined;

  for (const code of codes) {
    const l = PLANS[code].limits;
    if (l.maxSeries !== undefined) {
      seriesCap = seriesCap === undefined ? l.maxSeries : maxNullable(seriesCap, l.maxSeries);
    }
    if (l.maxBooksPerSeries !== undefined) {
      result.maxBooksPerSeries = Math.min(
        SYSTEM_MAX_BOOKS_PER_SERIES,
        Math.max(result.maxBooksPerSeries, l.maxBooksPerSeries),
      );
    }
    l.lengthPresets?.forEach((p) => presets.add(p));
    result.paperbackWrap ||= l.paperbackWrap ?? false;
    result.boxSets ||= l.boxSets ?? false;
    result.audiobook ||= l.audiobook ?? false;
    result.franchiseKit ||= l.franchiseKit ?? false;
    if (l.templatesTier) result.templatesTier = maxTier(result.templatesTier, l.templatesTier);
    if (l.dfyPacks) result.dfyPacks = maxTier(result.dfyPacks, l.dfyPacks);
    result.maxClients = Math.max(result.maxClients, l.maxClients ?? 0);
    result.maxResellLicenses = Math.max(result.maxResellLicenses, l.maxResellLicenses ?? 0);
  }

  result.maxSeries = seriesCap === undefined ? 0 : seriesCap;
  result.lengthPresets = (['short', 'standard', 'full'] as const).filter((p) => presets.has(p));
  return { ...result, ...overrides };
}

/** Capability checks used by Server Actions and the worker (defense in depth). */
export type CapabilityCheck =
  | { kind: 'createSeries'; activeSeriesCount: number }
  | { kind: 'addBook'; booksInSeries: number }
  | { kind: 'generateBook'; lengthPreset: LengthPreset }
  | { kind: 'paperbackWrap' }
  | { kind: 'boxSet' }
  | { kind: 'templates'; tier: Exclude<ContentTier, 'none'> }
  | { kind: 'dfyPacks'; tier: Exclude<ContentTier, 'none'> }
  | { kind: 'audiobook' }
  | { kind: 'agency'; clientCount: number }
  | { kind: 'reseller'; licenseCount: number }
  | { kind: 'franchiseKit' };

/** Throws AppError(PLAN_REQUIRED | LIMIT_REACHED) when the check fails. */
export function assertCan(ent: Entitlements, check: CapabilityCheck): void {
  const planRequired = (what: string) =>
    new AppError('PLAN_REQUIRED', `${what} is not included in your plan.`, { check: check.kind });
  const limitReached = (what: string, limit: number) =>
    new AppError('LIMIT_REACHED', `You have reached the ${what} limit (${limit}) of your plan.`, {
      check: check.kind,
      limit,
    });

  switch (check.kind) {
    case 'createSeries': {
      if (ent.maxSeries === 0) throw planRequired('Creating a series');
      if (ent.maxSeries !== null && check.activeSeriesCount >= ent.maxSeries) {
        throw limitReached('active series', ent.maxSeries);
      }
      return;
    }
    case 'addBook': {
      if (check.booksInSeries >= ent.maxBooksPerSeries) {
        throw limitReached('books per series', ent.maxBooksPerSeries);
      }
      return;
    }
    case 'generateBook': {
      if (!ent.lengthPresets.includes(check.lengthPreset)) {
        throw planRequired(`The ${check.lengthPreset} book length`);
      }
      return;
    }
    case 'paperbackWrap':
      if (!ent.paperbackWrap) throw planRequired('The paperback full-wrap cover');
      return;
    case 'boxSet':
      if (!ent.boxSets) throw planRequired('The Box Set Builder');
      return;
    case 'templates':
      if (TIER_RANK[ent.templatesTier] < TIER_RANK[check.tier]) {
        throw planRequired('This series template');
      }
      return;
    case 'dfyPacks':
      if (TIER_RANK[ent.dfyPacks] < TIER_RANK[check.tier]) {
        throw planRequired('This Done-For-You pack');
      }
      return;
    case 'audiobook':
      if (!ent.audiobook) throw planRequired('Audiobooks');
      return;
    case 'agency': {
      if (ent.maxClients === 0) throw planRequired('Agency client accounts');
      if (check.clientCount >= ent.maxClients)
        throw limitReached('client accounts', ent.maxClients);
      return;
    }
    case 'reseller': {
      if (ent.maxResellLicenses === 0) throw planRequired('Reseller licenses');
      if (check.licenseCount >= ent.maxResellLicenses) {
        throw limitReached('reseller licenses', ent.maxResellLicenses);
      }
      return;
    }
    case 'franchiseKit':
      if (!ent.franchiseKit) throw planRequired('The Franchise kit');
      return;
  }
}

/**
 * Non-throwing capability check for UI gating (`<Gate>`). Server actions still call `assertCan` so
 * a direct call cannot bypass the UI.
 */
export function can(ent: Entitlements, check: CapabilityCheck): boolean {
  switch (check.kind) {
    case 'createSeries':
      return ent.maxSeries !== 0 && (ent.maxSeries === null || check.activeSeriesCount < ent.maxSeries);
    case 'addBook':
      return check.booksInSeries < ent.maxBooksPerSeries;
    case 'generateBook':
      return ent.lengthPresets.includes(check.lengthPreset);
    case 'paperbackWrap':
      return ent.paperbackWrap;
    case 'boxSet':
      return ent.boxSets;
    case 'templates':
      return TIER_RANK[ent.templatesTier] >= TIER_RANK[check.tier];
    case 'dfyPacks':
      return TIER_RANK[ent.dfyPacks] >= TIER_RANK[check.tier];
    case 'audiobook':
      return ent.audiobook;
    case 'agency':
      return ent.maxClients !== 0 && check.clientCount < ent.maxClients;
    case 'reseller':
      return ent.maxResellLicenses !== 0 && check.licenseCount < ent.maxResellLicenses;
    case 'franchiseKit':
      return ent.franchiseKit;
  }
}
