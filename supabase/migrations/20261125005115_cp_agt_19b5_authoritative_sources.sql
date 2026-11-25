-- Reconstructed from the applied production migration ledger statements.
-- CP-AGT-19B.5: additional signed source coverage. V1 capture remains unchanged.
create function private.agt_commercial_supplement_v2()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; b record; rows jsonb; result jsonb:='{}';
begin
 if a is null then raise exception 'Signed context required' using errcode='42501';end if;
 w:=public.current_workspace_id(a);
 if w is distinct from '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'Commercial workspace unavailable' using errcode='42501';end if;
 for b in select * from (values
 ('accounts','fcd61d00-afbb-4104-8662-0675db7ef7c2'::uuid),
 ('implementationProjects','2d1af630-f416-4bf5-9da2-bd285253cf5b'::uuid),
 ('secondaryOrders','bb46edd4-ea06-451f-9a26-4375151a36ef'::uuid)) x(key,id)
 loop
  if not coalesce(public.work_board_access(b.id,'view'),false) or not exists(select 1 from public.work_boards q where q.id=b.id and q.workspace_id=w and q.status='active' and q.archived_at is null and q.trashed_at is null) then raise exception 'Supplemental board unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'id',i.id,'label',i.title,'archived',i.archived_at is not null,'updatedAt',i.updated_at,
    'sourceStatus',i.status)||case b.key
    when 'accounts' then jsonb_build_object('clientType',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='3bf8dd0d-85d0-4bcf-aef4-1a12a13d3123'),'clientLabel',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='87bf2e1b-e560-4892-9da6-583772f56017'),'accountCode',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='b7d02962-b9f7-4a29-9aa0-587d0a3c81b6'))
    when 'implementationProjects' then jsonb_build_object('projectCode',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='d816dfb4-6fd3-46b9-9b2a-56c0d7a7d1e5'),'poReference',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='db5d1072-ce90-4937-a0cb-dbe38a32ec71'))
    else jsonb_build_object('legacyItemId',(select v.value#>>'{}' from public.work_board_item_values v where v.item_id=i.id and v.column_id='123e9085-e672-4231-aeca-af27fd7a190d'))
    end order by i.id),'[]'::jsonb) into rows
  from (select id,title,archived_at,status,updated_at from public.work_board_items where board_id=b.id order by id limit 10001)i;
  if jsonb_array_length(rows)>10000 then raise exception 'Supplemental source exceeds capture bound';end if;
  result:=result||jsonb_build_object(b.key,jsonb_build_object('boardId',b.id,'coverage','complete','rows',rows));
 end loop;
 return result;
end $$;

create function public.agt_commercial_inventory_v2()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; base jsonb; data jsonb; links jsonb;
begin
 base:=public.agt_commercial_inventory_v1();
 w:=(base->>'workspaceId')::uuid;
 data:=(base-'contract'-'userId'-'capturedAt'-'sourceRevision')||private.agt_commercial_supplement_v2()||jsonb_build_object('baseSourceRevision',base->>'sourceRevision');
 -- Existing registry RLS, same signed workspace. Both keys must resolve uniquely.
 with orders as materialized (select id,po_number,source_item_id,record_kind from public.order_intake_operational_registry where workspace_id=w),
 matches as (
 select s->>'id' legacy_id,
 coalesce((select jsonb_agg(o.id order by o.id) from orders o where o.record_kind='legacy' and nullif(btrim(s->>'legacyItemId'),'') is not null and o.source_item_id=s->>'legacyItemId'),'[]'::jsonb) ids,
 coalesce((select jsonb_agg(o.id order by o.id) from orders o where nullif(btrim(s->>'label'),'') is not null and lower(btrim(o.po_number))=lower(btrim(s->>'label'))),'[]'::jsonb) numbers
 from jsonb_array_elements(data->'secondaryOrders'->'rows') s where s->'archived'='false'::jsonb
 ), pairs as (
 select *,case when jsonb_array_length(ids)=1 and ids=numbers then ids->>0 end candidate from matches
 ), distinct_pairs as (
 select *,count(*) over(partition by candidate) occurrences from pairs
 )
 select coalesce(jsonb_agg(jsonb_build_object('secondaryId',legacy_id,'legacyIdMatches',ids,'numberMatches',numbers,'nativeOrderId',case when occurrences=1 then candidate end) order by legacy_id),'[]'::jsonb) into links from distinct_pairs;
 data:=data||jsonb_build_object('legacyLinks',links);
 return data||jsonb_build_object('contract','agt-commercial-inventory-v2','userId',a,'capturedAt',statement_timestamp(),'sourceRevision',encode(sha256(convert_to(data::text,'UTF8')),'hex'));
