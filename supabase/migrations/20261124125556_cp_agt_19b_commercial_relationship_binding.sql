-- Initial evidence-bound commercial and organization review. Not a public RPC.
-- Capture and actor are provided only by the existing trusted signed host.
create table agt.commercial_scope_review(
 workspace_id uuid not null references agt.workspace(id),
 review_id uuid not null,
 workforce_review_id uuid not null references agt.crm_source_review(review_id),
 company_source_revision text not null,
 source_revision text not null,
 actor_id uuid not null,
 captured_at timestamptz not null,
 source_packet jsonb not null,
 decisions jsonb not null,
 primary key(workspace_id,review_id),
 foreign key(workspace_id,company_source_revision) references agt.company_scope_review(workspace_id,source_revision),
 foreign key(workspace_id,actor_id) references agt.person(workspace_id,user_id)
);
create trigger commercial_scope_review_immutable before update or delete on agt.commercial_scope_review for each row execute function agt.preserve_crm_source_review();

create function agt.bind_initial_commercial_review(w uuid,a uuid,source jsonb,review jsonb)
returns jsonb language plpgsql set search_path=agt,pg_catalog as $$
declare
 rid uuid; roster uuid; company_rev text; src_rev text; prior agt.commercial_scope_review%rowtype;
 d jsonb; row_source jsonb; item uuid; entity uuid; customer uuid; project uuid; v_kind text; system text;
 customer_count integer:=0; reference_count integer:=0; changed integer; cfg jsonb;
begin
 if source->>'contract' is distinct from 'agt-commercial-inventory-v1'
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
  select x into strict row_source from jsonb_array_elements(source->'contacts'->'rows') x where x->>'id'=item::text and x->>'workspaceId'=w::text and x->'archived'='false'::jsonb;
  insert into agt.customer(workspace_id,id,source_system,source_id,label) values(w,item,'crm-contacts',item,agt.required_text(row_source->>'label')) on conflict(workspace_id,id) do nothing;
  get diagnostics changed=row_count;
  if not exists(select 1 from agt.customer c where c.workspace_id=w and c.id=item and c.source_system='crm-contacts' and c.source_id=item and c.label=agt.required_text(row_source->>'label')) then raise exception 'Existing customer mapping conflict';end if;
  customer_count:=customer_count+changed;
 end loop;
 -- Project parents first, then opportunities and POs.
 for d in select value from jsonb_array_elements(review->'commercial') order by case value->>'kind' when 'project' then 0 when 'opportunity' then 1 when 'po' then 2 else 3 end,value->>'sourceId' loop
  item:=(d->>'sourceId')::uuid;entity:=(d->>'entityId')::uuid;customer:=(d->>'customerId')::uuid;project:=(d->>'projectId')::uuid;v_kind:=d->>'kind';
  if d->>'workspaceId' is distinct from w::text or d->>'sourceRevision' is distinct from src_rev or d->'confirmed' is distinct from 'true'::jsonb or d->'eligible' is distinct from 'true'::jsonb
  or nullif(btrim(d->>'evidenceRef'),'') is null or nullif(btrim(d->>'eligibilityEvidenceRef'),'') is null or d->>'contractId' is not null then raise exception 'Unconfirmed commercial review';end if;
  case v_kind when 'project' then system:='crm-projects';cfg:=source->'projects'->'rows';
  when 'opportunity' then system:='crm-deals';cfg:=source->'deals'->'rows';
  when 'po' then system:='crm-order-intake';cfg:=source->'orders'->'rows';
  else raise exception 'Commercial source not captured';end case;
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
 if customer_count+reference_count=0 and (cfg is null or cfg='null'::jsonb) then raise exception 'No new confirmed decisions to persist';end if;
 insert into agt.commercial_scope_review(workspace_id,review_id,workforce_review_id,company_source_revision,source_revision,actor_id,captured_at,source_packet,decisions)
 values(w,rid,roster,company_rev,src_rev,a,(source->>'capturedAt')::timestamptz,source,review);
 update agt.workspace set revision=revision+1 where id=w;
 return jsonb_build_object('reviewId',rid,'sourceRevision',src_rev,'insertedCustomers',customer_count,'insertedReferences',reference_count,'replayed',false);
