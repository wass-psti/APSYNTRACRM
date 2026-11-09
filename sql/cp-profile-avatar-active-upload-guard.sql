-- Require an active canonical profile at the Storage upload boundary.
begin;

drop policy if exists account_avatars_insert_own on storage.objects;

create policy account_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'account-avatars'
  and owner_id = (select auth.uid()::text)
  and cardinality(storage.foldername(name)) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  and exists (
    select 1
    from public.profiles active_profile
    where active_profile.id = (select auth.uid())
      and active_profile.status = 'active'
  )
);

commit;
