-- New Supabase projects can disable automatic Data API grants. The pre-request hook runs
-- after role impersonation for every API request, including anonymous public-page requests.
revoke all on function public.guard_worker_request() from public;
grant execute on function public.guard_worker_request() to anon, authenticated, service_role;

-- Version/history tables created after migration 2 have identity sequences of their own.
-- Service-role writes must not depend on the project's historical default privileges.
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
