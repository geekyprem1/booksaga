import 'server-only';
import { QUEUE_NAMES } from '@booksaga/core';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';

const DAY_MS = 24 * 3600 * 1000;
/** Upper bound on rows pulled for in-process aggregation; the page shows a note when it is hit. */
const ROW_CAP = 20_000;

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface CountRow {
  label: string;
  count: number;
}

export interface CostRow {
  label: string;
  costUsd: number;
  calls: number;
}

export interface OverviewStats {
  users: { total: number; active: number; suspended: number; pendingCredentials: number };
  /** Distinct users who started at least one job since 00:00 UTC. */
  activeToday: number;
  /** Completed book jobs. */
  books: { today: number; week: number; month: number };
  failedJobs: { today: number; week: number };
  ai: {
    totalMonth: number;
    totalWeek: number;
    byProvider: CostRow[];
    byPurpose: CostRow[];
    topUsers: (CostRow & { userId: string })[];
    truncated: boolean;
  };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const db = getAdminDb();
  const head = { count: 'exact' as const, head: true };
  const now = Date.now();
  const today = startOfUtcDay().toISOString();
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
  const monthAgo = new Date(now - 30 * DAY_MS).toISOString();

  const booksSince = (iso: string) =>
    db
      .from('jobs')
      .select('id', head)
      .eq('type', 'book')
      .eq('status', 'completed')
      .gte('finished_at', iso);
  const failedSince = (iso: string) =>
    db.from('jobs').select('id', head).eq('status', 'failed').gte('finished_at', iso);

  const [
    total,
    active,
    suspended,
    pending,
    todayJobs,
    booksToday,
    booksWeek,
    booksMonth,
    failedToday,
    failedWeek,
    usage,
  ] = await Promise.all([
    db.from('profiles').select('id', head),
    db.from('profiles').select('id', head).eq('status', 'active'),
    db.from('profiles').select('id', head).eq('status', 'suspended'),
    db.from('profiles').select('id', head).eq('credentials_pending', true),
    db.from('jobs').select('user_id').gte('created_at', today).limit(ROW_CAP),
    booksSince(today),
    booksSince(weekAgo),
    booksSince(monthAgo),
    failedSince(today),
    failedSince(weekAgo),
    db
      .from('ai_usage_log')
      .select('user_id, provider, purpose, cost_usd, created_at')
      .gte('created_at', monthAgo)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP),
  ]);

  const rows = usage.data ?? [];
  const weekCutoff = Date.parse(weekAgo);
  const byProvider = new Map<string, CostRow>();
  const byPurpose = new Map<string, CostRow>();
  const byUser = new Map<string, CostRow & { userId: string }>();
  let totalMonth = 0;
  let totalWeek = 0;

  for (const row of rows) {
    const cost = Number(row.cost_usd) || 0;
    totalMonth += cost;
    if (Date.parse(row.created_at) >= weekCutoff) totalWeek += cost;

    add(byProvider, row.provider, cost);
    add(byPurpose, row.purpose ?? 'other', cost);
    if (row.user_id) {
      const entry = byUser.get(row.user_id) ?? {
        userId: row.user_id,
        label: row.user_id,
        costUsd: 0,
        calls: 0,
      };
      entry.costUsd += cost;
      entry.calls += 1;
      byUser.set(row.user_id, entry);
    }
  }

  const topUsers = [...byUser.values()].sort((a, b) => b.costUsd - a.costUsd).slice(0, 5);
  if (topUsers.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email')
      .in(
        'id',
        topUsers.map((u) => u.userId),
      );
    const emails = new Map((profiles ?? []).map((p) => [p.id, p.email]));
    for (const user of topUsers) user.label = emails.get(user.userId) ?? user.userId;
  }

  return {
    users: {
      total: total.count ?? 0,
      active: active.count ?? 0,
      suspended: suspended.count ?? 0,
      pendingCredentials: pending.count ?? 0,
    },
    activeToday: new Set((todayJobs.data ?? []).map((j) => j.user_id)).size,
    books: {
      today: booksToday.count ?? 0,
      week: booksWeek.count ?? 0,
      month: booksMonth.count ?? 0,
    },
    failedJobs: { today: failedToday.count ?? 0, week: failedWeek.count ?? 0 },
    ai: {
      totalMonth,
      totalWeek,
      byProvider: sortByCost(byProvider),
      byPurpose: sortByCost(byPurpose),
      topUsers,
      truncated: rows.length >= ROW_CAP,
    },
  };
}

function add(map: Map<string, CostRow>, label: string, cost: number): void {
  const entry = map.get(label) ?? { label, costUsd: 0, calls: 0 };
  entry.costUsd += cost;
  entry.calls += 1;
  map.set(label, entry);
}

function sortByCost(map: Map<string, CostRow>): CostRow[] {
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export interface QueueCounts {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

/** Live BullMQ counts. Returns null when Redis cannot be reached within two seconds. */
export async function getQueueCounts(): Promise<QueueCounts[] | null> {
  const queues = getQueues();
  const read = Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const c = await queues[name].getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      return {
        name,
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: c.failed ?? 0,
        completed: c.completed ?? 0,
      };
    }),
  );
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
  try {
    return await Promise.race([read, timeout]);
  } catch {
    return null;
  }
}
