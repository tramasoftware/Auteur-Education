create table public.learning_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  state text not null,
  initial_intent text not null,
  experience_level text not null,
  prior_knowledge text,
  expected_outcome text not null,
  interpretation jsonb not null,
  compatibility jsonb not null,
  precision jsonb not null,
  selected_precision jsonb,
  proposal_set jsonb,
  selected_proposal_id text,
  blueprint_id uuid,
  course_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_requests_state_check check (state in (
    'draft',
    'incompatible',
    'precision_required',
    'objective_confirmation',
    'objective_confirmed',
    'proposals_ready',
    'proposal_selected',
    'blueprint_generating',
    'awaiting_approval',
    'approved'
  )),
  constraint learning_requests_experience_level_check check (experience_level in (
    'None',
    'Basic',
    'Intermediate',
    'Advanced'
  ))
);

create trigger learning_requests_set_updated_at
  before update on public.learning_requests
  for each row execute function public.set_updated_at();

create table public.objective_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  learning_request_id uuid not null references public.learning_requests (id) on delete cascade,
  version int not null,
  statement text not null,
  observable_capability text not null,
  learning_object text not null,
  assumed_level_and_knowledge text not null,
  scope text[] not null default '{}',
  exclusions text[] not null default '{}',
  achievement_criteria text[] not null default '{}',
  medium_limitations text[] not null default '{}',
  confirmed boolean not null default false,
  feedback text,
  created_at timestamptz not null default now(),
  unique (learning_request_id, version)
);
