-- AUTHORIZED 02D: controlled production activation of native V2 (approved by user 2026-11-20).
-- Reuses the current workspace authentication and Toolbox access contract.
-- Neither source monday.com nor any external service is involved.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.toolbox_issue_updates
  add column if not exists reply_to_update_id bigint references public.toolbox_issue_updates(id);
create index if not exists toolbox_issue_updates_parent_idx
  on public.toolbox_issue_updates(workspace_id,issue_id,reply_to_update_id)
  where reply_to_update_id is not null;
alter table public.toolbox_issue_attachments
  add column if not exists deleted_at timestamptz;
alter table public.toolbox_issue_attachments
  add column if not exists storage_purged_at timestamptz;

do $preflight$
declare a text; b text;
begin
 select md5(pg_get_functiondef(p.oid)) into a from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='toolbox_issue_json';
 select md5(pg_get_functiondef(p.oid)) into b from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='toolbox_issue_update_json';
 if a<>'5a53d8b00e2d2856c9e7289248a87c11' or
    b<>'11d52a420c34126c8b936e46092fa15d' then
  raise exception 'Toolbox live projection fingerprint changed; refuse V2 activation' using errcode='55000';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
   ('toolbox_issues_reply_update','toolbox_issues_unregister_attachment',
    'toolbox_issues_confirm_attachment_purged','toolbox_issues_native_v2_capabilities')) then
  raise exception 'Toolbox Native V2 already installed or partially installed' using errcode='55000';
 end if;
end $preflight$;

create or replace function private.toolbox_issue_update_json(u public.toolbox_issue_updates)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',u.id::text,
    'text_body',u.text_body,
    'created_at',u.created_at,
    'replyTo',u.reply_to_update_id::text,
    'creator',private.toolbox_issues_profile_json(u.creator_user_id),
    'assets',coalesce((select jsonb_agg(private.toolbox_issue_asset_json(a) order by a.created_at)
      from public.toolbox_issue_attachments a
      where a.workspace_id=u.workspace_id and a.update_id=u.id and a.deleted_at is null),'[]'::jsonb))
$$;
-- Match all existing issue projections and signed list readbacks: deleted files
-- remain in the audit table but not in the active application file list.
create or replace function private.toolbox_issue_json(i public.toolbox_issues)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(i.payload,'{}'::jsonb)||jsonb_build_object(
   'id',i.id::text,'name',i.name,'status',i.status,'person',i.person,
   'date',i.target_date,'timeTracking',i.time_tracking,
   'creator',private.toolbox_issues_profile_json(i.creator_user_id),
   'createdAt',i.created_at,'updatedAt',i.updated_at,'version',i.version,
   'subitems',coalesce((select jsonb_agg(private.toolbox_issue_subitem_json(s) order by s.id)
     from public.toolbox_issue_subitems s where s.workspace_id=i.workspace_id and s.issue_id=i.id),'[]'::jsonb),
   'updates',coalesce((select jsonb_agg(private.toolbox_issue_update_json(u) order by u.created_at desc)
     from public.toolbox_issue_updates u where u.workspace_id=i.workspace_id and u.issue_id=i.id),'[]'::jsonb),
   'assets',coalesce((select jsonb_agg(private.toolbox_issue_asset_json(a) order by a.created_at)
     from public.toolbox_issue_attachments a where a.workspace_id=i.workspace_id
       and a.issue_id=i.id and a.update_id is null and a.deleted_at is null),'[]'::jsonb),
   'pendingAttachmentCleanup',coalesce((select jsonb_agg(private.toolbox_issue_asset_json(a) order by a.created_at)
     from public.toolbox_issue_attachments a where a.workspace_id=i.workspace_id
       and a.issue_id=i.id and a.deleted_at is not null
       and a.storage_purged_at is null),'[]'::jsonb))
$$;

