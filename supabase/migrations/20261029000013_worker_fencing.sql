-- Fence every processor Data API mutation in the same transaction as its ownership check.
-- FOR UPDATE makes recovery wait for in-flight mutations; requests arriving after recovery fail.
alter table public.jobs add column execution_token uuid;

create function public.guard_worker_request()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_job public.jobs%rowtype;
begin
  if not (v_headers ? 'x-worker-job') and not (v_headers ? 'x-worker-token') then return; end if;
  if auth.role() is distinct from 'service_role' then
    raise sqlstate 'PT403' using message = 'Worker credentials required';
  end if;
  if current_setting('request.method', true) in ('GET', 'HEAD') then
    select * into v_job from public.jobs where id = (v_headers->>'x-worker-job')::uuid;
  else
    select * into v_job from public.jobs where id = (v_headers->>'x-worker-job')::uuid for update;
  end if;
  if v_job.id is null or v_job.status <> 'active'
    or v_job.execution_token is null
    or v_job.execution_token::text is distinct from v_headers->>'x-worker-token' then
    raise sqlstate 'PT409' using message = 'JOB_LEASE_LOST';
  end if;
end;
$$;

-- Credit settlement, book status, notification and terminal job state share one transaction.
create function public.finish_worker_job(
  p_job uuid, p_token uuid, p_status text, p_refund boolean default false,
  p_message text default null, p_notification jsonb default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_result text;
  v_confirmed boolean := true;
  v_error text := left(p_message, 2000);
  v_notice jsonb := p_notification;
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found or v_job.status <> 'active' or v_job.execution_token is distinct from p_token
    or p_token is null then
    raise sqlstate 'PT409' using message = 'JOB_LEASE_LOST';
  end if;
  if p_status not in ('completed', 'failed', 'cancelled') then raise exception 'Invalid final status'; end if;
  if v_job.ledger_id is not null then
    if p_refund then
      begin
        v_result := public.refund_credits(v_job.ledger_id, coalesce(p_message, 'Job failed'));
        v_confirmed := v_result in ('refunded', 'already_refunded');
      exception when others then
        v_confirmed := false;
      end;
    else
      v_result := public.commit_credits(v_job.ledger_id);
      if v_result not in ('committed', 'already_committed') then raise exception 'Credit commit could not be confirmed'; end if;
    end if;
  elsif v_job.credits_reserved > 0 then
    v_confirmed := false;
    if not p_refund then raise exception 'Credit reservation is missing'; end if;
  end if;
  if not v_confirmed then
    v_error := coalesce(left(p_message, 1900), '') || ' Credit refund could not be confirmed; contact support.';
  end if;
  if p_status = 'failed' and v_notice is null then
    v_notice := jsonb_build_object('title', 'Generation failed', 'type', 'job_failed', 'body',
      left(coalesce(p_message, 'Generation failed'), 300) || case when v_confirmed
        then ' Your credits have been refunded.'
        else ' Your credit refund could not be confirmed. Please contact support.' end);
  elsif p_status = 'cancelled' then
    v_notice := jsonb_build_object('title', 'Generation cancelled', 'type', 'job_cancelled', 'body',
      case when not v_confirmed then 'Your credit refund could not be confirmed. Please contact support.'
        when p_refund then 'Your credits have been refunded.'
        else 'The work completed so far has been kept and charged.' end);
  end if;
  update public.jobs set status = p_status, finished_at = now(), heartbeat_at = null,
    progress = case when p_status = 'completed' then 100 else progress end,
    step_label = case when p_status = 'cancelled' then 'Cancelled' else step_label end,
    error = v_error
    where id = p_job;
  if v_job.type = 'book' and p_status in ('failed', 'cancelled') then
    update public.books set status = case when p_status = 'failed' then 'failed' else 'ready' end
      where id = v_job.ref_id;
  end if;
  if v_notice is not null then
    insert into public.notifications (user_id, title, body, link, type)
      values (v_job.user_id, left(v_notice->>'title', 200), left(v_notice->>'body', 2000),
        v_notice->>'link', coalesce(v_notice->>'type', 'job'));
  end if;
end;
$$;

revoke all on function public.finish_worker_job(uuid, uuid, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_worker_job(uuid, uuid, text, boolean, text, jsonb) to service_role;

-- Supabase's Data API executes this before each request, in that request's transaction.
-- Requests without the worker headers retain the existing RLS/admin behavior.
alter role authenticator set pgrst.db_pre_request = 'public.guard_worker_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
