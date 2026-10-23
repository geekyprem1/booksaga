import { describe, expect, it } from 'vitest';
import { CREDIT_ACTIONS, DEFAULT_CREDIT_COSTS, PLAN_CODES, PLANS } from '@booksaga/shared';
import { admin } from './helpers';

// Keeps the code-side config (packages/shared) and the SQL reference data (migration 0004) in sync.
describe('reference data matches packages/shared', () => {
  it('has all 11 plans with the same prices, levels and one-time grants', async () => {
    const { data, error } = await admin.from('plans').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(PLAN_CODES.length);
    for (const code of PLAN_CODES) {
      const row = data!.find((r) => r.code === code);
      const def = PLANS[code];
      expect(row, code).toBeDefined();
      expect(row).toMatchObject({
        name: def.name,
        level: def.level,
        is_downsell: def.isDownsell,
        grant_main_credits: def.grants.main,
        grant_audio_credits: def.grants.audio,
        grant_agency_credits: def.grants.agency,
      });
      expect(Number(row!.price_usd)).toBe(def.priceUsd);
    }
  });

  it('has every credit cost with the same value and pool', async () => {
    const { data } = await admin.from('credit_costs').select('*');
    expect(data).toHaveLength(CREDIT_ACTIONS.length);
    for (const action of CREDIT_ACTIONS) {
      const row = data!.find((r) => r.action === action);
      expect(row, action).toMatchObject({
        credits: DEFAULT_CREDIT_COSTS[action].credits,
        pool: DEFAULT_CREDIT_COSTS[action].pool,
      });
    }
  });

  it('creates the 8 storage buckets with the right visibility', async () => {
    const { data } = await admin.storage.listBuckets();
    const byId = new Map((data ?? []).map((b) => [b.id, b.public]));
    for (const id of ['cover-art', 'covers', 'exports', 'audio', 'uploads', 'avatars']) {
      expect(byId.get(id), id).toBe(false);
    }
    for (const id of ['template-assets', 'branding']) {
      expect(byId.get(id), id).toBe(true);
    }
  });

  it('ships safe defaults: email OFF, webhooks OFF, maintenance OFF', async () => {
    const { data } = await admin.from('app_settings').select('key, value');
    const get = (k: string) => data!.find((r) => r.key === k)?.value as Record<string, unknown>;
    expect(get('email')).toMatchObject({ enabled: false });
    expect(get('integrations')).toMatchObject({
      warriorplus: { enabled: false },
      jvzoo: { enabled: false },
    });
    expect(get('maintenance')).toMatchObject({ enabled: false });
    expect(data!.find((r) => r.key === 'reseller_customer_main_credits')?.value).toBe(100);
  });
});