create or replace function public.toolbox_issues_native_v2_capabilities(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 return jsonb_build_object('threadedReplies',true,'attachmentRemoval',true);
end $$;

create or replace function public.toolbox_issues_reply_update(
 p_workspace_id uuid,p_issue_id text,p_parent_update_id text,p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.toolbox_issue_updates%rowtype;
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 if char_length(trim(coalesce(p_text,''))) not between 1 and 20000 then
   raise exception 'reply text required' using errcode='22023';
 end if;
 if not exists(select 1 from public.toolbox_issues i where i.workspace_id=p_workspace_id
   and i.id=p_issue_id::bigint and i.archived_at is null) then
   raise exception 'Issue not found' using errcode='P0002';
 end if;
 if not exists(select 1 from public.toolbox_issue_updates parent_update
   where parent_update.workspace_id=p_workspace_id
     and parent_update.issue_id=p_issue_id::bigint
     and parent_update.id=p_parent_update_id::bigint
     and parent_update.reply_to_update_id is null) then
   raise exception 'Parent update not found in issue' using errcode='P0002';
 end if;
 insert into public.toolbox_issue_updates(
   workspace_id,issue_id,creator_user_id,text_body,reply_to_update_id)
 values(p_workspace_id,p_issue_id::bigint,(select auth.uid()),trim(p_text),p_parent_update_id::bigint)
 returning * into u;
 update public.toolbox_issues set updated_at=now(),version=version+1
 where workspace_id=p_workspace_id and id=p_issue_id::bigint;
 insert into public.toolbox_issues_activity(
   workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 values(p_workspace_id,'issue',p_issue_id,(select auth.uid()),'reply_added',
   jsonb_build_object('parentUpdateId',p_parent_update_id,'replyId',u.id::text));
 return private.toolbox_issue_update_json(u);
end $$;

-- Two-step deletion: hide attachment while retaining audit and immutable path,
-- then remove private Storage object. A retry returns the same path; no file path
-- can be supplied by the caller, preventing arbitrary Storage deletion.
create or replace function public.toolbox_issues_unregister_attachment(
 p_workspace_id uuid,p_issue_id text,p_attachment_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.toolbox_issue_attachments%rowtype;
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 select * into a from public.toolbox_issue_attachments
 where workspace_id=p_workspace_id and issue_id=p_issue_id::bigint
   and id=p_attachment_id::bigint for update;
 if not found then
   raise exception 'Attachment not found in issue' using errcode='P0002';
 end if;
 if a.deleted_at is null then
   update public.toolbox_issue_attachments set deleted_at=now()
   where id=a.id and workspace_id=p_workspace_id;
   update public.toolbox_issues set updated_at=now(),version=version+1
   where id=a.issue_id and workspace_id=p_workspace_id;
   insert into public.toolbox_issues_activity(
      workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
   values(p_workspace_id,'attachment',a.id::text,(select auth.uid()),'attachment_removed',
      jsonb_build_object('issueId',p_issue_id));
 end if;
 return jsonb_build_object('success',true,'id',a.id::text,
   'storagePath',a.storage_path,'issueId',p_issue_id);
end $$;

-- The server verifies that Storage has no object before acknowledging purge.
create or replace function public.toolbox_issues_confirm_attachment_purged(
 p_workspace_id uuid,p_issue_id text,p_attachment_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.toolbox_issue_attachments%rowtype;
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 select * into a from public.toolbox_issue_attachments
 where workspace_id=p_workspace_id and issue_id=p_issue_id::bigint
   and id=p_attachment_id::bigint for update;
 if not found or a.deleted_at is null then
   raise exception 'No pending attachment removal' using errcode='P0002';
 end if;
 if exists(select 1 from storage.objects obj
   where obj.bucket_id='toolbox-issues-attachments' and obj.name=a.storage_path) then
   raise exception 'Attachment binary is still registered in Storage' using errcode='22023';
 end if;
 update public.toolbox_issue_attachments set storage_purged_at=coalesce(storage_purged_at,now())
 where id=a.id and workspace_id=p_workspace_id and storage_purged_at is null;
 return jsonb_build_object('success',true,'id',a.id::text,
   'storagePath',a.storage_path,'issueId',p_issue_id);
end $$;

revoke execute on function public.toolbox_issues_native_v2_capabilities(uuid),
 public.toolbox_issues_reply_update(uuid,text,text,text),
 public.toolbox_issues_unregister_attachment(uuid,text,text),
 public.toolbox_issues_confirm_attachment_purged(uuid,text,text)
 from public,anon;
grant execute on function public.toolbox_issues_native_v2_capabilities(uuid),
 public.toolbox_issues_reply_update(uuid,text,text,text),
 public.toolbox_issues_unregister_attachment(uuid,text,text),
 public.toolbox_issues_confirm_attachment_purged(uuid,text,text)
 to authenticated;
commit;
