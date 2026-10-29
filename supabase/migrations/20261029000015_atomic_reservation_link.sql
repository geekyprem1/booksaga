-- Link a child job's reservation in the same transaction as the debit. If its parent worker
-- loses ownership before enqueueJob's following request, recovery can still find/refund it.
create function public.link_job_reservation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.jobs set ledger_id = new.id
    where id = new.job_id and ledger_id is null;
  if not found then raise exception 'Job is missing or already has a credit reservation'; end if;
  return new;
end;
$$;

create trigger link_job_reservation after insert on public.credit_ledger
  for each row when (new.status = 'reserved' and new.job_id is not null)
  execute function public.link_job_reservation();

revoke all on function public.link_job_reservation() from public, anon, authenticated;
