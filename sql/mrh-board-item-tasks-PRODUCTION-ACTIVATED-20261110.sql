-- Exact code deployed through Supabase migration 20261110062757
-- Material Request Hub — additive tasks / read and write RPC activation.
-- Kept here as a source-controlled copy of the reviewed guarded activation.
-- DO NOT REAPPLY after migration history reports it installed.
do $mrh_activation_guard$
declare v_ok boolean;
begin
 select count(*)=1 into v_ok
 from public.work_boards b
 where b.id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
 and b.name='Material Request Hub' and b.status='active'
 and b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
 and (select count(*) from public.work_board_groups g where g.board_id=b.id)=1
 and (select count(*) from public.work_board_groups g where g.board_id=b.id and
   g.id='21566a87-b287-4a61-b521-bb233956e09e'::uuid and g.title='Main group' and g.position=0)=1
 and (select count(*) from public.work_board_columns c where c.board_id=b.id)=8;
 if not coalesce(v_ok,false) then
   raise exception 'MRH board identity, group or original columns drift: activation refused';
 end if;
 if to_regclass('private.mrh_board_item_tasks') is not null or
    to_regprocedure('public.mrh_board_item_tasks_read(uuid,uuid)') is not null or
    to_regprocedure('public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)') is not null then
   raise exception 'MRH task activation objects already present: refuse duplicate installation';
 end if;
 if to_regprocedure('private.mrh_sourcing_scope(uuid,uuid)') is null or
    to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') is null or
    to_regprocedure('public.work_board_access(uuid,text)') is null then
   raise exception 'MRH dependent auth/audit procedures are missing';
 end if;
end
$mrh_activation_guard$;

create table private.mrh_board_item_tasks (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete restrict,
 board_id uuid not null references public.work_boards(id) on delete restrict,
 item_id uuid not null references public.work_board_items(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 240),
 status text not null default 'not_started'
   check (status in ('not_started','working_on_it','done')),
 revision bigint not null default 1 check (revision>=1),
 created_by uuid not null references public.profiles(id),
 updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index mrh_board_item_tasks_item_order_idx
 on private.mrh_board_item_tasks(board_id,item_id,created_at,id);
alter table private.mrh_board_item_tasks enable row level security;
alter table private.mrh_board_item_tasks force row level security;
-- No policies. Public API is solely through checked RPC; no direct grants.
revoke all on private.mrh_board_item_tasks from public,anon,authenticated;

create function public.mrh_board_item_tasks_read(
 p_board_id uuid,p_item_id uuid
) returns jsonb language plpgsql stable security definer
set search_path to ''
as $$
declare v_ws uuid; v_tasks jsonb;
begin
 -- Existing guarded item scope checks auth.uid(), current workspace,
 -- original board/item identity, unarchived board access, and module ADMIN.
 v_ws:=private.mrh_sourcing_scope(p_board_id,p_item_id);
 if not exists (
  select 1 from public.work_board_items i
  join public.work_board_groups g on g.id=i.group_id and g.board_id=i.board_id
  where i.id=p_item_id and i.board_id=p_board_id
   and i.group_id='21566a87-b287-4a61-b521-bb233956e09e'::uuid
   and g.title='Main group' and i.archived_at is null
 ) then
  raise exception 'Material task item unavailable' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'title',t.title,'status',t.status,'revision',t.revision,
  'created_at',t.created_at,'updated_at',t.updated_at)
  order by t.created_at,t.id),'[]'::jsonb) into v_tasks
 from (select * from private.mrh_board_item_tasks x
       where x.board_id=p_board_id and x.workspace_id=v_ws
       and x.item_id=p_item_id order by x.created_at,x.id limit 100) t;
 return jsonb_build_object('tasks',v_tasks);
end;
$$;
revoke all on function public.mrh_board_item_tasks_read(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.mrh_board_item_tasks_read(uuid,uuid) to authenticated;

create function public.mrh_board_item_tasks_write(
 p_board_id uuid,p_item_id uuid,p_task_id uuid,p_title text,
 p_status text,p_expected_revision bigint default null
) returns jsonb language plpgsql volatile security definer
set search_path to ''
as $$
declare v_ws uuid; v_actor uuid:=auth.uid(); v_task private.mrh_board_item_tasks%rowtype;
begin
 v_ws:=private.mrh_sourcing_scope(p_board_id,p_item_id);
 if not exists (
  select 1 from public.work_board_items i
  join public.work_board_groups g on g.id=i.group_id and g.board_id=i.board_id
  where i.id=p_item_id and i.board_id=p_board_id
   and i.group_id='21566a87-b287-4a61-b521-bb233956e09e'::uuid
   and g.title='Main group' and i.archived_at is null
 ) then
  raise exception 'Material task item unavailable' using errcode='42501';
 end if;
 if not public.work_board_access(p_board_id,'edit') then
  raise exception 'Material task edit denied' using errcode='42501';
 end if;
 if p_title is null or length(trim(p_title)) not between 1 and 240 or
    p_status is null or p_status not in ('not_started','working_on_it','done') then
  raise exception 'Invalid material task content' using errcode='22023';
 end if;
 if p_task_id is null then
  if p_expected_revision is not null then
   raise exception 'New task must not specify a revision' using errcode='22023';
  end if;
  insert into private.mrh_board_item_tasks
   (workspace_id,board_id,item_id,title,status,created_by,updated_by)
   values (v_ws,p_board_id,p_item_id,trim(p_title),p_status,v_actor,v_actor)
   returning * into v_task;
 else
  if p_expected_revision is null or p_expected_revision<1 then
   raise exception 'Task revision required' using errcode='PT409';
  end if;
  update private.mrh_board_item_tasks
     set title=trim(p_title),status=p_status,revision=revision+1,
         updated_by=v_actor,updated_at=clock_timestamp()
   where id=p_task_id and workspace_id=v_ws and board_id=p_board_id
     and item_id=p_item_id and revision=p_expected_revision
   returning * into v_task;
  if not found then
   raise exception 'Material task revision conflict or inaccessible task'
    using errcode='PT409';
  end if;
 end if;
 -- Existing guarded board audit; never log title, commercial data or user input.
 perform public.work_board_log(
  p_board_id,'sourcing.task_changed','Material Sourcing task changed',
  'item',p_item_id::text,
  jsonb_build_object('task_id',v_task.id,'revision',v_task.revision)
 );
 return jsonb_build_object(
  'id',v_task.id,'title',v_task.title,'status',v_task.status,
  'revision',v_task.revision
 );
end;
$$;
revoke all on function public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)
 from public,anon,authenticated;
grant execute on function public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)
 to authenticated;