end $$;
revoke all on function private.agt_commercial_supplement_v2(),public.agt_commercial_inventory_v2() from public,anon,authenticated,service_role;
grant execute on function private.agt_commercial_supplement_v2(),public.agt_commercial_inventory_v2() to authenticated;

create table agt.legacy_order_identity(
 workspace_id uuid not null references agt.workspace(id),
 secondary_id uuid not null,
 registry_id uuid not null,
 review_id uuid not null,
 primary key(workspace_id,secondary_id),
 unique(workspace_id,registry_id),
 foreign key(workspace_id,review_id) references agt.commercial_scope_review(workspace_id,review_id)
);
create trigger legacy_order_identity_immutable before update or delete on agt.legacy_order_identity for each row execute function agt.preserve_crm_source_review();
revoke all on agt.legacy_order_identity from public,anon,authenticated,service_role;

create or replace function agt.bind_initial_commercial_review(w uuid,a uuid,source jsonb,review jsonb)
returns jsonb language plpgsql set search_path=agt,pg_catalog as $$
declare
 rid uuid; roster uuid; company_rev text; src_rev text; prior agt.commercial_scope_review%rowtype;
 d jsonb; row_source jsonb; item uuid; entity uuid; customer uuid; project uuid; v_kind text; system text;
 is_v2 boolean:=source->>'contract'='agt-commercial-inventory-v2'; customer_count integer:=0; reference_count integer:=0; changed integer; cfg jsonb;
