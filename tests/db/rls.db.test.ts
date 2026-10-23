import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { admin, anonClient, cleanupUsers, grantPlan, makeUser, type TestUser } from './helpers';

let A: TestUser;
let B: TestUser;

beforeAll(async () => {
  A = await makeUser({ name: 'Alice' });
  B = await makeUser({ name: 'Bob' });
});
afterAll(cleanupUsers);

const PERMISSION_DENIED = '42501';

describe('profiles', () => {
  it('a user sees only their own profile', async () => {
    const { data, error } = await A.client.from('profiles').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([{ id: A.id }]);
  });

  it('can edit name but never role/status/parent links (column grants)', async () => {
    const ok = await A.client.from('profiles').update({ name: 'Alice 2' }).eq('id', A.id);
    expect(ok.error).toBeNull();
    const { data } = await admin.from('profiles').select('name').eq('id', A.id).single();
    expect(data?.name).toBe('Alice 2');

    for (const patch of [
      { role: 'admin' },
      { status: 'active' },
      { parent_agency_id: B.id },
      { reseller_owner_id: B.id },
      { credentials_pending: true },
    ]) {
      const r = await A.client.from('profiles').update(patch).eq('id', A.id);
      expect(r.error?.code, JSON.stringify(patch)).toBe(PERMISSION_DENIED);
    }
    const { data: after } = await admin.from('profiles').select('role').eq('id', A.id).single();
    expect(after?.role).toBe('user');
  });

  it("cannot modify another user's profile (RLS filters the row)", async () => {
    await A.client.from('profiles').update({ name: 'hacked' }).eq('id', B.id);
    const { data } = await admin.from('profiles').select('name').eq('id', B.id).single();
    expect(data?.name).toBe('Bob');
  });

  it('cannot insert or delete profiles', async () => {
    expect(
      (await A.client.from('profiles').insert({ id: randomUUID(), email: 'x@y.z' })).error?.code,
    ).toBe(PERMISSION_DENIED);
    expect((await A.client.from('profiles').delete().eq('id', B.id)).error?.code).toBe(
      PERMISSION_DENIED,
    );
  });

  it('an admin can read every profile', async () => {
    const root = await makeUser({ role: 'admin' });
    const { data, error } = await root.client.from('profiles').select('id');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([A.id, B.id, root.id]));
  });

  it('a suspended admin loses admin read access', async () => {
    const root = await makeUser({ role: 'admin' });
    await admin.from('profiles').update({ status: 'suspended' }).eq('id', root.id);
    const { data } = await root.client.from('profiles').select('id');
    expect(data).toEqual([{ id: root.id }]);
  });

  it('an agency owner can see their clients, strangers cannot', async () => {
    const owner = await makeUser();
    const client = await makeUser({ parentAgencyId: owner.id });
    await admin.from('agency_clients').insert({ owner_id: owner.id, client_id: client.id });

    const ownerView = await owner.client.from('profiles').select('id').eq('id', client.id);
    expect(ownerView.data).toEqual([{ id: client.id }]);
    const links = await owner.client.from('agency_clients').select('client_id');
    expect(links.data).toEqual([{ client_id: client.id }]);

    const stranger = await A.client.from('profiles').select('id').eq('id', client.id);
    expect(stranger.data).toEqual([]);
    expect((await A.client.from('agency_clients').select('id')).data).toEqual([]);
  });
});

