-- Advisor fixes: immutable search_path, RLS initplan, covering indexes on user_id FKs.

alter function public.set_updated_at() set search_path = public;

create index if not exists blueprint_versions_user_idx
  on public.blueprint_versions (user_id);
create index if not exists generation_traces_user_idx
  on public.generation_traces (user_id);
create index if not exists lessons_user_idx on public.lessons (user_id);
create index if not exists modules_user_idx on public.modules (user_id);
create index if not exists objective_versions_user_idx
  on public.objective_versions (user_id);

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists learning_requests_select_own on public.learning_requests;
drop policy if exists learning_requests_insert_own on public.learning_requests;
drop policy if exists learning_requests_update_own on public.learning_requests;
create policy learning_requests_select_own on public.learning_requests
  for select to authenticated using (user_id = (select auth.uid()));
create policy learning_requests_insert_own on public.learning_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy learning_requests_update_own on public.learning_requests
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists objective_versions_select_own on public.objective_versions;
drop policy if exists objective_versions_insert_own on public.objective_versions;
drop policy if exists objective_versions_update_own on public.objective_versions;
create policy objective_versions_select_own on public.objective_versions
  for select to authenticated using (user_id = (select auth.uid()));
create policy objective_versions_insert_own on public.objective_versions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy objective_versions_update_own on public.objective_versions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists blueprints_select_own on public.blueprints;
drop policy if exists blueprints_insert_own on public.blueprints;
drop policy if exists blueprints_update_own on public.blueprints;
create policy blueprints_select_own on public.blueprints
  for select to authenticated using (user_id = (select auth.uid()));
create policy blueprints_insert_own on public.blueprints
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy blueprints_update_own on public.blueprints
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists blueprint_versions_select_own on public.blueprint_versions;
drop policy if exists blueprint_versions_insert_own on public.blueprint_versions;
drop policy if exists blueprint_versions_update_own on public.blueprint_versions;
create policy blueprint_versions_select_own on public.blueprint_versions
  for select to authenticated using (user_id = (select auth.uid()));
create policy blueprint_versions_insert_own on public.blueprint_versions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy blueprint_versions_update_own on public.blueprint_versions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists courses_select_own on public.courses;
drop policy if exists courses_insert_own on public.courses;
drop policy if exists courses_update_own on public.courses;
create policy courses_select_own on public.courses
  for select to authenticated using (user_id = (select auth.uid()));
create policy courses_insert_own on public.courses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy courses_update_own on public.courses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists modules_select_own on public.modules;
drop policy if exists modules_insert_own on public.modules;
drop policy if exists modules_update_own on public.modules;
create policy modules_select_own on public.modules
  for select to authenticated using (user_id = (select auth.uid()));
create policy modules_insert_own on public.modules
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy modules_update_own on public.modules
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists lessons_select_own on public.lessons;
drop policy if exists lessons_insert_own on public.lessons;
drop policy if exists lessons_update_own on public.lessons;
create policy lessons_select_own on public.lessons
  for select to authenticated using (user_id = (select auth.uid()));
create policy lessons_insert_own on public.lessons
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy lessons_update_own on public.lessons
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists generation_traces_select_own on public.generation_traces;
drop policy if exists generation_traces_insert_own on public.generation_traces;
drop policy if exists generation_traces_update_own on public.generation_traces;
create policy generation_traces_select_own on public.generation_traces
  for select to authenticated using (user_id = (select auth.uid()));
create policy generation_traces_insert_own on public.generation_traces
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy generation_traces_update_own on public.generation_traces
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
