create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.learning_requests (id) on delete cascade,
  blueprint_id uuid not null unique references public.blueprints (id) on delete cascade,
  blueprint_version int not null,
  title text not null,
  subtitle text not null,
  objective_statement text not null,
  state text not null,
  current_activity text,
  final_synthesis jsonb,
  course_audit jsonb,
  failure text,
  module_limit int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_state_check check (state in (
    'queued',
    'researching',
    'writing',
    'reviewing',
    'partially_available',
    'complete',
    'failed'
  ))
);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  index int not null,
  title text not null,
  function text not null,
  guiding_questions text[] not null default '{}',
  outcome text not null,
  qa_criteria text[] not null default '{}',
  state text not null,
  synthesis text,
  knowledge_check jsonb,
  audit jsonb,
  published_at timestamptz,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, index),
  constraint modules_state_check check (state in (
    'queued',
    'researching',
    'writing',
    'reviewing',
    'published',
    'failed',
    'not_built'
  ))
);

create trigger modules_set_updated_at
  before update on public.modules
  for each row execute function public.set_updated_at();

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  index int not null,
  title text not null,
  purpose text not null,
  state text not null,
  attempts int not null default 0,
  research_rounds int not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  research_questions jsonb not null default '[]'::jsonb,
  unresolved_claims jsonb not null default '[]'::jsonb,
  spec jsonb,
  draft jsonb,
  review jsonb,
  word_count int not null default 0,
  failure text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, index),
  constraint lessons_state_check check (state in (
    'queued',
    'researching',
    'writing',
    'reviewing',
    'approved',
    'failed'
  ))
);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();
