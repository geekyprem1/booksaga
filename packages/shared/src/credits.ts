/**
 * Credit actions, costs and pool routing (PRD §4.1).
 * Costs here are the seed defaults; the live values come from the `credit_costs` table.
 */
export const CREDIT_POOLS = ['main', 'audio', 'agency'] as const;
export type CreditPool = (typeof CREDIT_POOLS)[number];

export const CREDIT_ACTIONS = [
  'book_short',
  'book_standard',
  'book_full',
  'cover',
  'enhance',
  'rewrite',
  'metadata',
  'arc_extend',
  'audiobook',
] as const;
export type CreditAction = (typeof CREDIT_ACTIONS)[number];

export interface CreditCost {
  credits: number;
  /** Pool the action normally draws from (for non-agency users). */
  pool: 'main' | 'audio';
}

export const DEFAULT_CREDIT_COSTS: Record<CreditAction, CreditCost> = {
  book_short: { credits: 10, pool: 'main' },
  book_standard: { credits: 20, pool: 'main' },
  book_full: { credits: 35, pool: 'main' },
  cover: { credits: 2, pool: 'main' },
  enhance: { credits: 1, pool: 'main' },
  rewrite: { credits: 1, pool: 'main' },
  metadata: { credits: 1, pool: 'main' },
  arc_extend: { credits: 1, pool: 'main' },
  audiobook: { credits: 15, pool: 'audio' },
};

export type LengthPreset = 'short' | 'standard' | 'full';

export function bookCreditAction(preset: LengthPreset): CreditAction {
  return `book_${preset}` as CreditAction;
}

export interface CreditSourceUser {
  id: string;
  /** Set when the user is an agency client (profiles.parent_agency_id). */
  parentAgencyId: string | null;
}

export interface CreditSource {
  /** Whose balance is debited. */
  ownerId: string;
  pool: CreditPool;
  /** Who triggered the job (used for agency client allotment tracking). */
  actingUserId: string;
}

/**
 * Decide which balance an action is charged to.
 * - Normal user: own pool for the action (main / audio).
 * - Agency client: owner's `agency` pool for main-type actions, owner's `audio` pool for audiobooks.
 */
export function resolveCreditSource(
  user: CreditSourceUser,
  action: CreditAction,
  costs: Record<CreditAction, CreditCost> = DEFAULT_CREDIT_COSTS,
): CreditSource {
  const basePool = costs[action].pool;
  if (user.parentAgencyId) {
    return {
      ownerId: user.parentAgencyId,
      pool: basePool === 'audio' ? 'audio' : 'agency',
      actingUserId: user.id,
    };
  }
  return { ownerId: user.id, pool: basePool, actingUserId: user.id };
}
