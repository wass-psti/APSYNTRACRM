-- CP-HULY-SB04: atomic up to 25 create/update mutations per board using existing RLS.
-- SECURITY INVOKER; no role impersonation, service key or privileged RPC.
begin;
create function public.huly_sb04_transact(p_board_id uuid,p_workspace_id uuid,p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  item jsonb;
  v_id text;
  v_action text;
  v_expected bigint;
  v_rev bigint;
  v_results jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
begin
  if auth.uid() is null or p_board_id is null or p_workspace_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_workspace_id is distinct from public.current_workspace_id()
    or not public.work_board_access(p_board_id,'edit') then
    raise exception 'Board access denied' using errcode='42501';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array'
    or jsonb_array_length(p_operations) not between 1 and 25
    or octet_length(p_operations::text)>240000 then
    raise exception 'Invalid bounded operations' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_operations) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Invalid operation' using errcode='22023';
    end if;
    v_id := item->>'documentId';
    v_action := item->>'action';
    if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$'
      or v_id=any(v_seen) or v_action not in ('create','update') or v_action is null
      or not (item ? 'payload') or item->'payload'='null'::jsonb then
      raise exception 'Invalid operation or duplicate document ID' using errcode='22023';
    end if;
    v_seen := array_append(v_seen,v_id);
    if v_action='create' then
      if item ? 'expectedRevision' and item->'expectedRevision'<>'null'::jsonb then
        raise exception 'Create must not specify a revision' using errcode='22023';
      end if;
      insert into huly_rewrite.documents(board_id,workspace_id,document_id,payload,updated_by)
      values(p_board_id,p_workspace_id,v_id,item->'payload',auth.uid()) returning revision into v_rev;
    else
      if jsonb_typeof(item->'expectedRevision') is distinct from 'number'
        or item->>'expectedRevision' !~ '^[1-9][0-9]{0,15}$' then
        raise exception 'Expected positive safe revision' using errcode='22023';
      end if;
      v_expected := (item->>'expectedRevision')::bigint;
      if v_expected>9007199254740991 then
        raise exception 'Revision outside JS safe integer range' using errcode='22023';
      end if;
      update huly_rewrite.documents set payload=item->'payload'
      where board_id=p_board_id and workspace_id=p_workspace_id
        and document_id=v_id and revision=v_expected returning revision into v_rev;
      if not found then raise exception 'Document revision conflict' using errcode='23505'; end if;
    end if;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id',v_id,'boardId',p_board_id,'workspaceId',p_workspace_id,'revision',v_rev));
  end loop;
  return v_results;
end;
$function$;
revoke all on function public.huly_sb04_transact(uuid,uuid,jsonb) from public,anon;
grant execute on function public.huly_sb04_transact(uuid,uuid,jsonb) to authenticated;
comment on function public.huly_sb04_transact(uuid,uuid,jsonb) is
  'CP-HULY-SB04 atomic board-scoped create/update; invoker permission and RLS required';
commit;