describe('credits, plans and purchases are private', () => {
  it('a user sees only their own balances, ledger and plans', async () => {
    await grantPlan(A.id, 'fe');
    await grantPlan(B.id, 'fe');

    const bal = await A.client.from('credit_balances').select('user_id, pool, balance');
    expect(bal.error).toBeNull();
    expect(bal.data).toEqual([{ user_id: A.id, pool: 'main', balance: 300 }]);

    const ledger = await A.client.from('credit_ledger').select('user_id');
    expect(ledger.data?.every((r) => r.user_id === A.id)).toBe(true);

    const plans = await A.client.from('user_plans').select('user_id');
    expect(plans.data?.every((r) => r.user_id === A.id)).toBe(true);
    expect(plans.data?.length).toBeGreaterThan(0);
  });

  it('users cannot write balances, ledger, plans or purchases directly', async () => {
    const writes = await Promise.all([
      A.client.from('credit_balances').insert({ user_id: A.id, pool: 'audio', balance: 99999 }),
      A.client.from('credit_balances').update({ balance: 99999 }).eq('user_id', A.id),
      A.client
        .from('credit_ledger')
        .insert({ user_id: A.id, pool: 'main', amount: 99999, status: 'grant' }),
      A.client.from('user_plans').insert({ user_id: A.id, plan_code: 'oto1' }),
      A.client.from('purchases').insert({ user_id: A.id, platform: 'manual' }),
    ]);
    for (const w of writes) expect(w.error?.code).toBe(PERMISSION_DENIED);
    const { data } = await admin
      .from('credit_balances')
      .select('balance')
      .eq('user_id', A.id)
      .eq('pool', 'main')
      .single();
    expect(data?.balance).toBe(300);
  });

  it('users cannot call credit functions', async () => {
    const r = await A.client.rpc('reserve_credits', {
      p_user: A.id,
      p_pool: 'main',
      p_amount: 1,
      p_job: null,
      p_reason: 'x',
      p_acting_user: null,
    });
    expect(r.error?.code).toBe(PERMISSION_DENIED);
    const g = await A.client.rpc('grant_plan_credits', { p_user_plan: randomUUID() });
    expect(g.error?.code).toBe(PERMISSION_DENIED);
    const adj = await A.client.rpc('adjust_credits', {
      p_user: A.id,
      p_pool: 'main',
      p_amount: 1000,
      p_actor: A.id,
      p_reason: 'self-serve',
    });
    expect(adj.error?.code).toBe(PERMISSION_DENIED);
  });

  it('anonymous visitors can read nothing', async () => {
    const anon = anonClient();
    for (const table of ['plans', 'profiles', 'credit_balances', 'jobs', 'notifications']) {
      const r = await anon.from(table).select('*').limit(1);
      expect(r.error?.code, table).toBe(PERMISSION_DENIED);
    }
  });

  it('signed-in users can read plan and credit cost config', async () => {
    const plans = await A.client.from('plans').select('code');
    expect(plans.data).toHaveLength(11);
    const costs = await A.client.from('credit_costs').select('action');
    expect(costs.data?.length).toBeGreaterThanOrEqual(9);
  });
});

describe('admin-only tables', () => {
  it('app_settings, audit_log and ai_usage_log are invisible to browser roles', async () => {
    for (const table of ['app_settings', 'audit_log', 'ai_usage_log']) {
      const r = await A.client.from(table).select('*').limit(1);
      expect(r.error?.code, table).toBe(PERMISSION_DENIED);
    }
    const root = await makeUser({ role: 'admin' });
    // Even admins use the service role for these (requireAdmin + server-side); no browser grant.
    expect((await root.client.from('app_settings').select('*').limit(1)).error?.code).toBe(
      PERMISSION_DENIED,
    );
  });
});

describe('notifications', () => {
  it('are private; users can mark read but not edit content', async () => {
    const n = await admin
      .from('notifications')
      .insert([
        { user_id: A.id, type: 'info', title: 'for A' },
        { user_id: B.id, type: 'info', title: 'for B' },
      ])
      .select('id, user_id');
    expect(n.error).toBeNull();
    const aRow = n.data!.find((r) => r.user_id === A.id)!;
    const bRow = n.data!.find((r) => r.user_id === B.id)!;

    const mine = await A.client.from('notifications').select('title');
    expect(mine.data).toEqual([{ title: 'for A' }]);

    const read = await A.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', aRow.id);
    expect(read.error).toBeNull();
    const edit = await A.client.from('notifications').update({ title: 'hacked' }).eq('id', aRow.id);
    expect(edit.error?.code).toBe(PERMISSION_DENIED);

    await A.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', bRow.id);
    const { data } = await admin.from('notifications').select('read_at').eq('id', bRow.id).single();
    expect(data?.read_at).toBeNull();
  });
});

