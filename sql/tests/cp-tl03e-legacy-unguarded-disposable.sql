-- CP-TL-03E DISPOSABLE SYNTHETIC BASELINE from catalog of live function definitions.
-- This original unguarded source exists ONLY to recreate the old state for isolated tests.
-- NOT a production migration/rollback.

CREATE OR REPLACE FUNCTION public.tradelink_asset_read(p_vendor_id text, p_kind text)
 RETURNS TABLE(image_data text, revision bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;
BEGIN
 IF u IS NULL OR NOT public.has_module_access('tradelink',u) THEN RAISE EXCEPTION 'TRADELINK_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active) THEN RAISE EXCEPTION 'TRADELINK_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_vendor_id IS NULL OR length(p_vendor_id) NOT BETWEEN 1 AND 120 OR p_kind NOT IN ('logo','qr') THEN RAISE EXCEPTION 'TRADELINK_ASSET_INVALID' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.image_data,a.revision FROM public.tradelink_vendor_assets a WHERE a.workspace_id=w AND a.vendor_id=p_vendor_id AND a.asset_kind=p_kind;
END $function$;

CREATE OR REPLACE FUNCTION public.tradelink_asset_write(p_vendor_id text, p_kind text, p_image_data text, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;r bigint;
BEGIN
 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('tradelink',u) THEN RAISE EXCEPTION 'TRADELINK_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active) THEN RAISE EXCEPTION 'TRADELINK_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_vendor_id IS NULL OR length(p_vendor_id) NOT BETWEEN 1 AND 120 OR p_kind NOT IN ('logo','qr') OR p_expected_revision IS NULL OR p_expected_revision<0
 OR (p_image_data IS NOT NULL AND (length(p_image_data)>400000 OR p_image_data !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'))
 THEN RAISE EXCEPTION 'TRADELINK_ASSET_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||'/'||p_vendor_id||'/'||p_kind,0));
 SELECT a.revision INTO r FROM public.tradelink_vendor_assets a WHERE a.workspace_id=w AND a.vendor_id=p_vendor_id AND a.asset_kind=p_kind FOR UPDATE;
 IF coalesce(r,0)<>p_expected_revision THEN RAISE EXCEPTION 'TRADELINK_ASSET_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF p_image_data IS NULL THEN
  DELETE FROM public.tradelink_vendor_assets WHERE workspace_id=w AND vendor_id=p_vendor_id AND asset_kind=p_kind;
  RETURN 0;
 END IF;
 INSERT INTO public.tradelink_vendor_assets(workspace_id,vendor_id,asset_kind,image_data,revision,updated_by)
 VALUES(w,p_vendor_id,p_kind,p_image_data,p_expected_revision+1,u)
 ON CONFLICT(workspace_id,vendor_id,asset_kind) DO UPDATE
 SET image_data=excluded.image_data,revision=excluded.revision,updated_by=u,updated_at=now();
 RETURN p_expected_revision+1;
END $function$;

CREATE OR REPLACE FUNCTION public.tradelink_cleanup_fence_activate(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(decision text, expires_at timestamp with time zone, deletion_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); ws uuid; state_revision bigint; candidate_created timestamptz; check_result record; fence_expiry timestamptz;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid fence parameters' using errcode='22023';end if;
 select e.revision into state_revision from public.module_state_entries e where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared' and e.owner_key='*' for update;
 if not found or state_revision<>p_expected_revision then return query select 'blocked:stale-or-missing-revision'::text,null::timestamptz,false;return;end if;
 select c.created_at into candidate_created from public.tradelink_attachment_reconciliation c where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Candidate not found' using errcode='22023';end if;
 if candidate_created>now()-interval '24 hours' then return query select 'blocked:grace-period'::text,null::timestamptz,false;return;end if;
 select v.decision,v.current_revision,v.storage_object_present into check_result from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
 if not found or check_result.decision<>'unreferenced-at-locked-revision' or not check_result.storage_object_present then return query select ('blocked:'||coalesce(check_result.decision,'unverifiable'))::text,null::timestamptz,false;return;end if;
 fence_expiry:=now()+interval '30 seconds';
 insert into public.tradelink_cleanup_reference_fences(workspace_id,storage_key,created_at,expires_at)
 values(ws,p_storage_key,now(),fence_expiry)
 on conflict(workspace_id,storage_key) do update set created_at=now(),expires_at=excluded.expires_at;
 return query select 'fenced:review-only'::text,fence_expiry,false;
end;$function$;

CREATE OR REPLACE FUNCTION public.tradelink_cleanup_fence_release(p_storage_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();ws uuid;released_count integer;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' then raise exception 'Invalid workspace key' using errcode='22023';end if;
 delete from public.tradelink_cleanup_reference_fences f where f.workspace_id=ws and f.storage_key=p_storage_key;
 get diagnostics released_count=row_count;
 return released_count>0;
end;$function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_assess(p_storage_key text)
 RETURNS TABLE(status text, workspace_revision bigint, storage_object_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ws uuid; payload jsonb; rev bigint; manifest_valid boolean:=false; reference_found boolean:=false; object_found boolean:=false; result_status text;
begin
 if caller is null or not public.has_module_access('tradelink',caller) or not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then raise exception 'TradeLink administrator authorization required' using errcode='42501'; end if;
 ws:=public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' then raise exception 'Invalid workspace attachment key' using errcode='22023'; end if;
 if not exists(select 1 from public.tradelink_attachment_reconciliation c where c.workspace_id=ws and c.storage_key=p_storage_key) then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select e.value::jsonb,e.revision into payload,rev from public.module_state_entries e where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared' limit 1;
 if payload is not null and jsonb_typeof(payload)='object' then
  reference_found:=jsonb_path_exists(payload,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',p_storage_key));
  if jsonb_typeof(payload->'attachments')='array' then
   select not exists(select 1 from jsonb_array_elements(payload->'attachments') a where jsonb_typeof(a)<>'object' or nullif(btrim(a->>'id'),'') is null or nullif(btrim(a->>'documentId'),'') is null or nullif(btrim(a->>'storageKey'),'') is null or a->>'status' not in ('active','replaced','removed') or a->>'storageProvider' not in ('supabase-storage','local-disk','local-indexeddb') or (a->>'storageProvider'='supabase-storage' and left(a->>'storageKey',length(ws::text)+1)<>ws::text||'/'))
   and (select count(*)=count(distinct a->>'id') and count(*)=count(distinct a->>'storageKey') from jsonb_array_elements(payload->'attachments') a) into manifest_valid;
  end if;
 end if;
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into object_found;
 if reference_found then result_status:='referenced'; elsif manifest_valid then result_status:='unreferenced-at-revision'; else result_status:='unverifiable'; end if;
 update public.tradelink_attachment_reconciliation c set status=result_status,observed_revision=rev,observed_at=now(),updated_at=now() where c.workspace_id=ws and c.storage_key=p_storage_key;
 return query select result_status,rev,object_found;
end; $function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_cleanup_audit_list(p_limit integer DEFAULT 50)
 RETURNS TABLE(request_id uuid, storage_key text, requested_by uuid, expected_revision bigint, observed_revision bigint, assessment text, execution_status text, requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); ws uuid;
begin
 if actor is null or not public.has_module_access('tradelink',actor) or
 not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501'; end if;
 ws:=public.current_workspace_id(actor);
 if ws is null then raise exception 'Workspace authorization required' using errcode='42501'; end if;
 return query select a.request_id,a.storage_key,a.requested_by,a.expected_revision,a.observed_revision,a.assessment,a.execution_status,a.requested_at
 from public.tradelink_attachment_cleanup_audit a where a.workspace_id=ws
 order by a.requested_at desc,a.request_id desc limit least(greatest(coalesce(p_limit,50),1),100);
end; $function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_cleanup_preflight(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(decision text, observed_revision bigint, eligible_for_review boolean, deletion_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); ws uuid; candidate record; verified record;
begin
 if actor is null or not public.has_module_access('tradelink',actor)
    or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
   raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
   raise exception 'Invalid cleanup candidate or revision' using errcode='22023';
 end if;
 select c.created_at,c.status into candidate from public.tradelink_attachment_reconciliation c
 where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select v.decision,v.current_revision,v.storage_object_present into verified
 from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
 if not found then raise exception 'Reconciliation verification unavailable' using errcode='22023'; end if;
 return query select
 case
  when candidate.created_at>now()-interval '24 hours' then 'blocked:grace-period'
  when verified.decision<>'unreferenced-at-locked-revision' then 'blocked:'||verified.decision
  when not verified.storage_object_present then 'blocked:object-absent'
  else 'review-only:unreferenced-at-revision'
 end::text,
 verified.current_revision::bigint,
 (candidate.created_at<=now()-interval '24 hours' and verified.decision='unreferenced-at-locked-revision' and verified.storage_object_present)::boolean,
 false::boolean;
end; $function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_list(p_limit integer DEFAULT 50)
 RETURNS TABLE(storage_key text, attachment_id text, reason text, status text, observed_revision bigint, storage_object_present boolean, reported_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ws uuid;
begin
 if caller is null or not public.has_module_access('tradelink',caller) or
 not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
 raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null then raise exception 'Workspace authorization required' using errcode='42501'; end if;
 return query
 select c.storage_key,c.attachment_id,c.reason,c.status,c.observed_revision,
 exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=c.storage_key),c.created_at
 from public.tradelink_attachment_reconciliation c where c.workspace_id=ws
 order by c.updated_at desc,c.storage_key asc limit least(greatest(coalesce(p_limit,50),1),100);
end; $function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_report(p_storage_key text, p_attachment_id text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); ws uuid;
begin
 if caller is null or not public.has_module_access('tradelink',caller) then
  raise exception 'TradeLink authorization required' using errcode='42501';
 end if;
 ws := public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or
 length(p_storage_key)>1024 or p_attachment_id is null or length(p_attachment_id) not between 1 and 200 or
 p_reason not in ('commit-uncertain','cleanup-failed') then
  raise exception 'Invalid reconciliation candidate' using errcode='22023';
 end if;
 insert into public.tradelink_attachment_reconciliation (workspace_id,storage_key,attachment_id,reported_by,reason)
 values (ws,p_storage_key,p_attachment_id,caller,p_reason)
 on conflict (workspace_id,storage_key) do update set updated_at=now(),reason=excluded.reason,status='pending',observed_revision=null,observed_at=null;
 return 'pending';
end; $function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_request_cleanup(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(request_id uuid, decision text, observed_revision bigint, deletion_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();ws uuid;guard record;logged_id uuid;
begin
if actor is null or not public.has_module_access('tradelink',actor) or not(public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then
raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
ws:=public.current_workspace_id(actor);
if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
raise exception 'Invalid cleanup candidate or revision' using errcode='22023';end if;
select v.decision,v.current_revision,v.storage_object_present into guard from public.tradelink_reconciliation_verify_revision(p_storage_key,p_expected_revision) v;
if not found then raise exception 'Reconciliation verification unavailable' using errcode='22023';end if;
insert into public.tradelink_attachment_cleanup_audit(workspace_id,storage_key,requested_by,expected_revision,observed_revision,assessment,storage_object_present)
values(ws,p_storage_key,actor,p_expected_revision,guard.current_revision,guard.decision,guard.storage_object_present)
returning public.tradelink_attachment_cleanup_audit.request_id into logged_id;
return query select logged_id,('blocked:'||guard.decision)::text,guard.current_revision::bigint,false;
end;$function$;

CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_verify_revision(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(decision text, current_revision bigint, storage_object_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 caller uuid := auth.uid(); ws uuid; payload jsonb; rev bigint;
 referenced boolean := false; manifest_valid boolean := false; present boolean := false; outcome text;
begin
 if caller is null or not public.has_module_access('tradelink',caller)
  or not (public.is_platform_admin(caller) or lower(coalesce(public.module_role_for('tradelink',caller),'')) in ('general manager','admin')) then
  raise exception 'TradeLink administrator authorization required' using errcode='42501';
 end if;
 ws:=public.current_workspace_id(caller);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' or p_expected_revision is null or p_expected_revision<0 then
  raise exception 'Invalid reconciliation revision or workspace key' using errcode='22023';
 end if;
 perform 1 from public.tradelink_attachment_reconciliation c
  where c.workspace_id=ws and c.storage_key=p_storage_key for update;
 if not found then raise exception 'Reconciliation candidate not found' using errcode='22023'; end if;
 select e.value::jsonb,e.revision into payload,rev from public.module_state_entries e
  where e.workspace_id=ws and e.module_id='tradelink' and e.state_key='tradelink_state_v1' and e.scope='shared'
  for share;
 if payload is not null and jsonb_typeof(payload)='object' then
   referenced := jsonb_path_exists(payload,'$.**.storageKey ? (@ == $expected)',jsonb_build_object('expected',p_storage_key));
   if jsonb_typeof(payload->'attachments')='array' then
    select not exists(
      select 1 from jsonb_array_elements(payload->'attachments') a
      where jsonb_typeof(a)<>'object' or nullif(btrim(a->>'id'),'') is null
      or nullif(btrim(a->>'documentId'),'') is null or nullif(btrim(a->>'storageKey'),'') is null
      or a->>'status' not in ('active','replaced','removed')
      or a->>'storageProvider' not in ('supabase-storage','local-disk','local-indexeddb')
      or (a->>'storageProvider'='supabase-storage' and left(a->>'storageKey',length(ws::text)+1)<>ws::text||'/'))
    and (select count(*)=count(distinct a->>'id') and count(*)=count(distinct a->>'storageKey')
       from jsonb_array_elements(payload->'attachments') a) into manifest_valid;
   end if;
 end if;
 select exists(select 1 from storage.objects o where o.bucket_id='tradelink-attachments' and o.name=p_storage_key) into present;
 outcome := case
   when rev is null or rev<>p_expected_revision then 'stale-or-missing-revision'
   when referenced then 'referenced'
   when not manifest_valid then 'unverifiable'
   when not present then 'object-absent'
   else 'unreferenced-at-locked-revision'
 end;
 return query select outcome,rev,present;
end; $function$;
