-- Stage I M103 — Prompts 1-4 completion and contract reconciliation.
-- Extends the M101 atomic import RPC with explicit create/update operations,
-- item-version compare-and-swap semantics, and identifier-preserving creates.
create or replace function public.wm_import_board_items_atomic(
  p_board_id uuid,
  p_expected_updated_at timestamptz,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.work_boards%rowtype;
  current_item public.work_board_items%rowtype;
  r jsonb;
  pair record;
  gid uuid;
  iid uuid;
  requested_id uuid;
  cid uuid;
  item_name text;
  operation text;
  expected_item_updated_at timestamptz;
  pos integer;
  created_count integer := 0;
  updated_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_rows,'null'::jsonb)) <> 'array' then raise exception 'Import rows must be a JSON array' using errcode='22023'; end if;
  if jsonb_array_length(p_rows) > 100000 then raise exception 'Import row limit exceeded' using errcode='54000'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text,0));
  select * into b from public.work_boards where id=p_board_id for update;
  if b.id is null or not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'This Board changed after the import preview. Refresh and review the import again.' using errcode='40001';
  end if;

  perform 1 from public.work_board_groups where board_id=p_board_id for update;
  perform 1 from public.work_board_columns where board_id=p_board_id for update;
  perform 1 from public.work_board_items where board_id=p_board_id and archived_at is null for update;
  perform 1 from public.work_board_members where board_id=p_board_id for share;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(r) <> 'object' then raise exception 'Every import row must be an object' using errcode='22023'; end if;
    operation := lower(btrim(coalesce(r->>'operation','create')));
    if operation not in ('create','update') then raise exception 'Import operation must be create or update' using errcode='22023'; end if;

    item_name := btrim(coalesce(r->>'item_name',''));
    if char_length(item_name) not between 1 and 240 then raise exception 'Item name must contain 1-240 characters' using errcode='22023'; end if;

    begin gid := (r->>'group_id')::uuid; exception when others then raise exception 'Import group identifier is invalid' using errcode='23503'; end;
    if not exists(select 1 from public.work_board_groups where id=gid and board_id=p_board_id) then
      raise exception 'Import group relationship no longer exists' using errcode='23503';
    end if;

    requested_id := null;
    if nullif(btrim(coalesce(r->>'item_id','')),'') is not null then
      begin requested_id := (r->>'item_id')::uuid; exception when others then raise exception 'Import item identifier is invalid' using errcode='22023'; end;
    end if;

    if operation='update' then
      if requested_id is null then raise exception 'Update import rows require Item ID' using errcode='22023'; end if;
      begin expected_item_updated_at := (r->>'expected_item_updated_at')::timestamptz; exception when others then raise exception 'Update import rows require a valid Item Updated At value' using errcode='22023'; end;
      select * into current_item from public.work_board_items where id=requested_id and board_id=p_board_id and archived_at is null for update;
      if current_item.id is null then raise exception 'The imported update item no longer exists on this Board' using errcode='40001'; end if;
      if current_item.updated_at is distinct from expected_item_updated_at then raise exception 'The imported item changed after export. Refresh/export and review the update again.' using errcode='40001'; end if;
      if exists(select 1 from public.work_board_items where board_id=p_board_id and group_id=gid and archived_at is null and id<>requested_id and lower(btrim(title))=lower(item_name)) then
        raise exception 'The imported update now conflicts with another item. Refresh and review the import again.' using errcode='40001';
      end if;

      iid := requested_id;
      if current_item.group_id is distinct from gid then
        select coalesce(max(position),-1)+1 into pos from public.work_board_items where board_id=p_board_id and group_id=gid and archived_at is null and id<>iid;
      else
        pos := current_item.position;
      end if;
      update public.work_board_items
         set group_id=gid,title=item_name,position=pos,updated_by=auth.uid(),updated_at=clock_timestamp()
       where id=iid;
      updated_count := updated_count + 1;
    else
      if exists(select 1 from public.work_board_items where board_id=p_board_id and group_id=gid and archived_at is null and lower(btrim(title))=lower(item_name)) then
        raise exception 'An imported item now conflicts with an existing item. Refresh and review the import again.' using errcode='40001';
      end if;
      if requested_id is not null and exists(select 1 from public.work_board_items where id=requested_id) then
        raise exception 'The requested imported Item ID is already in use. Refresh and reconcile the import.' using errcode='40001';
      end if;
      select count(*) into pos from public.work_board_items where board_id=p_board_id and group_id=gid and archived_at is null;
      if requested_id is null then
        insert into public.work_board_items(board_id,group_id,title,status,position,created_by,updated_by)
        values(p_board_id,gid,item_name,null,pos,auth.uid(),auth.uid()) returning id into iid;
      else
        insert into public.work_board_items(id,board_id,group_id,title,status,position,created_by,updated_by)
        values(requested_id,p_board_id,gid,item_name,null,pos,auth.uid(),auth.uid()) returning id into iid;
      end if;
      created_count := created_count + 1;
    end if;

    if jsonb_typeof(coalesce(r->'values','{}'::jsonb)) <> 'object' then raise exception 'Import row values must be an object' using errcode='22023'; end if;
    for pair in select key,value from jsonb_each(coalesce(r->'values','{}'::jsonb))
    loop
      select id into cid from public.work_board_columns
       where board_id=p_board_id and (column_key=pair.key or id::text=pair.key)
       order by case when column_key=pair.key then 0 else 1 end, position, id limit 1;
      if cid is null then raise exception 'Import column relationship no longer exists: %', pair.key using errcode='23503'; end if;
      perform public.wm_set_board_cell(iid,cid,pair.value);
      cid := null;
    end loop;
    expected_item_updated_at := null;
  end loop;

  update public.work_boards set updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_board_id;
  perform public.work_board_log(
    p_board_id,
    'items.imported',
    'Board items imported',
    'board',
    p_board_id::text,
    jsonb_build_object('created',created_count,'updated',updated_count,'skipped',0,'rejected',0,'affected',created_count+updated_count)
  );
  return jsonb_build_object('created',created_count,'updated',updated_count,'skipped',0,'rejected',0,'affected',created_count+updated_count);
end $$;

revoke all on function public.wm_import_board_items_atomic(uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.wm_import_board_items_atomic(uuid,timestamptz,jsonb) to authenticated;


-- Stage I M105 — production deployment parity attestation.
create or replace function public.wm_deployment_contract_attestation()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  import_rpc regprocedure := to_regprocedure('public.wm_import_board_items_atomic(uuid,timestamptz,jsonb)');
  import_ready boolean := false;
begin
  if import_rpc is not null then
    import_ready := has_function_privilege('authenticated', import_rpc, 'EXECUTE');
  end if;

  return jsonb_build_object(
    'schema_version', '1.43.2-m105-v1',
    'required_rpc', 'wm_import_board_items_atomic',
    'wm_import_board_items_atomic', import_ready,
    'compatible', import_ready
  );
end
$$;

revoke all on function public.wm_deployment_contract_attestation() from public;
grant execute on function public.wm_deployment_contract_attestation() to anon, authenticated;

notify pgrst, 'reload schema';
;
