create table public.blueprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null unique references public.learning_requests (id) on delete cascade,
  proposal_id text not null,
  objective_version int not null,
  state text not null,
  pending_feedback text,
  approved_version int,
  course_id uuid,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blueprints_state_check check (state in (
    'generating',
    'awaiting_approval',
    'approved',
    'failed'
  ))
);

create trigger blueprints_set_updated_at
  before update on public.blueprints
  for each row execute function public.set_updated_at();

create table public.blueprint_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  blueprint_id uuid not null references public.blueprints (id) on delete cascade,
  version int not null,
  visible jsonb not null,
  internal jsonb not null,
  feedback text,
  created_at timestamptz not null default now(),
  unique (blueprint_id, version)
);
