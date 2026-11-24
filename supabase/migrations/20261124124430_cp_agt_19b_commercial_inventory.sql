-- CP-AGT-19B candidate, not deployed. Single-statement signed source snapshot.
-- Preserve existing board, FRT and Order Intake admission; no table grants.
create function private.agt_commercial_board_sources_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; b record; rows jsonb; result jsonb; allowed jsonb;
begin
 if a is null then raise exception 'Signed context required' using errcode='42501'; end if;
 w:=public.current_workspace_id(a);
 if w is distinct from '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'Commercial workspace unavailable' using errcode='42501';end if;
 -- Invoke the existing FRT membership check, not a new role or policy.
 allowed:=public.frt_companies(w);
 if allowed is null then raise exception 'Company directory unavailable';end if;
 select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'id',c.id,'code',c.code) order by c.id),'[]'::jsonb) into rows
 from (select id,code from public.frt_companies where workspace_id=w order by id limit 10001)c;
 if jsonb_array_length(rows)>10000 then raise exception 'Company source exceeds capture bound';end if;
 result:=jsonb_build_object('workspaceId',w,'companies',rows);
 for b in select * from (values
  ('contacts','b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d'::uuid),
  ('deals','1001f98d-d30f-45a1-a4e2-6182218e8d28'::uuid),
  ('projects','8070a1da-9090-476e-be5d-e8f4722adf0d'::uuid)) s(key,id)
 loop
  if not coalesce(public.work_board_access(b.id,'view'),false) or not exists(
   select 1 from public.work_boards q where q.id=b.id and q.workspace_id=w and q.status='active' and q.archived_at is null and q.trashed_at is null
  ) then raise exception 'Commercial board unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'id',i.id,'label',i.title,'archived',i.archived_at is not null,'sourceStatus',i.status,
   'stage',case when b.key='deals' then (select v.value from public.work_board_item_values v where v.item_id=i.id and v.column_id='65def3ac-1a60-4dfe-9530-772547ef2b8e') else null end,'updatedAt',i.updated_at) order by i.id),'[]'::jsonb)
  into rows from (select id,title,archived_at,status,updated_at from public.work_board_items where board_id=b.id order by id limit 10001)i;
  if jsonb_array_length(rows)>10000 then raise exception 'Board source exceeds capture bound';end if;
  result:=result||jsonb_build_object(b.key,jsonb_build_object('boardId',b.id,'coverage','complete','rows',rows));
 end loop;
 return result;
end $$;

-- Invoker reads the native registry through its existing security-invoker view
-- and underlying table RLS; the definer helper never accesses Order Intake.
create function public.agt_commercial_inventory_v1()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; data jsonb; rows jsonb;
begin
 if a is null or not coalesce(public.has_module_access('order-intake',a),false) then raise exception 'Order Intake source unavailable' using errcode='42501';end if;
 data:=private.agt_commercial_board_sources_v1();
 w:=(data->>'workspaceId')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'id',o.id,'recordKind',o.record_kind,'label',coalesce(nullif(btrim(o.po_number),''),'Unlabelled order '||o.id::text),'labelMissing',nullif(btrim(o.po_number),'') is null,'archived',o.archived,'sourceStatus',o.status,'revision',o.revision,'updatedAt',o.updated_at) order by o.id),'[]'::jsonb) into rows
 from (select id,record_kind,po_number,archived,status,revision,updated_at from public.order_intake_operational_registry where workspace_id=w order by id limit 10001)o;
 if jsonb_array_length(rows)>10000 then raise exception 'Order Intake source exceeds capture bound';end if;
 data:=data||jsonb_build_object('orders',jsonb_build_object('source','order_intake_operational_registry','coverage','complete','rows',rows));
 return data||jsonb_build_object('contract','agt-commercial-inventory-v1','userId',a,'capturedAt',statement_timestamp(),'sourceRevision',encode(sha256(convert_to(data::text,'UTF8')),'hex'));
end $$;
revoke all on function private.agt_commercial_board_sources_v1(),public.agt_commercial_inventory_v1() from public,anon,authenticated,service_role;
grant execute on function private.agt_commercial_board_sources_v1(),public.agt_commercial_inventory_v1() to authenticated;
;