end $$;
revoke all on agt.commercial_scope_review from public,anon,authenticated,service_role;
revoke all on function agt.bind_initial_commercial_review(uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Only accept decisions from the existing signed administrator. Always
-- recompute source records from the host, never trust client source rows.
-- The current Order Intake SELECT policies require auth.uid(), current
-- workspace and has_module_access; the capture explicitly checks these same
-- conditions even when invoked inside this private definer.
create function private.agt_bind_commercial_review_v1(review jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; roster jsonb; source jsonb; company_status jsonb;
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
 source:=public.agt_commercial_inventory_v1();
 return agt.bind_initial_commercial_review(w,a,source,review);
end $$;
create function public.agt_bind_commercial_review_v1(review jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.agt_bind_commercial_review_v1(review)$$;

create function private.agt_commercial_review_status_v1(review_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=auth.uid(); w uuid; source jsonb; roster jsonb; r agt.commercial_scope_review%rowtype; cfg jsonb;
begin
 if a is null then raise exception 'Signed context required' using errcode='42501';end if;
 roster:=private.agt_workforce_readback_v1();
 source:=public.agt_commercial_inventory_v1();
 w:=(source->>'workspaceId')::uuid;
 if roster->>'workspaceId' is distinct from w::text then raise exception 'Workspace unavailable' using errcode='42501';end if;
 select * into r from agt.commercial_scope_review x where x.workspace_id=w and x.review_id=agt_commercial_review_status_v1.review_id;
 if not found then raise exception 'Commercial review unavailable';end if;
 cfg:=r.decisions->'organization';
 return jsonb_build_object('workspaceId',w,'reviewId',r.review_id,'sourceRevision',r.source_revision,'currentSourceRevision',source->>'sourceRevision',
 'reviewedCustomers',jsonb_array_length(r.decisions->'customers'),
 'matchedCustomers',(select count(*) from jsonb_array_elements(r.decisions->'customers') d join agt.customer c on c.workspace_id=w and c.id=(d->>'sourceId')::uuid and c.source_id=c.id and c.source_system='crm-contacts'),
 'reviewedReferences',jsonb_array_length(r.decisions->'commercial'),
 'matchedReferences',(select count(*) from jsonb_array_elements(r.decisions->'commercial') d join agt.commercial_reference c on c.workspace_id=w and c.id=(d->>'sourceId')::uuid and c.source_id=c.id and c.kind=d->>'kind' and c.entity_id=(d->>'entityId')::uuid and c.customer_id=(d->>'customerId')::uuid and c.project_id is not distinct from (d->>'projectId')::uuid and c.parent_contract_id is null and c.active),
 'allocatable',(select count(*) from jsonb_array_elements(r.decisions->'commercial') d where agt.valid_allocation(w,(d->>'sourceId')::uuid)),
 'organizationConfigured',case when cfg is null or cfg='null'::jsonb then null else exists(select 1 from agt.notification_config n where n.workspace_id=w and to_jsonb(n.weekdays)=(select jsonb_agg(x::int order by x::int) from jsonb_array_elements_text(cfg->'weekdays') x) and to_jsonb(n.holidays)=coalesce((select jsonb_agg(x::date order by x::date) from jsonb_array_elements_text(cfg->'holidays') x),'[]'::jsonb) and n.contacts=cfg->'contacts') end);
end $$;
create function public.agt_commercial_review_status_v1(review_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select private.agt_commercial_review_status_v1(review_id)$$;
revoke all on function private.agt_bind_commercial_review_v1(jsonb),public.agt_bind_commercial_review_v1(jsonb),private.agt_commercial_review_status_v1(uuid),public.agt_commercial_review_status_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.agt_bind_commercial_review_v1(jsonb),public.agt_bind_commercial_review_v1(jsonb),private.agt_commercial_review_status_v1(uuid),public.agt_commercial_review_status_v1(uuid) to authenticated;
;
