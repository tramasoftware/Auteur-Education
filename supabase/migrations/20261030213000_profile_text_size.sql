-- Reading preference for the signed-in member. Standard keeps the current lesson size.

alter table public.profiles
  add column text_size text not null default 'standard';

alter table public.profiles
  add constraint profiles_text_size
    check (text_size in ('small', 'standard', 'large', 'extra_large'));
