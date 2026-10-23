import type { Json } from '@booksaga/db-types';
import type { DbClient } from './db';

export interface AuditEntry {
  actorId: string | null;
  /** e.g. `user.create`, `plan.grant`, `credits.adjust`. */
  action: string;
  /** What was acted on, e.g. `user:<uuid>`. */
  target?: string;
  meta?: Record<string, Json | undefined>;
}

/**
 * Append to the audit log. Failures are logged but never block the action itself.
 */
export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target: entry.target ?? null,
    meta: (entry.meta ?? {}) as Json,
  });
  if (error) console.error('[audit] failed to write entry', entry.action, error.message);
}
