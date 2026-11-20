-- AUTHORIZED 02D: deploy after managed 02D native V2 schema migration.
-- Native timer timestamps and elapsed duration originate from PostgreSQL,
-- never browser Date.now(). Preserve the pre-existing access contract.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $preflight$
begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='toolbox_issues_confirm_attachment_purged') then
   raise exception 'Native V2 prerequisite not installed' using errcode='55000';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
   ('toolbox_issues_timer_start','toolbox_issues_timer_stop')) then
   raise exception 'Native timer RPCs already exist; refuse redundant activation' using errcode='55000';
 end if;
end $preflight$;

create or replace function public.toolbox_issues_native_v2_capabilities(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 return jsonb_build_object('threadedReplies',true,'attachmentRemoval',true,
   'serverTimer',true);
end $$;

create or replace function public.toolbox_issues_timer_start(
 p_workspace_id uuid,p_issue_id text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.toolbox_issues%rowtype;
 t timestamptz;
 tracking jsonb;
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 select * into r from public.toolbox_issues
 where workspace_id=p_workspace_id and id=p_issue_id::bigint
   and archived_at is null for update;
 if not found then raise exception 'Issue not found' using errcode='P0002'; end if;
 if p_expected_version is null or r.version<>p_expected_version then
   raise exception 'stale issue version' using errcode='40001';
 end if;
 if nullif(r.time_tracking#>>'{running,startedAt}','') is not null then
   raise exception 'TalkBox timer already running' using errcode='23505';
 end if;
 t:=clock_timestamp();
 tracking:=coalesce(r.time_tracking,'{}'::jsonb)
   || jsonb_build_object('running',jsonb_build_object('startedAt',to_jsonb(t)),
       'clockSource','postgresql','clockVersion',1);
 update public.toolbox_issues
 set time_tracking=tracking,updated_at=t,version=version+1
 where workspace_id=p_workspace_id and id=r.id
 returning * into r;
 insert into public.toolbox_issues_activity
  (workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 values(p_workspace_id,'issue',r.id::text,(select auth.uid()),'timer_started',
   jsonb_build_object('startedAt',tracking#>>'{running,startedAt}',
    'clockSource','postgresql'));
 return private.toolbox_issue_json(r);
end $$;

create or replace function public.toolbox_issues_timer_stop(
 p_workspace_id uuid,p_issue_id text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.toolbox_issues%rowtype;
 t timestamptz;
 started timestamptz;
 elapsed bigint;
 previous_seconds bigint;
 total_seconds bigint;
 tracking jsonb;
begin
 if not private.toolbox_issues_has_access(p_workspace_id) then
   raise exception 'access denied' using errcode='42501';
 end if;
 select * into r from public.toolbox_issues
 where workspace_id=p_workspace_id and id=p_issue_id::bigint
   and archived_at is null for update;
 if not found then raise exception 'Issue not found' using errcode='P0002'; end if;
 if p_expected_version is null or r.version<>p_expected_version then
   raise exception 'stale issue version' using errcode='40001';
 end if;
 if coalesce(r.time_tracking#>>'{clockSource}','')<>'postgresql' then
   raise exception 'This timer was not started by PostgreSQL' using errcode='22023';
 end if;
 if nullif(r.time_tracking#>>'{running,startedAt}','') is null then
   raise exception 'No TalkBox timer is running' using errcode='22023';
 end if;
 started:=(r.time_tracking#>>'{running,startedAt}')::timestamptz;
 t:=clock_timestamp();
 elapsed:=floor(extract(epoch from (t-started)))::bigint;
 if elapsed<0 or elapsed>366*24*3600 then
   raise exception 'Invalid elapsed TalkBox duration' using errcode='22023';
 end if;
 previous_seconds:=case
   when (r.time_tracking->>'totalSeconds')~'^[0-9]{1,12}$'
    then (r.time_tracking->>'totalSeconds')::bigint
   else greatest(0,coalesce((r.time_tracking->>'hours')::bigint,0))*3600
      + greatest(0,coalesce((r.time_tracking->>'minutes')::bigint,0))*60
 end;
 total_seconds:=previous_seconds+elapsed;
 if total_seconds>100000*3600+59*60 then
   raise exception 'TalkBox tracked time limit exceeded' using errcode='22003';
 end if;
 tracking:=coalesce(r.time_tracking,'{}'::jsonb)
   || jsonb_build_object('totalSeconds',total_seconds,
     'hours',total_seconds/3600,'minutes',(total_seconds%3600)/60,
     'running',null,'clockSource','postgresql','clockVersion',1,
     'lastStoppedAt',to_jsonb(t));
 update public.toolbox_issues
 set time_tracking=tracking,updated_at=t,version=version+1
 where workspace_id=p_workspace_id and id=r.id
 returning * into r;
 insert into public.toolbox_issues_activity
  (workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
 values(p_workspace_id,'issue',r.id::text,(select auth.uid()),'timer_stopped',
   jsonb_build_object('elapsedSeconds',elapsed,'totalSeconds',total_seconds,
      'clockSource','postgresql'));
 return private.toolbox_issue_json(r);
end $$;

revoke execute on function
 public.toolbox_issues_timer_start(uuid,text,bigint),
 public.toolbox_issues_timer_stop(uuid,text,bigint)
 from public,anon;
grant execute on function
 public.toolbox_issues_timer_start(uuid,text,bigint),
 public.toolbox_issues_timer_stop(uuid,text,bigint)
 to authenticated;

commit;
