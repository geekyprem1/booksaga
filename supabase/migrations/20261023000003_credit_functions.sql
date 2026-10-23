-- BookSaga 0003: atomic credit functions
--
-- Credits are ONE-TIME grants (no monthly reset). Flow for AI actions:
--   reserve_credits -> (job runs) -> commit_credits | refund_credits
-- All functions are SECURITY DEFINER with a fixed search_path and are callable only by the
-- service role. Row locks (FOR UPDATE) make concurrent calls race-free.
--
-- Lock order (to avoid deadlocks): agency_clients row -> credit_balances row.
-- Errors are raised with a stable message code the app matches on:
--   INSUFFICIENT_CREDITS, CLIENT_ALLOTMENT_EXHAUSTED, CLIENT_NOT_FOUND, INVALID_AMOUNT,
--   USER_PLAN_NOT_FOUND, REASON_REQUIRED, ADJUSTMENT_EXCEEDS_BALANCE

create function public.ensure_credit_balance(p_user uuid, p_pool text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.credit_balances (user_id, pool)
  values (p_user, p_pool)
  on conflict (user_id, pool) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- grant_plan_credits: add a plan's one-time credits. Idempotent per (user_plan, pool).
-- Reseller customers (profiles.reseller_owner_id set) get a reduced FE grant.
-- ---------------------------------------------------------------------------
create function public.grant_plan_credits(p_user_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up public.user_plans%rowtype;
  v_plan public.plans%rowtype;
  v_reseller_owner uuid;
  v_amounts jsonb;
  v_pool text;
  v_amount integer;
  v_rows integer;
  v_granted jsonb := '{"main":0,"audio":0,"agency":0}'::jsonb;
begin
  select * into v_up from public.user_plans where id = p_user_plan for update;
  if not found then
    raise exception 'USER_PLAN_NOT_FOUND';
  end if;

  select * into v_plan from public.plans where code = v_up.plan_code;
  select reseller_owner_id into v_reseller_owner from public.profiles where id = v_up.user_id;

  v_amounts := jsonb_build_object(
    'main', v_plan.grant_main_credits,
    'audio', v_plan.grant_audio_credits,
    'agency', v_plan.grant_agency_credits
  );

  if v_reseller_owner is not null and v_plan.code = 'fe' then
    v_amounts := jsonb_set(
      v_amounts, '{main}',
      to_jsonb(coalesce(
        (select (value #>> '{}')::integer from public.app_settings where key = 'reseller_customer_main_credits'),
        100
      ))
    );
  end if;

  foreach v_pool in array array['main', 'audio', 'agency']
  loop
    v_amount := (v_amounts ->> v_pool)::integer;
    continue when v_amount <= 0;

    perform public.ensure_credit_balance(v_up.user_id, v_pool);

    insert into public.credit_ledger (user_id, acting_user_id, pool, amount, status, user_plan_id, reason, settled_at)
    values (v_up.user_id, v_up.user_id, v_pool, v_amount, 'grant', p_user_plan, 'Plan grant: ' || v_plan.code, now())
    on conflict (user_plan_id, pool) where status = 'grant' do nothing;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      update public.credit_balances
        set balance = balance + v_amount
        where user_id = v_up.user_id and pool = v_pool;
      v_granted := jsonb_set(v_granted, array[v_pool], to_jsonb(v_amount));
    end if;
  end loop;

  -- Remember what this row actually granted (used on refund). Never lower an earlier record.
  if v_granted <> '{"main":0,"audio":0,"agency":0}'::jsonb then
    update public.user_plans set credits_granted = v_granted where id = p_user_plan;
  end if;

  return v_granted;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve_credits: debit up-front. Returns the ledger id.
-- Agency client jobs: p_user = agency owner, p_pool = 'agency', p_acting_user = client.
-- ---------------------------------------------------------------------------
create function public.reserve_credits(
  p_user uuid,
  p_pool text,
  p_amount integer,
  p_job uuid default null,
  p_reason text default null,
  p_acting_user uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.agency_clients%rowtype;
  v_balance integer;
  v_ledger bigint;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- 1) agency client allotment (lock first)
  if p_pool = 'agency' and p_acting_user is not null and p_acting_user <> p_user then
    select * into v_client
      from public.agency_clients
      where owner_id = p_user and client_id = p_acting_user
      for update;
    if not found or v_client.status <> 'active' then
      raise exception 'CLIENT_NOT_FOUND';
    end if;
    if v_client.used + p_amount > v_client.allotment then
      raise exception 'CLIENT_ALLOTMENT_EXHAUSTED';
    end if;
    update public.agency_clients set used = used + p_amount where id = v_client.id;
  end if;

  -- 2) pool balance
  perform public.ensure_credit_balance(p_user, p_pool);
  select balance into v_balance
    from public.credit_balances
    where user_id = p_user and pool = p_pool
    for update;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.credit_balances
    set balance = balance - p_amount
    where user_id = p_user and pool = p_pool;

  insert into public.credit_ledger (user_id, acting_user_id, pool, amount, status, job_id, reason)
  values (p_user, coalesce(p_acting_user, p_user), p_pool, -p_amount, 'reserved', p_job, p_reason)
  returning id into v_ledger;

  return v_ledger;
end;
$$;

-- ---------------------------------------------------------------------------
-- commit_credits: reserved -> committed. Returns a status string (idempotent).
-- ---------------------------------------------------------------------------
create function public.commit_credits(p_ledger bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.credit_ledger where id = p_ledger for update;
  if not found then
    return 'not_found';
  end if;
  if v_status = 'committed' then
    return 'already_committed';
  end if;
  if v_status <> 'reserved' then
    return v_status;
  end if;
  update public.credit_ledger set status = 'committed', settled_at = now() where id = p_ledger;
  return 'committed';
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_credits: reserved -> refunded and give the credits back. Idempotent.
-- ---------------------------------------------------------------------------
create function public.refund_credits(p_ledger bigint, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.credit_ledger%rowtype;
  v_amount integer;
begin
  select * into v_l from public.credit_ledger where id = p_ledger for update;
  if not found then
    return 'not_found';
  end if;
  if v_l.status = 'refunded' then
    return 'already_refunded';
  end if;
  if v_l.status <> 'reserved' then
    return 'not_refundable';
  end if;

  v_amount := -v_l.amount;

  if v_l.pool = 'agency' and v_l.acting_user_id is not null and v_l.acting_user_id <> v_l.user_id then
    update public.agency_clients
      set used = greatest(used - v_amount, 0)
      where owner_id = v_l.user_id and client_id = v_l.acting_user_id;
  end if;

  update public.credit_balances
    set balance = balance + v_amount
    where user_id = v_l.user_id and pool = v_l.pool;

  update public.credit_ledger
    set status = 'refunded', settled_at = now(), reason = coalesce(p_reason, reason)
    where id = p_ledger;

  return 'refunded';
end;
$$;

-- ---------------------------------------------------------------------------
-- adjust_credits: admin bonus/support (+) or deduction (-). Balance never goes below 0.
-- ---------------------------------------------------------------------------
create function public.adjust_credits(
  p_user uuid,
  p_pool text,
  p_amount integer,
  p_actor uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform public.ensure_credit_balance(p_user, p_pool);
  select balance into v_balance
    from public.credit_balances
    where user_id = p_user and pool = p_pool
    for update;

  if v_balance + p_amount < 0 then
    raise exception 'ADJUSTMENT_EXCEEDS_BALANCE';
  end if;

  update public.credit_balances
    set balance = balance + p_amount
    where user_id = p_user and pool = p_pool;

  insert into public.credit_ledger (user_id, acting_user_id, pool, amount, status, reason, actor_id, settled_at)
  values (p_user, p_actor, p_pool, p_amount, 'adjust', p_reason, p_actor, now());

  return v_balance + p_amount;
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_plan_credits: refund/chargeback. Take back what this plan granted, but never more than
-- the current balance (credits already spent count as consumed). Idempotent per (user_plan, pool).
-- ---------------------------------------------------------------------------
create function public.revoke_plan_credits(p_user_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up public.user_plans%rowtype;
  v_pool text;
  v_granted integer;
  v_balance integer;
  v_deduct integer;
  v_rows integer;
  v_result jsonb := '{"main":0,"audio":0,"agency":0}'::jsonb;
begin
  select * into v_up from public.user_plans where id = p_user_plan for update;
  if not found then
    raise exception 'USER_PLAN_NOT_FOUND';
  end if;

  foreach v_pool in array array['main', 'audio', 'agency']
  loop
    v_granted := coalesce((v_up.credits_granted ->> v_pool)::integer, 0);
    continue when v_granted <= 0;

    perform public.ensure_credit_balance(v_up.user_id, v_pool);
    select balance into v_balance
      from public.credit_balances
      where user_id = v_up.user_id and pool = v_pool
      for update;

    v_deduct := least(v_balance, v_granted);

    insert into public.credit_ledger (user_id, acting_user_id, pool, amount, status, user_plan_id, reason, settled_at)
    values (v_up.user_id, v_up.user_id, v_pool, -v_deduct, 'revoked', p_user_plan, 'Plan revoked: ' || v_up.plan_code, now())
    on conflict (user_plan_id, pool) where status = 'revoked' do nothing;
    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      update public.credit_balances
        set balance = balance - v_deduct
        where user_id = v_up.user_id and pool = v_pool;
      v_result := jsonb_set(v_result, array[v_pool], to_jsonb(v_deduct));
    end if;
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down execution: service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.ensure_credit_balance(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_plan_credits(uuid) from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, text, integer, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.commit_credits(bigint) from public, anon, authenticated;
revoke all on function public.refund_credits(bigint, text) from public, anon, authenticated;
revoke all on function public.adjust_credits(uuid, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_plan_credits(uuid) from public, anon, authenticated;

grant execute on function public.ensure_credit_balance(uuid, text) to service_role;
grant execute on function public.grant_plan_credits(uuid) to service_role;
grant execute on function public.reserve_credits(uuid, text, integer, uuid, text, uuid) to service_role;
grant execute on function public.commit_credits(bigint) to service_role;
grant execute on function public.refund_credits(bigint, text) to service_role;
grant execute on function public.adjust_credits(uuid, text, integer, uuid, text) to service_role;
grant execute on function public.revoke_plan_credits(uuid) to service_role;
