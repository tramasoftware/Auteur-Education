-- BR-ONB-004: the stored level value is Beginner. Existing Basic rows stay valid.
-- Drop the check first: Postgres rejects the new value while the old check is still in place.

alter table public.learning_requests
  drop constraint learning_requests_experience_level_check;

update public.learning_requests
set experience_level = 'Beginner'
where experience_level = 'Basic';

alter table public.learning_requests
  add constraint learning_requests_experience_level_check
  check (experience_level in (
    'None',
    'Beginner',
    'Intermediate',
    'Advanced'
  ));
