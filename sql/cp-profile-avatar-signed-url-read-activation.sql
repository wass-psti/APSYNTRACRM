-- Allow authorized profile-avatar reads through Supabase signed URLs.
-- Preserve the existing private bucket, owner-path validation, active-profile
-- checks, and shared-workspace membership boundary.
begin;

drop policy if exists account_avatars_read_shared_workspace on storage.objects;

create policy account_avatars_read_shared_workspace
on storage.objects
for select
to authenticated
using (
  bucket_id = 'account-avatars'
  and cardinality(storage.foldername(name)) = 1
  and owner_id = (storage.foldername(name))[1]
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info',
    'object.sign'
  ])
  and private.profile_avatar_can_read(((storage.foldername(name))[1])::uuid)
);

commit;
