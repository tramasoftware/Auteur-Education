-- Product identity replaces the seeded demo user (DEC-011).
-- Deleting the auth user cascades to profiles and domain rows.

delete from auth.users
where id = '00000000-0000-0000-0000-000000000001';

-- FastAPI writes with service_role. The browser must not read domain tables
-- through the Data API, including blueprint_versions.internal.

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.learning_requests from public, anon, authenticated;
revoke all on table public.objective_versions from public, anon, authenticated;
revoke all on table public.blueprints from public, anon, authenticated;
revoke all on table public.blueprint_versions from public, anon, authenticated;
revoke all on table public.courses from public, anon, authenticated;
revoke all on table public.modules from public, anon, authenticated;
revoke all on table public.lessons from public, anon, authenticated;
revoke all on table public.generation_traces from public, anon, authenticated;

-- If grants are ever restored, an anonymous JWT still cannot use these tables.
-- A missing is_anonymous claim stays allowed so permanent sessions are not locked out.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'learning_requests',
    'objective_versions',
    'blueprints',
    'blueprint_versions',
    'courses',
    'modules',
    'lessons',
    'generation_traces'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_block_anonymous',
      table_name
    );
    execute format(
      $policy$
        create policy %I
        on public.%I
        as restrictive
        for all
        to authenticated
        using (
          (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
        )
        with check (
          (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
        )
      $policy$,
      table_name || '_block_anonymous',
      table_name
    );
  end loop;
end $$;
