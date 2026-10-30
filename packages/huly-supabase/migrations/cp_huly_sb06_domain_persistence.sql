begin;
alter table huly_rewrite.documents add column if not exists deleted_at timestamptz;
alter table huly_rewrite.documents add column if not exists parent_document_id text generated always as
 (case when payload#>>'{snapshot,attachedToClass}'='tracker:class:Issue'
   and nullif(payload#>>'{snapshot,attachedTo}','') is not null
   then 'huly.issue.'||(payload#>>'{snapshot,attachedTo}') else null end) stored;
alter table huly_rewrite.documents add constraint huly_sb06_parent_fk
 foreign key(board_id,parent_document_id) references huly_rewrite.documents(board_id,document_id) on delete restrict;
create index huly_sb06_parent_idx on huly_rewrite.documents(board_id,parent_document_id) where parent_document_id is not null;
create function huly_rewrite.guard_issue_relationship() returns trigger
language plpgsql security invoker set search_path='' as $body$
declare v_deleted timestamptz; v_parent text;
begin
 v_parent:=case when new.payload#>>'{snapshot,attachedToClass}'='tracker:class:Issue'
 and nullif(new.payload#>>'{snapshot,attachedTo}','') is not null
 then 'huly.issue.'||(new.payload#>>'{snapshot,attachedTo}') else null end;
 if tg_op='UPDATE' and old.deleted_at is not null then
  raise exception 'Removed document cannot be updated' using errcode='23505'; end if;
 if new.deleted_at is not null then
  if exists(select 1 from huly_rewrite.documents c where c.board_id=new.board_id
    and c.parent_document_id=new.document_id and c.deleted_at is null and c.document_id<>new.document_id) then
   raise exception 'Cannot remove a parent Issue with active children' using errcode='23503'; end if;
 elsif v_parent is not null then
  if v_parent=new.document_id then raise exception 'Self parent relation denied' using errcode='23514'; end if;
  select p.deleted_at into v_deleted from huly_rewrite.documents p
   where p.board_id=new.board_id and p.document_id=v_parent for update;
  if not found or v_deleted is not null then
   raise exception 'Issue parent missing or removed' using errcode='23503'; end if;
  if exists (
   with recursive ancestors as (
    select p.parent_document_id parent_id,array[p.document_id]::text[] visited
    from huly_rewrite.documents p where p.board_id=new.board_id and p.document_id=v_parent
    union all
    select p.parent_document_id,a.visited||p.document_id
    from ancestors a join huly_rewrite.documents p on p.board_id=new.board_id and p.document_id=a.parent_id
    where array_length(a.visited,1)<100 and not(p.document_id=any(a.visited))
   ) select 1 from ancestors where parent_id=new.document_id or array_length(visited,1)>=100
  ) then raise exception 'Issue parent cycle or excessive depth' using errcode='23514'; end if;
 end if;
 return new;
end;$body$;
revoke all on function huly_rewrite.guard_issue_relationship() from public;
create trigger huly_sb06_guard_relationship before insert or update on huly_rewrite.documents
 for each row execute function huly_rewrite.guard_issue_relationship();
create table huly_rewrite.transaction_events(
 event_id bigint generated always as identity primary key,
 board_id uuid not null, workspace_id uuid not null,document_id text not null,
 event_type text not null check(event_type in('create','update','remove')),
 revision bigint not null check(revision>0),actor_id uuid not null,
 tx_id bigint not null,occurred_at timestamptz not null default now());
create index huly_sb06_events_scope_idx on huly_rewrite.transaction_events(board_id,event_id);
alter table huly_rewrite.transaction_events enable row level security;
alter table huly_rewrite.transaction_events force row level security;
revoke all on huly_rewrite.transaction_events from public,anon;
grant select,insert(board_id,workspace_id,document_id,event_type,revision,actor_id,tx_id)
 on huly_rewrite.transaction_events to authenticated;
create policy huly_sb06_events_read on huly_rewrite.transaction_events for select to authenticated
 using(public.work_board_access(board_id,'view') and workspace_id=public.current_workspace_id());
create policy huly_sb06_events_insert on huly_rewrite.transaction_events for insert to authenticated
 with check(actor_id=auth.uid() and public.work_board_access(board_id,'edit')
  and workspace_id=public.current_workspace_id());
create function huly_rewrite.log_document_event() returns trigger
 language plpgsql security invoker set search_path='' as $body$
begin
 insert into huly_rewrite.transaction_events(board_id,workspace_id,document_id,event_type,revision,actor_id,tx_id)
 values(new.board_id,new.workspace_id,new.document_id,
 case when tg_op='INSERT' then 'create' when new.deleted_at is not null then 'remove' else 'update' end,
 new.revision,auth.uid(),txid_current());
 return null;
end;$body$;
revoke all on function huly_rewrite.log_document_event() from public;
create trigger huly_sb06_document_event after insert or update on huly_rewrite.documents
 for each row execute function huly_rewrite.log_document_event();
create or replace view public.huly_sb02_documents with(security_invoker=true) as
 select board_id,workspace_id,document_id,payload,revision,created_at,updated_at,updated_by
 from huly_rewrite.documents where deleted_at is null;
grant update(deleted_at) on huly_rewrite.documents to authenticated;
create or replace view public.huly_sb06_events with(security_invoker=true) as
 select event_id,board_id,workspace_id,document_id,event_type,revision,actor_id,tx_id,occurred_at
 from huly_rewrite.transaction_events;
revoke all on public.huly_sb06_events from public,anon;
grant select on public.huly_sb06_events to authenticated;
create function public.huly_sb06_transact(p_board_id uuid,p_workspace_id uuid,p_operations jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $body$
declare op jsonb;v_id text;v_action text;v_expected bigint;v_rev bigint;
 v_seen text[]:='{}';v_results jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or p_board_id is null or p_workspace_id is null
  or p_workspace_id is distinct from public.current_workspace_id()
  or not public.work_board_access(p_board_id,'edit') then
  raise exception 'Board access denied' using errcode='42501'; end if;
 if jsonb_typeof(p_operations) is distinct from 'array' then
  raise exception 'Operations must be an array' using errcode='22023'; end if;
 if jsonb_array_length(p_operations) not between 1 and 25 or octet_length(p_operations::text)>230000 then
  raise exception 'Invalid bounded batch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_board_id::text,644208));
 for op in select value from jsonb_array_elements(p_operations) loop
  v_id:=op->>'documentId';v_action:=op->>'action';
  if jsonb_typeof(op) is distinct from 'object' or v_id is null or
   v_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$' or v_id=any(v_seen) or
   v_action not in('create','update','remove') or v_action is null then
   raise exception 'Invalid or duplicate operation' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_id);
  if v_action='create' then
   if not(op ? 'payload') or op->'payload'='null'::jsonb or
    (op ? 'expectedRevision' and op->'expectedRevision'<>'null'::jsonb) then
    raise exception 'Invalid create payload' using errcode='22023'; end if;
   insert into huly_rewrite.documents(board_id,workspace_id,document_id,payload,updated_by)
    values(p_board_id,p_workspace_id,v_id,op->'payload',auth.uid()) returning revision into v_rev;
  else
   if jsonb_typeof(op->'expectedRevision') is distinct from 'number' or
    op->>'expectedRevision' !~ '^[1-9][0-9]{0,15}$' then
    raise exception 'Invalid revision' using errcode='22023'; end if;
   v_expected:=(op->>'expectedRevision')::bigint;
   if v_expected>9007199254740991 then
    raise exception 'Revision out of range' using errcode='22023'; end if;
   if v_action='update' then
    if not(op ? 'payload') or op->'payload'='null'::jsonb then
     raise exception 'Missing payload' using errcode='22023'; end if;
    update huly_rewrite.documents set payload=op->'payload'
     where board_id=p_board_id and workspace_id=p_workspace_id
     and document_id=v_id and deleted_at is null and revision=v_expected returning revision into v_rev;
   else
    if op ? 'payload' then raise exception 'Remove cannot contain payload' using errcode='22023'; end if;
    update huly_rewrite.documents set deleted_at=now()
     where board_id=p_board_id and workspace_id=p_workspace_id
     and document_id=v_id and deleted_at is null and revision=v_expected returning revision into v_rev;
   end if;
   if not found then raise exception 'Revision conflict' using errcode='23505'; end if;
  end if;
  v_results:=v_results||jsonb_build_array(jsonb_build_object(
   'id',v_id,'boardId',p_board_id,'workspaceId',p_workspace_id,'revision',v_rev));
 end loop;
 return v_results;
end;$body$;
revoke all on function public.huly_sb06_transact(uuid,uuid,jsonb) from public,anon;
grant execute on function public.huly_sb06_transact(uuid,uuid,jsonb) to authenticated;
commit;