begin
 if coalesce(source->>'contract','') not in ('agt-commercial-inventory-v1','agt-commercial-inventory-v2')
 or source->>'workspaceId' is distinct from w::text or source->>'userId' is distinct from a::text
 or review->>'workspaceId' is distinct from w::text
 or review->>'sourceRevision' is distinct from source->>'sourceRevision'
 or coalesce(source->>'sourceRevision','') !~ '^[0-9a-f]{64}$'
 or source->>'sourceRevision' is distinct from encode(sha256(convert_to((source-'contract'-'userId'-'capturedAt'-'sourceRevision')::text,'UTF8')),'hex')
 or jsonb_typeof(review->'customers') is distinct from 'array'
 or jsonb_typeof(review->'commercial') is distinct from 'array'
 then raise exception 'Commercial review scope or revision mismatch';end if;
 rid:=(review->>'reviewId')::uuid;src_rev:=source->>'sourceRevision';
 if rid is null then raise exception 'Review identity required';end if;
 if source->'contacts'->>'boardId' is distinct from 'b2dabbd5-a04f-4e99-a8a3-62551cdbfe1d' or source->'deals'->>'boardId' is distinct from '1001f98d-d30f-45a1-a4e2-6182218e8d28' or source->'projects'->>'boardId' is distinct from '8070a1da-9090-476e-be5d-e8f4722adf0d' or source->'orders'->>'source' is distinct from 'order_intake_operational_registry' then raise exception 'Unexpected commercial source';end if;
 if is_v2 and (source->'accounts'->>'boardId' is distinct from 'fcd61d00-afbb-4104-8662-0675db7ef7c2' or source->'implementationProjects'->>'boardId' is distinct from '2d1af630-f416-4bf5-9da2-bd285253cf5b' or source->'secondaryOrders'->>'boardId' is distinct from 'bb46edd4-ea06-451f-9a26-4375151a36ef' or source->'accounts'->>'coverage' is distinct from 'complete' or source->'implementationProjects'->>'coverage' is distinct from 'complete' or source->'secondaryOrders'->>'coverage' is distinct from 'complete') then raise exception 'Incomplete supplemental source';end if;
 perform 1 from agt.workspace where id=w for update;
 if not found or not exists(select 1 from agt.person p where p.workspace_id=w and p.user_id=a and p.identity_kind='crm-user') then raise exception 'Activated workforce required';end if;
 select s.workforce_review_id,s.source_revision into roster,company_rev from agt.company_scope_review s
 where s.workspace_id=w and s.companies=source->'companies' order by s.captured_at desc limit 1;
 if not found or (select count(*) from agt.entity e where e.workspace_id=w)<>3
 or exists(select 1 from jsonb_array_elements(source->'companies') x where not exists(select 1 from agt.entity e where e.workspace_id=w and e.id=(x->>'id')::uuid and e.code=x->>'code'))
 then raise exception 'Confirmed company binding required';end if;
 select * into prior from agt.commercial_scope_review s where s.workspace_id=w and s.review_id=rid;
 if found then
  if prior.actor_id<>a or prior.source_revision<>src_rev or prior.decisions<>review or prior.source_packet-'capturedAt'<>source-'capturedAt' then raise exception 'Review identity conflict';end if;
  return jsonb_build_object('reviewId',rid,'sourceRevision',src_rev,'insertedCustomers',0,'insertedReferences',0,'replayed',true);
 end if;
 -- Additive batches only: existing mappings can be reused if identical.
 -- Changing existing allocations or historical labels requires explicit reconciliation.
 if (select count(distinct x->>'sourceId') from jsonb_array_elements(review->'customers') x)<>jsonb_array_length(review->'customers')
 or (select count(distinct x->>'sourceId') from jsonb_array_elements(review->'commercial') x)<>jsonb_array_length(review->'commercial') then raise exception 'Duplicate review identity';end if;
 if jsonb_array_length(review->'customers')>10000 or jsonb_array_length(review->'commercial')>10000 then raise exception 'Review exceeds bound';end if;
 if source->'contacts'->>'coverage' is distinct from 'complete' or source->'deals'->>'coverage' is distinct from 'complete' or source->'projects'->>'coverage' is distinct from 'complete' or source->'orders'->>'coverage' is distinct from 'complete' then raise exception 'Incomplete commercial source';end if;
 for d in select value from jsonb_array_elements(review->'customers') loop
  item:=(d->>'sourceId')::uuid;
  if d->>'workspaceId' is distinct from w::text or d->>'sourceRevision' is distinct from src_rev or d->'confirmed' is distinct from 'true'::jsonb or nullif(btrim(d->>'evidenceRef'),'') is null then raise exception 'Unconfirmed customer review';end if;
  if is_v2 then
   system:='crm-accounts';
   select x into strict row_source from jsonb_array_elements(source->'accounts'->'rows') x where x->>'id'=item::text and x->>'workspaceId'=w::text and x->'archived'='false'::jsonb and x->>'clientType'='Client' and nullif(btrim(x->>'clientLabel'),'') is not null;
   if nullif(btrim(row_source->>'accountCode'),'') is null or (select count(*) from jsonb_array_elements(source->'accounts'->'rows') x where x->>'accountCode'=row_source->>'accountCode' and x->'archived'='false'::jsonb)<>1 then raise exception 'Account identity unresolved';end if;
  else
   system:='crm-contacts';
   select x into strict row_source from jsonb_array_elements(source->'contacts'->'rows') x where x->>'id'=item::text and x->>'workspaceId'=w::text and x->'archived'='false'::jsonb;
  end if;
  insert into agt.customer(workspace_id,id,source_system,source_id,label) values(w,item,system,item,agt.required_text(case when is_v2 then row_source->>'clientLabel' else row_source->>'label' end)) on conflict(workspace_id,id) do nothing;
  get diagnostics changed=row_count;
  if not exists(select 1 from agt.customer c where c.workspace_id=w and c.id=item and c.source_system=system and c.source_id=item and c.label=agt.required_text(case when is_v2 then row_source->>'clientLabel' else row_source->>'label' end)) then raise exception 'Existing customer mapping conflict';end if;
  customer_count:=customer_count+changed;
 end loop;
 -- Project parents first, then opportunities and POs.
 for d in select value from jsonb_array_elements(review->'commercial') order by case value->>'kind' when 'project' then 0 when 'opportunity' then 1 when 'po' then 2 else 3 end,value->>'sourceId' loop
  item:=(d->>'sourceId')::uuid;entity:=(d->>'entityId')::uuid;customer:=(d->>'customerId')::uuid;project:=(d->>'projectId')::uuid;v_kind:=d->>'kind';
  if d->>'workspaceId' is distinct from w::text or d->>'sourceRevision' is distinct from src_rev or d->'confirmed' is distinct from 'true'::jsonb or d->'eligible' is distinct from 'true'::jsonb
  or nullif(btrim(d->>'evidenceRef'),'') is null or nullif(btrim(d->>'eligibilityEvidenceRef'),'') is null or d->>'contractId' is not null then raise exception 'Unconfirmed commercial review';end if;
  case v_kind when 'project' then
   if is_v2 and d->>'sourceSystem'='crm-projects-implementation' then system:='crm-projects-implementation';cfg:=source->'implementationProjects'->'rows';
   else system:='crm-projects';cfg:=source->'projects'->'rows';end if;
  when 'opportunity' then system:='crm-deals';cfg:=source->'deals'->'rows';
  when 'po' then system:='crm-order-intake';cfg:=source->'orders'->'rows';
  else raise exception 'Commercial source not captured';end case;
  if is_v2 and d->>'sourceSystem' is distinct from system then raise exception 'Commercial source system mismatch';end if;
  select x into strict row_source from jsonb_array_elements(cfg) x where x->>'id'=item::text and x->>'workspaceId'=w::text and x->'archived'='false'::jsonb and coalesce(x->'labelMissing','false'::jsonb)='false'::jsonb;
  if customer is null or entity is null or (v_kind in ('project','opportunity') and project is not null) or (v_kind='po' and project is null) then raise exception 'Incomplete commercial relationship';end if;
  if not exists(select 1 from jsonb_array_elements(review->'customers') x where x->>'sourceId'=customer::text) then raise exception 'Customer confirmation required in this review';end if;
  if v_kind='po' and not exists(select 1 from jsonb_array_elements(review->'commercial') x where x->>'sourceId'=project::text and x->>'kind'='project') then raise exception 'Project confirmation required in this review';end if;
  insert into agt.commercial_reference(workspace_id,id,entity_id,kind,source_system,source_id,customer_id,project_id,label)
  values(w,item,entity,v_kind,system,item,customer,project,agt.required_text(row_source->>'label')) on conflict(workspace_id,id) do nothing;
  get diagnostics changed=row_count;
  if not exists(select 1 from agt.commercial_reference c where c.workspace_id=w and c.id=item and c.entity_id=entity and c.kind=v_kind and c.source_system=system and c.source_id=item and c.customer_id=customer and c.project_id is not distinct from project and c.parent_contract_id is null and c.active and c.label=agt.required_text(row_source->>'label')) then raise exception 'Existing commercial mapping conflict';end if;
  if v_kind<>'project' and not agt.valid_allocation(w,item) then raise exception 'Invalid commercial allocation';end if;
  reference_count:=reference_count+changed;
 end loop;
 -- Optional explicit approved calendar and contacts. Reuse canonical configuration.
 cfg:=review->'organization';
 if cfg is not null and cfg<>'null'::jsonb then
  if nullif(btrim(cfg->>'evidenceRef'),'') is null or cfg->'confirmed' is distinct from 'true'::jsonb then raise exception 'Organization configuration not confirmed';end if;
  if exists(select 1 from agt.notification_config n where n.workspace_id=w) then raise exception 'Existing organization configuration requires explicit update';end if;
  if exists(select 1 from jsonb_each_text(cfg->'contacts') x where not exists(select 1 from agt.person p where p.workspace_id=w and p.user_id::text=x.value and p.department_code=x.key and p.identity_kind='crm-user')) then raise exception 'Department contact is not a linked CRM person';end if;
  perform agt.notification_change(w,a,'notification:configure',w,cfg);
 end if;
 if customer_count+reference_count=0 and (cfg is null or cfg='null'::jsonb) and not (is_v2 and coalesce(review->>'mode','')='authoritative-customers') then raise exception 'No new confirmed decisions to persist';end if;
 insert into agt.commercial_scope_review(workspace_id,review_id,workforce_review_id,company_source_revision,source_revision,actor_id,captured_at,source_packet,decisions)
 values(w,rid,roster,company_rev,src_rev,a,(source->>'capturedAt')::timestamptz,source,review);
 update agt.workspace set revision=revision+1 where id=w;
 return jsonb_build_object('reviewId',rid,'sourceRevision',src_rev,'insertedCustomers',customer_count,'insertedReferences',reference_count,'replayed',false);
