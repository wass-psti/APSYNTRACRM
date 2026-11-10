-- STAGED CANDIDATE ONLY; NOT APPLIED TO PRODUCTION.
-- Material Request Hub: restricted sourcing values must NEVER be stored in
-- generic work_board_item_values, because wm_get_board returns all those values
-- to any authorized board viewer. This private vault has no Data API grants.
-- Requires separately authorized security change, disposable-PG testing,
-- approved field role matrix and production change review before activation.
begin;

create table if not exists private.mrh_sourcing_sensitive_cells (
  board_id uuid not null references public.work_boards(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  item_id uuid not null references public.work_board_items(id) on delete cascade,
  field_name text not null,
  value jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  primary key (board_id,item_id,field_name),
  constraint mrh_sourcing_field_allowlist check (field_name in (
   'Selling Price (VAT-EX)','Requestor','Accounts','Supplier PO No.',
   'Buying Price','Currency','Ex. Rate USD','Ex. Rate EUR',
   'Shipping Cost','Shipping Cost Currency','Vendor Details'
  ))
);
alter table private.mrh_sourcing_sensitive_cells enable row level security;
-- Deliberately NO direct RLS allow policies or table grants. API must use
-- guarded SECURITY DEFINER RPCs that recheck server authority on every call.
revoke all on private.mrh_sourcing_sensitive_cells from public, anon, authenticated;

create or replace function private.mrh_sourcing_scope(
  p_board_id uuid,p_item_id uuid
) returns uuid
language plpgsql stable security definer
set search_path to ''
as $$
declare v_workspace uuid;
begin
 if auth.uid() is null or p_board_id is distinct from
  '617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid or
  p_item_id is null then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 select b.workspace_id into v_workspace
 from public.work_boards b
 join public.work_board_items i on i.board_id=b.id
 where b.id=p_board_id and i.id=p_item_id and b.status='active';
 if v_workspace is null
    or not public.work_board_access(p_board_id,'view')
    or private.material_request_hub_current_role(v_workspace)
       is distinct from 'ADMIN' then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 return v_workspace;
end;
$$;
revoke all on function private.mrh_sourcing_scope(uuid,uuid) from public,anon,authenticated;

create or replace function public.mrh_sourcing_sensitive_read(
  p_board_id uuid,p_item_id uuid
) returns jsonb
language plpgsql volatile security definer
set search_path to ''
as $$
declare v_workspace uuid; v_result jsonb;
begin
 v_workspace:=private.mrh_sourcing_scope(p_board_id,p_item_id);
 select coalesce(jsonb_object_agg(s.field_name,
  jsonb_build_object('value',s.value,'revision',s.revision)),'{}'::jsonb)
 into v_result
 from private.mrh_sourcing_sensitive_cells s
 where s.board_id=p_board_id and s.workspace_id=v_workspace
  and s.item_id=p_item_id;
 return v_result;
end;
$$;
revoke all on function public.mrh_sourcing_sensitive_read(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.mrh_sourcing_sensitive_read(uuid,uuid)
  to authenticated;

create or replace function public.mrh_sourcing_sensitive_write(
  p_board_id uuid,p_item_id uuid,p_field_name text,
  p_value jsonb,p_expected_revision bigint default null
) returns jsonb
language plpgsql volatile security definer
set search_path to ''
as $$
declare v_workspace uuid; v_revision bigint;
begin
 v_workspace:=private.mrh_sourcing_scope(p_board_id,p_item_id);
 if not public.work_board_access(p_board_id,'edit') then
  raise exception 'Material sourcing edit denied' using errcode='42501';
 end if;
 if p_field_name not in (
   'Selling Price (VAT-EX)','Requestor','Accounts','Supplier PO No.',
   'Buying Price','Currency','Ex. Rate USD','Ex. Rate EUR',
   'Shipping Cost','Shipping Cost Currency','Vendor Details'
 ) or p_value is null or p_value='null'::jsonb then
  raise exception 'Invalid restricted field update' using errcode='22023';
 end if;
 if p_field_name in ('Selling Price (VAT-EX)','Buying Price','Ex. Rate USD',
                     'Ex. Rate EUR','Shipping Cost') then
  if jsonb_typeof(p_value)<>'number' or
     (p_value#>>'{}')::numeric < 0 then
   raise exception 'Numeric sourcing value must be nonnegative' using errcode='22023';
  end if;
 elsif p_field_name in ('Currency','Shipping Cost Currency') then
  if jsonb_typeof(p_value)<>'string' or
     (p_value#>>'{}') not in ('PHP','USD','EUR') then
   raise exception 'Invalid sourcing currency' using errcode='22023';
  end if;
 elsif p_field_name='Requestor' then
  if jsonb_typeof(p_value)<>'string' or
   not exists(select 1 from public.workspace_members m
      where m.workspace_id=v_workspace
        and m.user_id=(p_value#>>'{}')::uuid and m.active=true) then
   raise exception 'Requestor must be an active workspace member'
    using errcode='22023';
  end if;
 else
  if jsonb_typeof(p_value)<>'string' or
    char_length(p_value#>>'{}')>2000 then
   raise exception 'Invalid sourcing text' using errcode='22023';
  end if;
 end if;

 if p_expected_revision is null then
  insert into private.mrh_sourcing_sensitive_cells
   (board_id,workspace_id,item_id,field_name,value,updated_by)
  values (p_board_id,v_workspace,p_item_id,p_field_name,p_value,auth.uid())
  on conflict do nothing returning revision into v_revision;
 else
  update private.mrh_sourcing_sensitive_cells
  set value=p_value, revision=revision+1,
      updated_at=clock_timestamp(),updated_by=auth.uid()
  where board_id=p_board_id and workspace_id=v_workspace
    and item_id=p_item_id and field_name=p_field_name
    and revision=p_expected_revision
  returning revision into v_revision;
 end if;
 if v_revision is null then
  raise exception 'Sourcing field changed; refresh and retry after review'
   using errcode='PT409';
 end if;
 perform public.work_board_log(
  p_board_id,'sourcing.restricted_field_updated',
  'Authorized restricted sourcing field updated','item',p_item_id::text,
  jsonb_build_object('field_name',p_field_name,'revision',v_revision)
 );
 return jsonb_build_object('field_name',p_field_name,'revision',v_revision);
end;
$$;
revoke all on function public.mrh_sourcing_sensitive_write(uuid,uuid,text,jsonb,bigint)
  from public,anon,authenticated;
grant execute on function public.mrh_sourcing_sensitive_write(uuid,uuid,text,jsonb,bigint)
  to authenticated;
commit;

-- NOT PART OF THIS CANDIDATE:
-- 1. No automatic installation to the existing Supabase project.
-- 2. No permission/grant changes for generic board tables or existing RPCs.
-- 3. No public/ordinary-board column holding sensitive values.
-- 4. Derived numeric fields remain unpopulated pending vetted finance formulas.
-- 5. UI must revalidate access and cannot treat hiding as authorization.
