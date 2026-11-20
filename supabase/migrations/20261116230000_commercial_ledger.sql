-- Commercial base (DEC-023). Local only until an explicit apply is authorized.
-- Credits move only inside these functions. A Stripe refund updates the payment
-- and does not call refund_reservation_for_course.
-- service_role is the only caller. anon, authenticated and PUBLIC cannot execute.

create table public.commercial_offers (
  id uuid primary key,
  code text not null unique,
  display_name text not null,
  kind text not null check (kind in ('one_time', 'subscription')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commercial_offer_versions (
  id uuid primary key,
  offer_id uuid not null references public.commercial_offers (id),
  version integer not null check (version > 0),
  credits integer not null check (credits > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  amount_cents integer not null check (amount_cents >= 0),
  stripe_price_id text,
  provisional boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (offer_id, version)
);

create unique index commercial_offer_versions_one_active
  on public.commercial_offer_versions (offer_id)
  where active;

create table public.consumption_rates (
  id uuid primary key,
  rate_key text not null,
  version integer not null check (version > 0),
  credits integer not null check (credits > 0),
  provisional boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rate_key, version)
);

create unique index consumption_rates_one_active
  on public.consumption_rates (rate_key)
  where active;

create table public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_version_id uuid not null references public.commercial_offer_versions (id),
  stripe_checkout_session_id text not null unique,
  status text not null check (status in ('pending', 'completed', 'expired')),
  mode text not null check (mode in ('payment', 'subscription')),
  created_at timestamptz not null default now()
);

create index checkout_sessions_user_idx on public.checkout_sessions (user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_version_id uuid references public.commercial_offer_versions (id),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_charge_id text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_user_idx on public.payments (user_id);

create unique index payments_invoice_uidx
  on public.payments (stripe_invoice_id)
  where stripe_invoice_id is not null;

create unique index payments_intent_uidx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  offer_version_id uuid references public.commercial_offer_versions (id),
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create trigger credit_accounts_set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_id text not null,
  offer_version_id uuid references public.commercial_offer_versions (id),
  credits integer not null check (credits > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index credit_grants_user_idx on public.credit_grants (user_id);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null,
  subject_id text not null,
  course_id uuid,
  rate_key text not null,
  rate_version integer not null,
  credits integer not null check (credits > 0),
  status text not null check (status in ('held', 'consumed', 'released', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

create index credit_reservations_user_idx on public.credit_reservations (user_id);

create index credit_reservations_course_idx
  on public.credit_reservations (course_id)
  where course_id is not null;

create trigger credit_reservations_set_updated_at
  before update on public.credit_reservations
  for each row execute function public.set_updated_at();

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (
    entry_type in ('grant', 'reserve', 'consume', 'release', 'refund')
  ),
  credits integer not null check (credits > 0),
  delta integer not null,
  balance_after integer not null check (balance_after >= 0),
  source_type text,
  source_id text,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

-- Provisional sandbox seed. Not an approved price or consumption unit.
insert into public.commercial_offers (id, code, display_name, kind) values
  (
    '11111111-1111-4111-8111-111111111111',
    'sandbox_one_time',
    'One course (sandbox)',
    'one_time'
  ),
  (
    '22222222-2222-4222-8222-222222222221',
    'sandbox_subscription',
    'Monthly (sandbox)',
    'subscription'
  );

insert into public.commercial_offer_versions (
  id, offer_id, version, credits, currency, amount_cents, stripe_price_id,
  provisional, active
) values
  (
    '11111111-1111-4111-8111-111111111112',
    '11111111-1111-4111-8111-111111111111',
    1, 1, 'usd', 1100, null, true, true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222221',
    1, 1, 'usd', 2200, null, true, true
  );

insert into public.consumption_rates (
  id, rate_key, version, credits, provisional, active
) values (
  '33333333-3333-4333-8333-333333333333',
  'course_build',
  1,
  1,
  true,
  true
);

create or replace function public.grant_credits(
  p_user_id uuid,
  p_source_type text,
  p_source_id text,
  p_credits integer,
  p_offer_version_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inserted uuid;
  v_balance integer;
begin
  if p_user_id is null or p_credits is null or p_credits <= 0 then
    raise exception 'invalid grant';
  end if;
  if p_source_type is null or p_source_id is null or length(btrim(p_source_id)) = 0 then
    raise exception 'missing grant source';
  end if;

  insert into public.credit_accounts (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  insert into public.credit_grants (
    user_id, source_type, source_id, offer_version_id, credits, remaining
  ) values (
    p_user_id, p_source_type, p_source_id, p_offer_version_id, p_credits, p_credits
  )
  on conflict (source_type, source_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  update public.credit_accounts
  set balance = balance + p_credits
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.credit_ledger (
    user_id, entry_type, credits, delta, balance_after, source_type, source_id
  ) values (
    p_user_id, 'grant', p_credits, p_credits, v_balance, p_source_type, p_source_id
  );
  return true;
end;
$$;

create or replace function public.reserve_credits(
  p_user_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_rate_key text,
  p_rate_version integer,
  p_credits integer
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_balance integer;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'invalid reserve';
  end if;

  insert into public.credit_accounts (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.credit_accounts
  where user_id = p_user_id
  for update;

  select status into v_status
  from public.credit_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id
  for update;

  if v_status = 'held' then
    return 'already_held';
  end if;
  if v_status = 'consumed' then
    return 'already_consumed';
  end if;
  if v_status = 'refunded' then
    return 'already_refunded';
  end if;
  if v_balance < p_credits then
    return 'insufficient';
  end if;

  if v_status = 'released' then
    update public.credit_reservations
    set status = 'held',
        credits = p_credits,
        rate_key = p_rate_key,
        rate_version = p_rate_version,
        course_id = null
    where subject_type = p_subject_type and subject_id = p_subject_id;
  else
    insert into public.credit_reservations (
      user_id, subject_type, subject_id, rate_key, rate_version, credits, status
    ) values (
      p_user_id, p_subject_type, p_subject_id, p_rate_key, p_rate_version,
      p_credits, 'held'
    );
  end if;

  update public.credit_accounts
  set balance = balance - p_credits
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.credit_ledger (
    user_id, entry_type, credits, delta, balance_after, source_type, source_id
  ) values (
    p_user_id, 'reserve', p_credits, -p_credits, v_balance, p_subject_type, p_subject_id
  );
  return 'reserved';
end;
$$;

create or replace function public.confirm_reservation(
  p_subject_type text,
  p_subject_id text,
  p_course_id uuid
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_row public.credit_reservations%rowtype;
  v_balance integer;
begin
  select user_id into v_user
  from public.credit_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id;
  if v_user is null then
    return 'missing';
  end if;

  select balance into v_balance
  from public.credit_accounts
  where user_id = v_user
  for update;

  select * into v_row
  from public.credit_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id
  for update;

  if v_row.status = 'consumed' then
    if v_row.course_id is null and p_course_id is not null then
      update public.credit_reservations
      set course_id = p_course_id
      where id = v_row.id;
    end if;
    return 'already_consumed';
  end if;
  if v_row.status <> 'held' then
    return v_row.status;
  end if;

  update public.credit_reservations
  set status = 'consumed', course_id = p_course_id
  where id = v_row.id;

  insert into public.credit_ledger (
    user_id, entry_type, credits, delta, balance_after, source_type, source_id
  ) values (
    v_row.user_id, 'consume', v_row.credits, 0, v_balance, p_subject_type, p_subject_id
  );
  return 'consumed';
end;
$$;

create or replace function public.release_reservation(
  p_subject_type text,
  p_subject_id text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_row public.credit_reservations%rowtype;
  v_balance integer;
begin
  select user_id into v_user
  from public.credit_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id;
  if v_user is null then
    return 'missing';
  end if;

  select balance into v_balance
  from public.credit_accounts
  where user_id = v_user
  for update;

  select * into v_row
  from public.credit_reservations
  where subject_type = p_subject_type and subject_id = p_subject_id
  for update;

  if v_row.status = 'released' then
    return 'already_released';
  end if;
  if v_row.status <> 'held' then
    return v_row.status;
  end if;

  update public.credit_reservations
  set status = 'released'
  where id = v_row.id;

  update public.credit_accounts
  set balance = balance + v_row.credits
  where user_id = v_row.user_id
  returning balance into v_balance;

  insert into public.credit_ledger (
    user_id, entry_type, credits, delta, balance_after, source_type, source_id
  ) values (
    v_row.user_id, 'release', v_row.credits, v_row.credits, v_balance,
    p_subject_type, p_subject_id
  );
  return 'released';
end;
$$;

create or replace function public.refund_reservation_for_course(p_course_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_row public.credit_reservations%rowtype;
  v_balance integer;
begin
  select user_id into v_user
  from public.credit_reservations
  where course_id = p_course_id
  order by created_at desc
  limit 1;
  if v_user is null then
    return 'missing';
  end if;

  select balance into v_balance
  from public.credit_accounts
  where user_id = v_user
  for update;

  select * into v_row
  from public.credit_reservations
  where course_id = p_course_id
  order by created_at desc
  limit 1
  for update;

  if v_row.status = 'refunded' then
    return 'already_refunded';
  end if;
  if v_row.status <> 'consumed' then
    return v_row.status;
  end if;

  update public.credit_reservations
  set status = 'refunded'
  where id = v_row.id;

  update public.credit_accounts
  set balance = balance + v_row.credits
  where user_id = v_row.user_id
  returning balance into v_balance;

  insert into public.credit_ledger (
    user_id, entry_type, credits, delta, balance_after, source_type, source_id
  ) values (
    v_row.user_id, 'refund', v_row.credits, v_row.credits, v_balance,
    'course', p_course_id::text
  );
  return 'refunded';
end;
$$;

create or replace function public._upsert_subscription(
  p_user_id uuid,
  p_subscription_id text,
  p_customer_id text,
  p_offer_version_id uuid,
  p_status text,
  p_period_start bigint,
  p_period_end bigint,
  p_cancel boolean,
  p_created bigint
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_last bigint;
begin
  if p_subscription_id is null or length(btrim(p_subscription_id)) = 0 then
    return;
  end if;

  select last_event_created into v_last
  from public.subscriptions
  where stripe_subscription_id = p_subscription_id
  for update;

  if not found then
    insert into public.subscriptions (
      user_id, offer_version_id, stripe_subscription_id, stripe_customer_id,
      status, current_period_start, current_period_end, cancel_at_period_end,
      last_event_created
    ) values (
      p_user_id,
      p_offer_version_id,
      p_subscription_id,
      coalesce(p_customer_id, ''),
      coalesce(p_status, 'incomplete'),
      case when p_period_start is null then null else to_timestamp(p_period_start) end,
      case when p_period_end is null then null else to_timestamp(p_period_end) end,
      coalesce(p_cancel, false),
      coalesce(p_created, 0)
    );
    return;
  end if;

  if coalesce(p_created, 0) < v_last then
    update public.subscriptions
    set offer_version_id = coalesce(offer_version_id, p_offer_version_id)
    where stripe_subscription_id = p_subscription_id;
    return;
  end if;

  update public.subscriptions
  set status = coalesce(p_status, status),
      stripe_customer_id = coalesce(nullif(p_customer_id, ''), stripe_customer_id),
      offer_version_id = coalesce(p_offer_version_id, offer_version_id),
      current_period_start = case
        when p_period_start is null then current_period_start
        else to_timestamp(p_period_start)
      end,
      current_period_end = case
        when p_period_end is null then current_period_end
        else to_timestamp(p_period_end)
      end,
      cancel_at_period_end = coalesce(p_cancel, cancel_at_period_end),
      last_event_created = coalesce(p_created, last_event_created)
  where stripe_subscription_id = p_subscription_id;
end;
$$;

create or replace function public._upsert_payment(
  p_user_id uuid,
  p_offer_version_id uuid,
  p_checkout_id text,
  p_intent_id text,
  p_invoice_id text,
  p_charge_id text,
  p_amount integer,
  p_currency text,
  p_status text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_invoice_id is not null then
    select id into v_id from public.payments where stripe_invoice_id = p_invoice_id;
  elsif p_intent_id is not null then
    select id into v_id from public.payments where stripe_payment_intent_id = p_intent_id;
  elsif p_charge_id is not null then
    select id into v_id from public.payments where stripe_charge_id = p_charge_id;
  elsif p_checkout_id is not null then
    select id into v_id
    from public.payments
    where stripe_checkout_session_id = p_checkout_id
    order by created_at desc
    limit 1;
  end if;

  if v_id is null then
    if p_user_id is null then
      raise exception 'unresolved customer';
    end if;
    insert into public.payments (
      user_id, offer_version_id, stripe_checkout_session_id, stripe_payment_intent_id,
      stripe_invoice_id, stripe_charge_id, amount_cents, currency, status
    ) values (
      p_user_id, p_offer_version_id, p_checkout_id, p_intent_id, p_invoice_id,
      p_charge_id, coalesce(p_amount, 0), coalesce(p_currency, 'usd'), p_status
    );
    return;
  end if;

  update public.payments
  set status = case when status = 'refunded' then status else p_status end,
      offer_version_id = coalesce(p_offer_version_id, offer_version_id),
      stripe_checkout_session_id = coalesce(p_checkout_id, stripe_checkout_session_id),
      stripe_payment_intent_id = coalesce(p_intent_id, stripe_payment_intent_id),
      stripe_invoice_id = coalesce(p_invoice_id, stripe_invoice_id),
      stripe_charge_id = coalesce(p_charge_id, stripe_charge_id),
      amount_cents = case when p_amount is null then amount_cents else p_amount end,
      currency = coalesce(p_currency, currency)
  where id = v_id;
end;
$$;

create or replace function public._payment_was_refunded(
  p_intent_id text,
  p_invoice_id text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.payments
    where status = 'refunded'
      and (
        (p_intent_id is not null and stripe_payment_intent_id = p_intent_id)
        or (p_invoice_id is not null and stripe_invoice_id = p_invoice_id)
      )
  );
$$;

create or replace function public._apply_commercial_effect(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_effect jsonb := p_event -> 'effect';
  v_kind text := v_effect ->> 'kind';
  v_created bigint := nullif(p_event ->> 'created', '')::bigint;
  v_user uuid;
  v_offer uuid;
  v_credits integer;
  v_customer text := nullif(v_effect ->> 'stripe_customer_id', '');
  v_sub text := nullif(v_effect ->> 'stripe_subscription_id', '');
  v_amount integer := nullif(v_effect ->> 'amount_cents', '')::integer;
  v_source text;
begin
  if v_kind is null or v_kind = 'ignore' then
    return;
  end if;
  if v_kind = 'unresolved' then
    raise exception 'unresolved commercial event';
  end if;

  begin
    v_user := nullif(v_effect ->> 'user_id', '')::uuid;
  exception when invalid_text_representation then
    v_user := null;
  end;
  begin
    v_offer := nullif(v_effect ->> 'offer_version_id', '')::uuid;
  exception when invalid_text_representation then
    v_offer := null;
  end;

  if v_user is null and v_customer is not null then
    select user_id into v_user
    from public.stripe_customers
    where stripe_customer_id = v_customer;
  end if;
  if v_user is null and v_sub is not null then
    select user_id into v_user
    from public.subscriptions
    where stripe_subscription_id = v_sub;
  end if;
  if v_offer is null and v_sub is not null then
    select offer_version_id into v_offer
    from public.subscriptions
    where stripe_subscription_id = v_sub;
  end if;

  if v_kind = 'charge_refunded' then
    perform public._upsert_payment(
      v_user,
      v_offer,
      null,
      nullif(v_effect ->> 'stripe_payment_intent_id', ''),
      nullif(v_effect ->> 'stripe_invoice_id', ''),
      nullif(v_effect ->> 'stripe_charge_id', ''),
      v_amount,
      nullif(v_effect ->> 'currency', ''),
      'refunded'
    );
    return;
  end if;

  if v_user is null then
    raise exception 'unresolved customer';
  end if;

  if v_kind in (
    'subscription_started', 'subscription_updated', 'subscription_deleted', 'invoice_failed'
  ) then
    perform public._upsert_subscription(
      v_user,
      v_sub,
      v_customer,
      v_offer,
      case
        when v_kind = 'subscription_deleted' then 'canceled'
        when v_kind = 'invoice_failed' then 'past_due'
        else nullif(v_effect ->> 'status', '')
      end,
      nullif(v_effect ->> 'period_start', '')::bigint,
      nullif(v_effect ->> 'period_end', '')::bigint,
      case
        when v_effect ? 'cancel_at_period_end'
          then (v_effect ->> 'cancel_at_period_end')::boolean
        else null
      end,
      v_created
    );
  end if;

  if v_kind = 'invoice_failed' then
    perform public._upsert_payment(
      v_user, v_offer, null,
      nullif(v_effect ->> 'stripe_payment_intent_id', ''),
      nullif(v_effect ->> 'stripe_invoice_id', ''),
      nullif(v_effect ->> 'stripe_charge_id', ''),
      v_amount, nullif(v_effect ->> 'currency', ''), 'failed'
    );
    return;
  end if;

  if v_kind in ('subscription_deleted', 'subscription_updated', 'subscription_started') then
    if v_kind = 'subscription_started'
      and nullif(v_effect ->> 'stripe_checkout_session_id', '') is not null then
      update public.checkout_sessions
      set status = 'completed'
      where stripe_checkout_session_id = v_effect ->> 'stripe_checkout_session_id';
    end if;
    return;
  end if;

  if v_kind not in ('one_time_paid', 'invoice_paid') then
    raise exception 'unknown commercial effect';
  end if;

  if v_offer is null then
    raise exception 'offer version missing';
  end if;
  select credits into v_credits
  from public.commercial_offer_versions
  where id = v_offer;
  if v_credits is null then
    raise exception 'offer version missing';
  end if;

  if v_kind = 'invoice_paid' then
    perform public._upsert_subscription(
      v_user, v_sub, v_customer, v_offer,
      coalesce(nullif(v_effect ->> 'status', ''), 'active'),
      nullif(v_effect ->> 'period_start', '')::bigint,
      nullif(v_effect ->> 'period_end', '')::bigint,
      case
        when v_effect ? 'cancel_at_period_end'
          then (v_effect ->> 'cancel_at_period_end')::boolean
        else null
      end,
      v_created
    );
  end if;

  if v_kind = 'one_time_paid'
    and nullif(v_effect ->> 'stripe_checkout_session_id', '') is not null then
    update public.checkout_sessions
    set status = 'completed'
    where stripe_checkout_session_id = v_effect ->> 'stripe_checkout_session_id';
  end if;

  perform public._upsert_payment(
    v_user, v_offer,
    nullif(v_effect ->> 'stripe_checkout_session_id', ''),
    nullif(v_effect ->> 'stripe_payment_intent_id', ''),
    nullif(v_effect ->> 'stripe_invoice_id', ''),
    nullif(v_effect ->> 'stripe_charge_id', ''),
    v_amount, nullif(v_effect ->> 'currency', ''), 'succeeded'
  );

  if coalesce(v_amount, 0) <= 0 then
    return;
  end if;
  if public._payment_was_refunded(
    nullif(v_effect ->> 'stripe_payment_intent_id', ''),
    nullif(v_effect ->> 'stripe_invoice_id', '')
  ) then
    return;
  end if;

  v_source := case
    when v_kind = 'invoice_paid' then v_effect ->> 'stripe_invoice_id'
    else coalesce(
      nullif(v_effect ->> 'stripe_payment_intent_id', ''),
      v_effect ->> 'stripe_checkout_session_id'
    )
  end;

  perform public.grant_credits(
    v_user,
    case when v_kind = 'invoice_paid' then 'subscription_invoice' else 'payment' end,
    v_source,
    v_credits,
    v_offer
  );
end;
$$;

create or replace function public.apply_commercial_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id text := nullif(p_event ->> 'event_id', '');
  v_status text;
begin
  if v_id is null then
    raise exception 'missing event_id';
  end if;

  insert into public.stripe_events (event_id, event_type, status, payload)
  values (v_id, coalesce(p_event ->> 'event_type', 'unknown'), 'processing', p_event)
  on conflict (event_id) do nothing;

  select status into v_status
  from public.stripe_events
  where event_id = v_id
  for update;

  if v_status = 'processed' then
    return jsonb_build_object('status', 'already_processed');
  end if;

  begin
    perform public._apply_commercial_effect(p_event);
    update public.stripe_events
    set status = 'processed',
        error = null,
        processed_at = pg_catalog.now(),
        attempts = attempts + 1
    where event_id = v_id;
    return jsonb_build_object('status', 'processed');
  exception when others then
    update public.stripe_events
    set status = 'failed',
        error = left(sqlerrm, 500),
        attempts = attempts + 1
    where event_id = v_id;
    return jsonb_build_object('status', 'failed');
  end;
end;
$$;

revoke all on function public.grant_credits(uuid, text, text, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_credits(uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.confirm_reservation(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.release_reservation(text, text)
  from public, anon, authenticated;
revoke all on function public.refund_reservation_for_course(uuid)
  from public, anon, authenticated;
revoke all on function public._upsert_subscription(
  uuid, text, text, uuid, text, bigint, bigint, boolean, bigint
) from public, anon, authenticated;
revoke all on function public._upsert_payment(
  uuid, uuid, text, text, text, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public._payment_was_refunded(text, text)
  from public, anon, authenticated;
revoke all on function public._apply_commercial_effect(jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_commercial_event(jsonb)
  from public, anon, authenticated;

grant execute on function public.reserve_credits(uuid, text, text, text, integer, integer)
  to service_role;
grant execute on function public.confirm_reservation(text, text, uuid) to service_role;
grant execute on function public.release_reservation(text, text) to service_role;
grant execute on function public.refund_reservation_for_course(uuid) to service_role;
grant execute on function public.apply_commercial_event(jsonb) to service_role;

alter table public.commercial_offers enable row level security;
alter table public.commercial_offer_versions enable row level security;
alter table public.consumption_rates enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.checkout_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on table public.commercial_offers from public, anon, authenticated;
revoke all on table public.commercial_offer_versions from public, anon, authenticated;
revoke all on table public.consumption_rates from public, anon, authenticated;
revoke all on table public.stripe_customers from public, anon, authenticated;
revoke all on table public.checkout_sessions from public, anon, authenticated;
revoke all on table public.payments from public, anon, authenticated;
revoke all on table public.subscriptions from public, anon, authenticated;
revoke all on table public.stripe_events from public, anon, authenticated;
revoke all on table public.credit_accounts from public, anon, authenticated;
revoke all on table public.credit_grants from public, anon, authenticated;
revoke all on table public.credit_reservations from public, anon, authenticated;
revoke all on table public.credit_ledger from public, anon, authenticated;

grant all on table public.commercial_offers to service_role;
grant all on table public.commercial_offer_versions to service_role;
grant all on table public.consumption_rates to service_role;
grant all on table public.checkout_sessions to service_role;
grant all on table public.stripe_customers to service_role;
grant all on table public.payments to service_role;
grant all on table public.subscriptions to service_role;
grant all on table public.stripe_events to service_role;
grant all on table public.credit_accounts to service_role;
grant all on table public.credit_grants to service_role;
grant all on table public.credit_reservations to service_role;
grant all on table public.credit_ledger to service_role;

create policy stripe_customers_select_own on public.stripe_customers
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy checkout_sessions_select_own on public.checkout_sessions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy payments_select_own on public.payments
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy credit_accounts_select_own on public.credit_accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy credit_grants_select_own on public.credit_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy credit_reservations_select_own on public.credit_reservations
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);