end $$;

-- Same signed workforce administration and commercial source admission as v1.
create function private.agt_bind_commercial_review_v2(review jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; roster jsonb; company_status jsonb; source jsonb; decisions jsonb; rid uuid; result jsonb; inserted integer;
begin
 if a is null then raise exception 'Signed context required' using errcode='42501';end if;
 w:=public.current_workspace_id(a);
 if w is distinct from '00000000-0000-4000-8000-000000000001'::uuid then raise exception 'Workspace unavailable' using errcode='42501';end if;
 perform 1 from agt.workspace where id=w for update;
 if not found then raise exception 'Verified workforce activation required';end if;
 roster:=private.agt_workforce_readback_v1();
 if roster->>'workspaceId' is distinct from w::text or coalesce((roster->>'personnel')::integer,0)=0 or roster->>'personnel' is distinct from roster->>'classifications' or roster->>'sourceRevision' is null or roster->>'sourceRevision' is distinct from roster->>'currentSourceRevision' then raise exception 'Verified workforce activation required';end if;
 company_status:=private.agt_company_scope_status_v1();
 if company_status->>'workspaceId' is distinct from w::text or company_status->>'persistedCompanies' is distinct from '3' or company_status->>'matchedCompanies' is distinct from '3' or company_status->>'reviewExists' is distinct from 'true' then raise exception 'Confirmed company binding required';end if;
 source:=public.agt_commercial_inventory_v2();
 if review->>'workspaceId' is distinct from w::text or review->>'sourceRevision' is distinct from source->>'sourceRevision' then raise exception 'Commercial source revision changed';end if;
 rid:=(review->>'reviewId')::uuid;
 if rid is null then raise exception 'Review identity required';end if;
 if review->>'mode'='authoritative-customers' then
  -- Explicit Client classification is authoritative; never infer a contact is a customer.
  decisions:=jsonb_build_object('workspaceId',w,'sourceRevision',source->>'sourceRevision','reviewId',rid,'mode','authoritative-customers','commercial','[]'::jsonb,'organization',null,
  'customers',(select coalesce(jsonb_agg(jsonb_build_object('workspaceId',w,'sourceRevision',source->>'sourceRevision','sourceId',x->>'id','confirmed',true,'evidenceRef','Accounts:Type=Client; source revision '||(source->>'sourceRevision')) order by x->>'id'),'[]'::jsonb) from jsonb_array_elements(source->'accounts'->'rows') x where x->'archived'='false'::jsonb and x->>'clientType'='Client' and nullif(btrim(x->>'clientLabel'),'') is not null and nullif(btrim(x->>'accountCode'),'') is not null and (select count(*) from jsonb_array_elements(source->'accounts'->'rows') y where y->'archived'='false'::jsonb and y->>'accountCode'=x->>'accountCode')=1));
 else
  if review->>'mode' is distinct from 'confirmed-relationships' then raise exception 'Unsupported commercial review mode';end if;
  decisions:=review;
 end if;
 result:=agt.bind_initial_commercial_review(w,a,source,decisions);
 -- Record source identity reconciliation only. No allocation or archive-state change.
 insert into agt.legacy_order_identity(workspace_id,secondary_id,registry_id,review_id)
 select w,(x->>'secondaryId')::uuid,(x->>'nativeOrderId')::uuid,rid from jsonb_array_elements(source->'legacyLinks') x where x->>'nativeOrderId' is not null
 on conflict(workspace_id,secondary_id) do nothing;
 get diagnostics inserted=row_count;
 if exists(select 1 from jsonb_array_elements(source->'legacyLinks') x where x->>'nativeOrderId' is not null and not exists(select 1 from agt.legacy_order_identity l where l.workspace_id=w and l.secondary_id=(x->>'secondaryId')::uuid and l.registry_id=(x->>'nativeOrderId')::uuid)) then raise exception 'Existing legacy identity conflict';end if;
 return result||jsonb_build_object('insertedLegacyLinks',inserted,'matchedLegacyLinks',(select count(*) from jsonb_array_elements(source->'legacyLinks') x where x->>'nativeOrderId' is not null));
end $$;
create function public.agt_bind_commercial_review_v2(review jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.agt_bind_commercial_review_v2(review)$$;
create function private.agt_commercial_review_status_v2(review_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; source jsonb; roster jsonb; r agt.commercial_scope_review%rowtype; cfg jsonb;
begin
 if a is null then raise exception 'Signed context required' using errcode='42501';end if;
 roster:=private.agt_workforce_readback_v1();
 source:=public.agt_commercial_inventory_v2();
 w:=(source->>'workspaceId')::uuid;
 if roster->>'workspaceId' is distinct from w::text then raise exception 'Workspace unavailable' using errcode='42501';end if;
 select * into r from agt.commercial_scope_review x where x.workspace_id=w and x.review_id=agt_commercial_review_status_v2.review_id;
 if not found or r.source_packet->>'contract' is distinct from 'agt-commercial-inventory-v2' then raise exception 'Commercial review unavailable';end if;
 cfg:=r.decisions->'organization';
 return jsonb_build_object('workspaceId',w,'reviewId',r.review_id,'sourceRevision',r.source_revision,'currentSourceRevision',source->>'sourceRevision',
 'reviewedCustomers',jsonb_array_length(r.decisions->'customers'),
 'matchedCustomers',(select count(*) from jsonb_array_elements(r.decisions->'customers') d join agt.customer c on c.workspace_id=w and c.id=(d->>'sourceId')::uuid and c.source_id=c.id and c.source_system='crm-accounts'),
 'reviewedReferences',jsonb_array_length(r.decisions->'commercial'),
 'matchedReferences',(select count(*) from jsonb_array_elements(r.decisions->'commercial') d join agt.commercial_reference c on c.workspace_id=w and c.id=(d->>'sourceId')::uuid and c.source_id=c.id and c.kind=d->>'kind' and c.source_system=d->>'sourceSystem' and c.entity_id=(d->>'entityId')::uuid and c.customer_id=(d->>'customerId')::uuid and c.project_id is not distinct from (d->>'projectId')::uuid and c.parent_contract_id is null and c.active),
 'matchedLegacyLinks',(select count(*) from jsonb_array_elements(r.source_packet->'legacyLinks') x join agt.legacy_order_identity l on l.workspace_id=w and l.secondary_id=(x->>'secondaryId')::uuid and l.registry_id=(x->>'nativeOrderId')::uuid),
 'allocatable',(select count(*) from jsonb_array_elements(r.decisions->'commercial') d where agt.valid_allocation(w,(d->>'sourceId')::uuid)),
 'organizationConfigured',case when cfg is null or cfg='null'::jsonb then null else exists(select 1 from agt.notification_config n where n.workspace_id=w and to_jsonb(n.weekdays)=(select jsonb_agg(x::int order by x::int) from jsonb_array_elements_text(cfg->'weekdays') x) and to_jsonb(n.holidays)=coalesce((select jsonb_agg(x::date order by x::date) from jsonb_array_elements_text(cfg->'holidays') x),'[]'::jsonb) and n.contacts=cfg->'contacts') end);
end $$;
create function public.agt_commercial_review_status_v2(review_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.agt_commercial_review_status_v2(review_id)$$;

revoke all on function private.agt_bind_commercial_review_v2(jsonb),public.agt_bind_commercial_review_v2(jsonb),private.agt_commercial_review_status_v2(uuid),public.agt_commercial_review_status_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function private.agt_bind_commercial_review_v2(jsonb),public.agt_bind_commercial_review_v2(jsonb),private.agt_commercial_review_status_v2(uuid),public.agt_commercial_review_status_v2(uuid) to authenticated;
