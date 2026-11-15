create or replace function public.tool_traceability_update_request(p_workspace_id uuid,p_request_id text,p_updates jsonb,p_expected_version bigint default null) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  caller uuid:=auth.uid();
  r public.tool_traceability_requests%rowtype;
  old_status text;
  old_ext text;
  new_status text;
  new_ext text;
  tool jsonb;
  tid text;
  removed_ids text[]:=array[]::text[];
  is_priv boolean:=private.tool_traceability_is_logistics(p_workspace_id);
begin
  select * into r from public.tool_traceability_requests where workspace_id=p_workspace_id and id=p_request_id and archived_at is null for update;
  if not found then raise exception 'request not found' using errcode='P0002'; end if;
  if not is_priv and r.creator_user_id<>caller then raise exception 'request update denied' using errcode='42501'; end if;
  if p_expected_version is not null and r.version<>p_expected_version then raise exception 'stale request version' using errcode='40001'; end if;
  old_status:=r.request_status; old_ext:=r.extension_state;
  new_status:=coalesce(nullif(p_updates->>'requestStatus',''),old_status);
  new_ext:=coalesce(nullif(p_updates->>'extensionState',''),old_ext);

  if new_status<>old_status then
    if old_status='Pending Approval' and new_status='Borrowed' then
      if not is_priv then raise exception 'approval denied' using errcode='42501'; end if;
    elsif old_status='Pending Approval' and new_status='Rejected' then
      if not is_priv and r.creator_user_id<>caller then raise exception 'rejection denied' using errcode='42501'; end if;
    elsif old_status='Borrowed' and new_status='Returned' then
      if not is_priv then raise exception 'return denied' using errcode='42501'; end if;
    elsif old_status='Rejected' and new_status='Pending Approval' then
      if not is_priv and r.creator_user_id<>caller then raise exception 'resubmission denied' using errcode='42501'; end if;
    else
      raise exception 'invalid request status transition: % -> %',old_status,new_status using errcode='22023';
    end if;
  end if;

  if new_ext<>old_ext then
    if new_ext='Extension Requested' and old_ext in('None','Extension Approved','Extension Denied') then
      if old_status<>'Borrowed' then raise exception 'extension requires active borrowed request' using errcode='22023'; end if;
      if not is_priv and r.creator_user_id<>caller then raise exception 'extension request denied' using errcode='42501'; end if;
    elsif old_ext='Extension Requested' and new_ext in('Extension Approved','Extension Denied') then
      if not is_priv then raise exception 'extension review denied' using errcode='42501'; end if;
      if new_ext='Extension Approved' and not (p_updates?'borrowWindow') then raise exception 'approved extension requires updated borrow window' using errcode='22023'; end if;
    elsif new_ext='None' and old_status='Rejected' and new_status='Pending Approval' then
      null;
    else
      raise exception 'invalid extension transition: % -> %',old_ext,new_ext using errcode='22023';
    end if;
  end if;

  if p_updates?'tools' then
    select coalesce(array_agg(rt.tool_id),array[]::text[]) into removed_ids
      from public.tool_traceability_request_tools rt
      where rt.workspace_id=p_workspace_id and rt.request_id=p_request_id
        and not exists(select 1 from jsonb_array_elements(coalesce(p_updates#>'{tools,linkedItems}','[]'::jsonb)) x where x->>'id'=rt.tool_id);

    if old_status not in('Pending Approval','Borrowed') and cardinality(removed_ids)>0 then
      raise exception 'tools cannot be changed after request closure' using errcode='22023';
    end if;

    delete from public.tool_traceability_request_tools
      where workspace_id=p_workspace_id and request_id=p_request_id and tool_id=any(removed_ids);

    foreach tid in array removed_ids loop
      update public.tool_traceability_tools
        set availability='Available',assigned_to='[]'::jsonb,current_request_id=null,updated_at=now(),version=version+1
        where workspace_id=p_workspace_id and id=tid and current_request_id=p_request_id;
      perform private.tool_traceability_recalc_inventory(p_workspace_id,tid);
    end loop;

    for tool in select * from jsonb_array_elements(coalesce(p_updates#>'{tools,linkedItems}','[]'::jsonb)) loop
      tid:=tool->>'id';
      if not exists(select 1 from public.tool_traceability_tools where workspace_id=p_workspace_id and id=tid and archived_at is null and (availability='Available' or current_request_id=p_request_id)) then
        raise exception 'tool % is not available for this request',tid using errcode='40001';
      end if;
      insert into public.tool_traceability_request_tools(workspace_id,request_id,tool_id,quantity,returned_at)
        values(p_workspace_id,p_request_id,tid,1,null)
        on conflict(workspace_id,request_id,tool_id) do update set returned_at=null;
      update public.tool_traceability_tools
        set availability=case when old_status='Borrowed' then 'In Use' else 'Pending Approval' end,
            assigned_to=jsonb_build_array(private.tool_traceability_profile_json(r.creator_user_id)),current_request_id=p_request_id,updated_at=now(),version=version+1
        where workspace_id=p_workspace_id and id=tid;
      perform private.tool_traceability_recalc_inventory(p_workspace_id,tid);
    end loop;
  end if;

  update public.tool_traceability_requests set
    name=coalesce(nullif(p_updates->>'name',''),name),request_status=new_status,extension_state=new_ext,
    borrow_from=case when p_updates?'borrowWindow' then nullif(p_updates#>>'{borrowWindow,from}','')::date else borrow_from end,
    borrow_to=case when p_updates?'borrowWindow' then nullif(p_updates#>>'{borrowWindow,to}','')::date else borrow_to end,
    actual_return=case when p_updates?'actualReturn' then nullif(p_updates->>'actualReturn','')::date else actual_return end,
    team_members=case when p_updates?'teamMembers' then p_updates->'teamMembers' else team_members end,
    team_leader=case when p_updates?'teamLeader' then p_updates->'teamLeader' else team_leader end,
    payload=payload||(p_updates-'name'-'requestStatus'-'extensionState'-'borrowWindow'-'actualReturn'-'teamMembers'-'teamLeader'-'tools'),updated_at=now(),version=version+1
    where workspace_id=p_workspace_id and id=p_request_id returning * into r;

  if new_status<>old_status then
    if new_status='Borrowed' then
      update public.tool_traceability_tools t set availability='In Use',current_request_id=p_request_id,updated_at=now(),version=version+1
        from public.tool_traceability_request_tools rt where rt.workspace_id=p_workspace_id and rt.request_id=p_request_id and rt.returned_at is null and t.workspace_id=rt.workspace_id and t.id=rt.tool_id;
    elsif new_status in('Rejected','Returned') then
      update public.tool_traceability_request_tools set returned_at=coalesce(returned_at,now()) where workspace_id=p_workspace_id and request_id=p_request_id;
      update public.tool_traceability_tools t set availability=case when new_status='Returned' then 'Returned' else 'Available' end,assigned_to='[]'::jsonb,current_request_id=null,updated_at=now(),version=version+1
        from public.tool_traceability_request_tools rt where rt.workspace_id=p_workspace_id and rt.request_id=p_request_id and t.workspace_id=rt.workspace_id and t.id=rt.tool_id;
    elsif new_status='Pending Approval' then
      update public.tool_traceability_request_tools set returned_at=null where workspace_id=p_workspace_id and request_id=p_request_id;
      update public.tool_traceability_tools t set availability='Pending Approval',assigned_to=jsonb_build_array(private.tool_traceability_profile_json(r.creator_user_id)),current_request_id=p_request_id,updated_at=now(),version=version+1
        from public.tool_traceability_request_tools rt where rt.workspace_id=p_workspace_id and rt.request_id=p_request_id and t.workspace_id=rt.workspace_id and t.id=rt.tool_id;
    end if;
  end if;

  for tid in select tool_id from public.tool_traceability_request_tools where workspace_id=p_workspace_id and request_id=p_request_id loop
    perform private.tool_traceability_recalc_inventory(p_workspace_id,tid);
  end loop;
  insert into public.tool_traceability_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
    values(p_workspace_id,'request',r.id,caller,'request_updated',jsonb_build_object('fromStatus',old_status,'toStatus',new_status,'fromExtension',old_ext,'toExtension',new_ext,'updates',p_updates));
  return private.tool_traceability_request_json(r);
end $$;;
