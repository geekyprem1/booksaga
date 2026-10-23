-- BookSaga 0002: RLS, grants, storage policies, realtime
--
-- Supabase no longer auto-exposes new public tables to API roles, so every grant is explicit.
-- Model: browsers (role `authenticated`) read only their own rows. All writes go through the
-- service role (Server Actions / worker) or SECURITY DEFINER functions. Admin pages run on the
-- service role after a server-side `requireAdmin()` check.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS and cannot recurse)
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
  );
$$;

create function public.is_agency_owner_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.agency_clients ac
    where ac.owner_id = (select auth.uid()) and ac.client_id = p_user
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_agency_owner_of(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_agency_owner_of(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.purchases enable row level security;
alter table public.user_plans enable row level security;
alter table public.jobs enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_costs enable row level security;
alter table public.agency_clients enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_usage_log enable row level security;

-- ---------------------------------------------------------------------------
-- Policies (authenticated only; anon gets nothing)
-- ---------------------------------------------------------------------------
-- profiles: self, own agency clients, or admin. Users may edit only name/avatar_url (column grant).
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or parent_agency_id = (select auth.uid())
    or (select public.is_admin())
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- config tables readable by any signed-in user
create policy plans_select on public.plans for select to authenticated using (true);
create policy credit_costs_select on public.credit_costs for select to authenticated using (true);

create policy purchases_select on public.purchases for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy user_plans_select on public.user_plans for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy credit_balances_select on public.credit_balances for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy credit_ledger_select on public.credit_ledger for select to authenticated
  using (
    user_id = (select auth.uid())
    or acting_user_id = (select auth.uid())
    or (select public.is_admin())
  );

-- jobs: the person who triggered it (agency clients see their own jobs), plus admins.
create policy jobs_select on public.jobs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- agency_clients: the owner and the client can see the link.
create policy agency_clients_select on public.agency_clients for select to authenticated
  using (
    owner_id = (select auth.uid())
    or client_id = (select auth.uid())
    or (select public.is_admin())
  );

-- notifications: own rows; users may mark read.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- app_settings, audit_log, ai_usage_log: NO policies => no access for browser roles.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.plans, public.purchases, public.user_plans,
  public.jobs, public.credit_balances, public.credit_ledger, public.credit_costs,
  public.agency_clients, public.notifications
  to authenticated;
-- Column-level: a user can never change their own role/status/parent links.
grant update (name, avatar_url) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Storage policies. Path convention: {user_id}/...  (first folder = owner).
-- Generated files are written by the service role; users read them via signed URLs created
-- server-side after an ownership check. Users may upload only to `uploads` and `avatars`.
-- ---------------------------------------------------------------------------
create policy "owner can read own files" on storage.objects for select to authenticated
  using (
    bucket_id in ('cover-art', 'covers', 'exports', 'audio', 'uploads', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner can upload to uploads and avatars" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('uploads', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner can update uploads and avatars" on storage.objects for update to authenticated
  using (
    bucket_id in ('uploads', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owner can delete uploads and avatars" on storage.objects for delete to authenticated
  using (
    bucket_id in ('uploads', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "public read of public asset buckets" on storage.objects for select to anon, authenticated
  using (bucket_id in ('template-assets', 'branding'));

-- ---------------------------------------------------------------------------
-- Realtime: live job progress + notifications (books is added in the series migration)
-- ---------------------------------------------------------------------------
alter table public.jobs replica identity full;
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.jobs, public.notifications;
