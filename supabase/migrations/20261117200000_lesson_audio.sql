-- Lesson narration (DEC-025). Local only until an explicit apply is authorized.
-- FastAPI is the only data plane. Audio does not consume course credits.
-- service_role is the only caller. anon, authenticated and PUBLIC cannot execute.

create table public.lesson_narrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  content_sha256 text not null check (char_length(content_sha256) = 64),
  config_sha256 text not null check (char_length(config_sha256) = 64),
  provider text not null,
  model text not null,
  voice_id text not null default '',
  output_format text not null,
  status text not null check (status in ('queued', 'generating', 'ready', 'failed')),
  error text,
  billed_units integer not null default 0 check (billed_units >= 0),
  estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, content_sha256, config_sha256)
);

create index lesson_narrations_user_status_idx
  on public.lesson_narrations (user_id, status);

create index lesson_narrations_user_month_idx
  on public.lesson_narrations (user_id, created_at);

create trigger lesson_narrations_set_updated_at
  before update on public.lesson_narrations
  for each row execute function public.set_updated_at();

create table public.lesson_narration_chunks (
  id uuid primary key default gen_random_uuid(),
  narration_id uuid not null references public.lesson_narrations (id) on delete cascade,
  index integer not null check (index >= 0),
  text text not null,
  status text not null check (status in ('queued', 'leased', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_job_id text,
  object_path text,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  billed_units integer not null default 0 check (billed_units >= 0),
  media_type text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (narration_id, index)
);

create index lesson_narration_chunks_recover_idx
  on public.lesson_narration_chunks (status, lease_expires_at);

create trigger lesson_narration_chunks_set_updated_at
  before update on public.lesson_narration_chunks
  for each row execute function public.set_updated_at();

create table public.lesson_audio_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  position_ms integer not null default 0 check (position_ms >= 0),
  playback_rate numeric not null default 1 check (playback_rate > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger lesson_audio_progress_set_updated_at
  before update on public.lesson_audio_progress
  for each row execute function public.set_updated_at();

create table public.tts_price_versions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  cents_per_thousand integer not null check (cents_per_thousand >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index tts_price_versions_one_active
  on public.tts_price_versions (provider, model)
  where active;

create or replace function public.claim_lesson_audio_chunk(
  p_narration_id uuid,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected uuid;
  token uuid := gen_random_uuid();
  result jsonb;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 then
    raise exception 'invalid lease';
  end if;

  select c.id into selected
  from public.lesson_narration_chunks c
  where c.narration_id = p_narration_id
    and (
      c.status = 'queued'
      or (c.status = 'leased' and c.lease_expires_at < now())
    )
  order by c.index
  for update skip locked
  limit 1;

  if selected is null then
    return null;
  end if;

  update public.lesson_narration_chunks
  set
    status = 'leased',
    lease_token = token,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    error = null,
    updated_at = now()
  where id = selected
  returning jsonb_build_object(
    'id', id,
    'narration_id', narration_id,
    'index', index,
    'text', text,
    'status', status,
    'attempts', attempts,
    'lease_token', lease_token,
    'lease_expires_at', lease_expires_at,
    'provider_job_id', provider_job_id,
    'object_path', object_path,
    'duration_ms', duration_ms,
    'billed_units', billed_units,
    'media_type', media_type,
    'error', error
  ) into result;

  return result;
end;
$$;

create or replace function public.complete_lesson_audio_chunk(
  p_chunk_id uuid,
  p_lease_token uuid,
  p_object_path text,
  p_duration_ms integer,
  p_billed_units integer,
  p_media_type text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
  narration uuid;
begin
  update public.lesson_narration_chunks
  set
    status = 'ready',
    object_path = p_object_path,
    duration_ms = p_duration_ms,
    billed_units = p_billed_units,
    media_type = p_media_type,
    error = null,
    lease_token = p_lease_token,
    updated_at = now()
  where id = p_chunk_id
    and lease_token = p_lease_token
    and status = 'leased'
  returning narration_id into narration;

  get diagnostics updated = row_count;
  if updated = 0 then
    return false;
  end if;

  update public.lesson_narrations n
  set
    billed_units = s.billed_units,
    duration_ms = s.duration_ms,
    updated_at = now()
  from (
    select
      narration_id,
      coalesce(sum(billed_units), 0)::integer as billed_units,
      coalesce(sum(duration_ms), 0)::integer as duration_ms
    from public.lesson_narration_chunks
    where narration_id = narration
    group by narration_id
  ) s
  where n.id = s.narration_id;

  return true;
end;
$$;

create or replace function public.fail_lesson_audio_chunk(
  p_chunk_id uuid,
  p_lease_token uuid,
  p_error text,
  p_retry boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  update public.lesson_narration_chunks
  set
    status = case when p_retry then 'queued' else 'failed' end,
    error = p_error,
    lease_token = case when p_retry then null else lease_token end,
    lease_expires_at = case when p_retry then null else lease_expires_at end,
    updated_at = now()
  where id = p_chunk_id
    and lease_token = p_lease_token
    and status = 'leased';

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.claim_lesson_audio_chunk(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.complete_lesson_audio_chunk(
  uuid, uuid, text, integer, integer, text
) from public, anon, authenticated;
revoke all on function public.fail_lesson_audio_chunk(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.claim_lesson_audio_chunk(uuid, integer)
  to service_role;
grant execute on function public.complete_lesson_audio_chunk(
  uuid, uuid, text, integer, integer, text
) to service_role;
grant execute on function public.fail_lesson_audio_chunk(uuid, uuid, text, boolean)
  to service_role;

alter table public.lesson_narrations enable row level security;
alter table public.lesson_narration_chunks enable row level security;
alter table public.lesson_audio_progress enable row level security;
alter table public.tts_price_versions enable row level security;

revoke all on table public.lesson_narrations from public, anon, authenticated;
revoke all on table public.lesson_narration_chunks from public, anon, authenticated;
revoke all on table public.lesson_audio_progress from public, anon, authenticated;
revoke all on table public.tts_price_versions from public, anon, authenticated;

grant all on table public.lesson_narrations to service_role;
grant all on table public.lesson_narration_chunks to service_role;
grant all on table public.lesson_audio_progress to service_role;
grant all on table public.tts_price_versions to service_role;

create policy lesson_narrations_block_client
  on public.lesson_narrations as restrictive for all to authenticated
  using (false) with check (false);
create policy lesson_narration_chunks_block_client
  on public.lesson_narration_chunks as restrictive for all to authenticated
  using (false) with check (false);
create policy lesson_audio_progress_block_client
  on public.lesson_audio_progress as restrictive for all to authenticated
  using (false) with check (false);
create policy tts_price_versions_block_client
  on public.tts_price_versions as restrictive for all to authenticated
  using (false) with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-audio',
  'lesson-audio',
  false,
  20971520,
  array['audio/mpeg', 'audio/mp3']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();
