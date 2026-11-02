-- Library folders show structure counts without loading lesson bodies.
-- The updated_at trigger stays off for the backfill so existing order is kept.

alter table public.courses
  add column module_count integer not null default 0,
  add column lesson_count integer not null default 0;

alter table public.courses disable trigger courses_set_updated_at;

update public.courses as course
set
  module_count = (
    select count(*)::integer
    from public.modules as module
    where module.course_id = course.id
  ),
  lesson_count = (
    select count(*)::integer
    from public.lessons as lesson
    where lesson.course_id = course.id
  );

alter table public.courses enable trigger courses_set_updated_at;
