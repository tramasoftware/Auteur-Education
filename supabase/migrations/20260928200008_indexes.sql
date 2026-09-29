create index learning_requests_user_created_idx
  on public.learning_requests (user_id, created_at desc);
create index learning_requests_user_state_idx
  on public.learning_requests (user_id, state);
create index objective_versions_request_version_idx
  on public.objective_versions (learning_request_id, version desc);
create index blueprints_user_idx on public.blueprints (user_id);
create index blueprint_versions_blueprint_idx
  on public.blueprint_versions (blueprint_id, version desc);
create index courses_user_created_idx on public.courses (user_id, created_at desc);
create index courses_request_idx on public.courses (request_id);
create index courses_state_idx on public.courses (state);
create index modules_course_idx on public.modules (course_id, index);
create index lessons_module_idx on public.lessons (module_id, index);
create index lessons_course_idx on public.lessons (course_id);
create index generation_traces_request_started_idx
  on public.generation_traces (learning_request_id, started_at);
create index generation_traces_course_idx on public.generation_traces (course_id);
