import { AppError, type CreditPool, type CreditSource } from '@booksaga/shared';
import type { DbClient } from './db';

/** Map a Postgres exception raised by the credit functions to an AppError. */
export function mapCreditError(error: { message: string }): AppError {
  const msg = error.message;
  if (msg.includes('INSUFFICIENT_CREDITS')) {
    return new AppError('INSUFFICIENT_CREDITS', 'Not enough credits.');
  }
  if (msg.includes('CLIENT_ALLOTMENT_EXHAUSTED')) {
    return new AppError(
      'CLIENT_ALLOTMENT_EXHAUSTED',
      'Your credit allotment from your agency has run out. Please contact your agency.',
    );
  }
  if (msg.includes('CLIENT_NOT_FOUND')) {
    return new AppError('NOT_FOUND', 'This client account is not linked to an active agency.');
  }
  if (
    msg.includes('REASON_REQUIRED') ||
    msg.includes('INVALID_AMOUNT') ||
    msg.includes('ADJUSTMENT_EXCEEDS_BALANCE')
  ) {
    const text = msg.includes('REASON_REQUIRED')
      ? 'A reason is required.'
      : msg.includes('ADJUSTMENT_EXCEEDS_BALANCE')
        ? 'This deduction is larger than the current balance.'
        : 'Invalid credit amount.';
    return new AppError('VALIDATION', text);
  }
  if (msg.includes('USER_PLAN_NOT_FOUND')) {
    return new AppError('NOT_FOUND', 'Plan assignment not found.');
  }
  return new AppError('INTERNAL', 'Credit operation failed.', { cause: msg });
}

/** Debit credits up-front. Returns the ledger id to commit or refund later. */
export async function reserveCredits(
  db: DbClient,
  args: { source: CreditSource; amount: number; jobId?: string; reason?: string },
): Promise<number> {
  const { source, amount, jobId, reason } = args;
  const { data, error } = await db.rpc('reserve_credits', {
    p_user: source.ownerId,
    p_pool: source.pool,
    p_amount: amount,
    p_job: jobId,
    p_reason: reason,
    p_acting_user: source.actingUserId,
  });
  if (error) throw mapCreditError(error);
  return data;
}

export async function commitCredits(db: DbClient, ledgerId: number): Promise<string> {
  const { data, error } = await db.rpc('commit_credits', { p_ledger: ledgerId });
  if (error) throw mapCreditError(error);
  return data;
}

export async function refundCredits(
  db: DbClient,
  ledgerId: number,
  reason?: string,
): Promise<string> {
  const { data, error } = await db.rpc('refund_credits', { p_ledger: ledgerId, p_reason: reason });
  if (error) throw mapCreditError(error);
  return data;
}

/** Admin bonus (+) or deduction (-). Returns the new balance. */
export async function adjustCredits(
  db: DbClient,
  args: { userId: string; pool: CreditPool; amount: number; actorId: string; reason: string },
): Promise<number> {
  const { data, error } = await db.rpc('adjust_credits', {
    p_user: args.userId,
    p_pool: args.pool,
    p_amount: args.amount,
    p_actor: args.actorId,
    p_reason: args.reason,
  });
  if (error) throw mapCreditError(error);
  return data;
}
