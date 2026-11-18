-- Progress and library reads omit the draft body. has_draft keeps DEC-023
-- (approved and stored) without loading the lesson text.

alter table public.lessons
  add column if not exists has_draft boolean
    generated always as (draft is not null) stored;