describe('jobs', () => {
  it('a user sees only their own jobs and cannot create or edit them', async () => {
    await admin.from('jobs').insert([
      { user_id: A.id, type: 'cover', idempotency_key: `cover-${randomUUID()}-v1` },
      { user_id: B.id, type: 'cover', idempotency_key: `cover-${randomUUID()}-v1` },
    ]);
    const { data } = await A.client.from('jobs').select('user_id');
    expect(data?.length).toBe(1);
    expect(data?.[0]?.user_id).toBe(A.id);

    const ins = await A.client
      .from('jobs')
      .insert({ user_id: A.id, type: 'cover', idempotency_key: `cover-${randomUUID()}-v1` });
    expect(ins.error?.code).toBe(PERMISSION_DENIED);
    const upd = await A.client.from('jobs').update({ progress: 100 }).eq('user_id', A.id);
    expect(upd.error?.code).toBe(PERMISSION_DENIED);
  });
});

describe('storage', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it('users can upload only into their own folder of uploads/avatars', async () => {
    const own = await A.client.storage
      .from('uploads')
      .upload(`${A.id}/a.png`, png, { contentType: 'image/png' });
    expect(own.error).toBeNull();

    const other = await A.client.storage
      .from('uploads')
      .upload(`${B.id}/a.png`, png, { contentType: 'image/png' });
    expect(other.error).not.toBeNull();

    const wrongBucket = await A.client.storage
      .from('exports')
      .upload(`${A.id}/x.png`, png, { contentType: 'image/png' });
    expect(wrongBucket.error).not.toBeNull();
  });

  it("users cannot read other users' files but can read their own", async () => {
    await A.client.storage
      .from('uploads')
      .upload(`${A.id}/b.png`, png, { contentType: 'image/png', upsert: true });
    expect((await A.client.storage.from('uploads').download(`${A.id}/b.png`)).error).toBeNull();
    expect((await B.client.storage.from('uploads').download(`${A.id}/b.png`)).error).not.toBeNull();
  });

  it('public asset buckets are readable without auth; private ones are not', async () => {
    const up = await admin.storage
      .from('branding')
      .upload(`test-${randomUUID()}.png`, png, { contentType: 'image/png' });
    expect(up.error).toBeNull();
    const url = admin.storage.from('branding').getPublicUrl(up.data!.path).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
    await admin.storage.from('branding').remove([up.data!.path]);

    const priv = await admin.storage
      .from('uploads')
      .upload(`${A.id}/private-${randomUUID()}.png`, png, { contentType: 'image/png' });
    const privUrl = admin.storage.from('uploads').getPublicUrl(priv.data!.path).data.publicUrl;
    expect((await fetch(privUrl)).status).not.toBe(200);
  });
});

describe('auth', () => {
  it('public signup is disabled', async () => {
    const r = await anonClient().auth.signUp({
      email: `nope-${randomUUID()}@booksaga.test`,
      password: 'Sup3r-secret-pw',
    });
    expect(r.error).not.toBeNull();
  });

  it('creating an auth user creates a profile and ignores a role in user metadata', async () => {
    const email = `meta-${randomUUID()}@booksaga.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `Pw-${randomUUID()}`,
      email_confirm: true,
      user_metadata: { name: 'Meta', role: 'admin' },
    });
    expect(error).toBeNull();
    const id = data.user!.id;
    const { data: p } = await admin
      .from('profiles')
      .select('name, role, status, email')
      .eq('id', id)
      .single();
    expect(p).toMatchObject({ name: 'Meta', role: 'user', status: 'active', email });
    await admin.auth.admin.deleteUser(id);
  });

  it('keeps profiles.email in sync with auth email changes', async () => {
    const u = await makeUser();
    const newEmail = `changed-${randomUUID()}@booksaga.test`;
    const r = await admin.auth.admin.updateUserById(u.id, { email: newEmail, email_confirm: true });
    expect(r.error).toBeNull();
    const { data } = await admin.from('profiles').select('email').eq('id', u.id).single();
    expect(data?.email).toBe(newEmail);
  });
});

describe('realtime publication', () => {
  it('publishes jobs and notifications', async () => {
    const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'",
      );
      const names = rows.map((r: { tablename: string }) => r.tablename);
      expect(names).toEqual(expect.arrayContaining(['jobs', 'notifications']));
    } finally {
      await client.end();
    }
  });
});
