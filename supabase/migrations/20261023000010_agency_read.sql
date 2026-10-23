-- BookSaga 0010: agency owners may read their clients' books (T6.16)
--
-- `series_select` already allowed agency owners; books/chapters hang off `owns_series`, so the
-- helper is widened here. Writes stay with the service role — browsers get SELECT only.

create or replace function public.owns_series(p_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.series s
    where s.id = p_series
      and (
        s.user_id = (select auth.uid())
        or public.is_agency_owner_of(s.user_id)
      )
  );
$$;

create or replace function public.owns_book(p_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.books b
    join public.series s on s.id = b.series_id
    where b.id = p_book
      and (
        s.user_id = (select auth.uid())
        or public.is_agency_owner_of(s.user_id)
      )
  );
$$;
