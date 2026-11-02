-- Uploaded profile photo. avatar_url remains the identity-provider picture.
-- The bucket is public so the stored HTTPS URL can be shown in the app.
-- anon and authenticated have no insert, update, or delete policy: the API
-- writes and deletes with the service role after it verifies the caller.

alter table public.profiles add column image_url text;

alter table public.profiles
  add constraint profiles_image_https
    check (
      image_url is null
      or (image_url ~ '^https://' and char_length(image_url) <= 500)
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();
