/**
 * Plan matrix (PRD §3.1 / §3.2). 11 plans: FE + 5 OTOs + 5 downsells.
 * `limits` are the feature contributions of a plan; effective entitlements are the union/max
 * across all active plans (see entitlements.ts). `grants` are ONE-TIME credit grants.
 */
import type { LengthPreset } from './credits';
import { z } from 'zod';

export const planLimitsSchema = z
  .object({
    maxSeries: z.number().int().min(0).max(100000).nullable().optional(),
    maxBooksPerSeries: z.number().int().min(0).max(30).optional(),
    lengthPresets: z.array(z.enum(['short', 'standard', 'full'])).optional(),
    paperbackWrap: z.boolean().optional(),
    boxSets: z.boolean().optional(),
    templatesTier: z.enum(['none', 'lite', 'full']).optional(),
    dfyPacks: z.enum(['none', 'lite', 'full']).optional(),
    audiobook: z.boolean().optional(),
    maxClients: z.number().int().min(0).max(100000).optional(),
    maxResellLicenses: z.number().int().min(0).max(100000).optional(),
    franchiseKit: z.boolean().optional(),
  })
  .strict();

export const PLAN_CODES = [
  'fe',
  'oto1_lite',
  'oto1',
  'oto2_lite',
  'oto2',
  'oto3_lite',
  'oto3',
  'oto4_lite',
  'oto4',
  'oto5_lite',
  'oto5',
] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type ContentTier = 'none' | 'lite' | 'full';

export interface PlanLimits {
  /** Active series cap. null = unlimited. */
  maxSeries: number | null;
  maxBooksPerSeries: number;
  lengthPresets: LengthPreset[];
  paperbackWrap: boolean;
  boxSets: boolean;
  templatesTier: ContentTier;
  dfyPacks: ContentTier;
  audiobook: boolean;
  maxClients: number;
  maxResellLicenses: number;
  franchiseKit: boolean;
}

export interface PlanGrants {
  main: number;
  audio: number;
  agency: number;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  /** Marketing level in the funnel. */
  level: 'FE' | 'OTO1' | 'OTO2' | 'OTO3' | 'OTO4' | 'OTO5';
  isDownsell: boolean;
  priceUsd: number;
  /** Feature contributions. Missing keys contribute nothing. */
  limits: Partial<PlanLimits>;
  /** One-time credits added when this plan is granted. */
  grants: PlanGrants;
}

/** Hard system cap on books per series (PRD §3.2). */
export const SYSTEM_MAX_BOOKS_PER_SERIES = 30;

/** Default daily book generation cap per user (PRD §4.3). */
export const DEFAULT_DAILY_BOOK_CAP = 10;

/** One-time main credits for a reseller customer's FE account (PRD §3.2). */
export const RESELLER_CUSTOMER_MAIN_CREDITS = 100;

const NO_GRANTS: PlanGrants = { main: 0, audio: 0, agency: 0 };

export const PLANS: Record<PlanCode, PlanDefinition> = {
  fe: {
    code: 'fe',
    name: 'BookSaga Basic',
    level: 'FE',
    isDownsell: false,
    priceUsd: 17,
    limits: {
      maxSeries: 3,
      maxBooksPerSeries: 5,
      lengthPresets: ['short', 'standard'],
    },
    grants: { ...NO_GRANTS, main: 300 },
  },
  oto1_lite: {
    code: 'oto1_lite',
    name: 'Unlimited Lite',
    level: 'OTO1',
    isDownsell: true,
    priceUsd: 27,
    limits: {
      maxSeries: 25,
      maxBooksPerSeries: SYSTEM_MAX_BOOKS_PER_SERIES,
      lengthPresets: ['short', 'standard', 'full'],
      paperbackWrap: true,
      boxSets: true,
    },
    grants: { ...NO_GRANTS, main: 1000 },
  },
  oto1: {
    code: 'oto1',
    name: 'Unlimited',
    level: 'OTO1',
    isDownsell: false,
    priceUsd: 47,
    limits: {
      maxSeries: null,
      maxBooksPerSeries: SYSTEM_MAX_BOOKS_PER_SERIES,
      lengthPresets: ['short', 'standard', 'full'],
      paperbackWrap: true,
      boxSets: true,
    },
    grants: { ...NO_GRANTS, main: 3000 },
  },
  oto2_lite: {
    code: 'oto2_lite',
    name: 'Done-For-You Lite',
    level: 'OTO2',
    isDownsell: true,
    priceUsd: 17,
    limits: { templatesTier: 'lite', dfyPacks: 'lite' },
    grants: NO_GRANTS,
  },
  oto2: {
    code: 'oto2',
    name: 'Done-For-You',
    level: 'OTO2',
    isDownsell: false,
    priceUsd: 37,
    limits: { templatesTier: 'full', dfyPacks: 'full' },
    grants: NO_GRANTS,
  },
  oto3_lite: {
    code: 'oto3_lite',
    name: 'Audiobook Lite',
    level: 'OTO3',
    isDownsell: true,
    priceUsd: 27,
    limits: { audiobook: true },
    grants: { ...NO_GRANTS, audio: 300 },
  },
  oto3: {
    code: 'oto3',
    name: 'Audiobook',
    level: 'OTO3',
    isDownsell: false,
    priceUsd: 47,
    limits: { audiobook: true },
    grants: { ...NO_GRANTS, audio: 1000 },
  },
  oto4_lite: {
    code: 'oto4_lite',
    name: 'Agency Lite',
    level: 'OTO4',
    isDownsell: true,
    priceUsd: 47,
    limits: { maxClients: 25 },
    grants: { ...NO_GRANTS, agency: 2000 },
  },
  oto4: {
    code: 'oto4',
    name: 'Agency',
    level: 'OTO4',
    isDownsell: false,
    priceUsd: 67,
    limits: { maxClients: 100 },
    grants: { ...NO_GRANTS, agency: 5000 },
  },
  oto5_lite: {
    code: 'oto5_lite',
    name: 'Reseller Lite',
    level: 'OTO5',
    isDownsell: true,
    priceUsd: 67,
    limits: { maxResellLicenses: 50, franchiseKit: true },
    grants: NO_GRANTS,
  },
  oto5: {
    code: 'oto5',
    name: 'Reseller + Franchise',
    level: 'OTO5',
    isDownsell: false,
    priceUsd: 97,
    limits: { maxResellLicenses: 100, franchiseKit: true },
    grants: NO_GRANTS,
  },
};

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

/**
 * One-time credits granted for a plan. Reseller customers only ever hold FE, and their FE grant is
 * reduced to RESELLER_CUSTOMER_MAIN_CREDITS (PRD §3.2).
 */
export function getPlanGrants(
  code: PlanCode,
  ctx: { isResellerCustomer?: boolean } = {},
): PlanGrants {
  const grants = PLANS[code].grants;
  if (ctx.isResellerCustomer && code === 'fe') {
    return { ...grants, main: RESELLER_CUSTOMER_MAIN_CREDITS };
  }
  return { ...grants };
}
