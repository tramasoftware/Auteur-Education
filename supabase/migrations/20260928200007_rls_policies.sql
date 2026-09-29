alter table public.profiles enable row level security;
alter table public.learning_requests enable row level security;
alter table public.objective_versions enable row level security;
alter table public.blueprints enable row level security;
alter table public.blueprint_versions enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.generation_traces enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.learning_requests from anon, authenticated;
revoke all on table public.objective_versions from anon, authenticated;
revoke all on table public.blueprints from anon, authenticated;
revoke all on table public.blueprint_versions from anon, authenticated;
revoke all on table public.courses from anon, authenticated;
revoke all on table public.modules from anon, authenticated;
revoke all on table public.lessons from anon, authenticated;
revoke all on table public.generation_traces from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.learning_requests to authenticated;
grant select, insert, update on table public.objective_versions to authenticated;
grant select, insert, update on table public.blueprints to authenticated;
grant select, insert, update on table public.blueprint_versions to authenticated;
grant select, insert, update on table public.courses to authenticated;
grant select, insert, update on table public.modules to authenticated;
grant select, insert, update on table public.lessons to authenticated;
grant select, insert, update on table public.generation_traces to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy learning_requests_select_own on public.learning_requests
  for select to authenticated using (user_id = auth.uid());
create policy learning_requests_insert_own on public.learning_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy learning_requests_update_own on public.learning_requests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy objective_versions_select_own on public.objective_versions
  for select to authenticated using (user_id = auth.uid());
create policy objective_versions_insert_own on public.objective_versions
  for insert to authenticated with check (user_id = auth.uid());
create policy objective_versions_update_own on public.objective_versions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blueprints_select_own on public.blueprints
  for select to authenticated using (user_id = auth.uid());
create policy blueprints_insert_own on public.blueprints
  for insert to authenticated with check (user_id = auth.uid());
create policy blueprints_update_own on public.blueprints
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blueprint_versions_select_own on public.blueprint_versions
  for select to authenticated using (user_id = auth.uid());
create policy blueprint_versions_insert_own on public.blueprint_versions
  for insert to authenticated with check (user_id = auth.uid());
create policy blueprint_versions_update_own on public.blueprint_versions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy courses_select_own on public.courses
  for select to authenticated using (user_id = auth.uid());
create policy courses_insert_own on public.courses
  for insert to authenticated with check (user_id = auth.uid());
create policy courses_update_own on public.courses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy modules_select_own on public.modules
  for select to authenticated using (user_id = auth.uid());
create policy modules_insert_own on public.modules
  for insert to authenticated with check (user_id = auth.uid());
create policy modules_update_own on public.modules
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy lessons_select_own on public.lessons
  for select to authenticated using (user_id = auth.uid());
create policy lessons_insert_own on public.lessons
  for insert to authenticated with check (user_id = auth.uid());
create policy lessons_update_own on public.lessons
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy generation_traces_select_own on public.generation_traces
  for select to authenticated using (user_id = auth.uid());
create policy generation_traces_insert_own on public.generation_traces
  for insert to authenticated with check (user_id = auth.uid());
create policy generation_traces_update_own on public.generation_traces
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
