-- CP-WS-02D/B3 — dormant source-fingerprint-locked remaining domain ceilings.
-- Built from the production pg_get_functiondef catalog 2026-11-05.
-- NOT a production migration. Never install without explicit separate approval,
-- signed-user denial evidence, migration rollback and new fingerprint validation.
-- Original domain RBAC, record scopes, CAS/audit logic and EXECUTE grants preserved.
-- The inserted maximum-permission guard is additional AND authorization only.
\set ON_ERROR_STOP on
BEGIN;
DO $ws02d_b3_preflight$
BEGIN
 IF to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 THEN RAISE EXCEPTION 'WS02D/B3 private role maximum missing' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.append_module_activity(text,text,text,text,text,text,jsonb)'))) IS DISTINCT FROM '5b37cb732bfd115cab7e90db58ed192f'
 THEN RAISE EXCEPTION 'WS02D/B3 live append_module_activity source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.charter_admin_set_role(uuid,text,boolean)'))) IS DISTINCT FROM '105feace9e2f6b6248e062b6b8829767'
 THEN RAISE EXCEPTION 'WS02D/B3 live charter_admin_set_role source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.commit_fueltrack_requests_with_activity(text,bigint,text,text,text,text,text,jsonb)'))) IS DISTINCT FROM '4ed0b71c722ef5165250b651f3af05ce'
 THEN RAISE EXCEPTION 'WS02D/B3 live commit_fueltrack_requests_with_activity source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.employee_evaluation_create_employee(jsonb)'))) IS DISTINCT FROM '3dd42c3432a005df286313c92d9f1345'
 THEN RAISE EXCEPTION 'WS02D/B3 live employee_evaluation_create_employee source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.employee_evaluation_review_transition(uuid,text,text,bigint)'))) IS DISTINCT FROM '0dba32d8f84cc3ccecec8dc12b60a4b3'
 THEN RAISE EXCEPTION 'WS02D/B3 live employee_evaluation_review_transition source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.employee_evaluation_save(jsonb)'))) IS DISTINCT FROM '71f32c1ba726e32e9fda0ffbab139efa'
 THEN RAISE EXCEPTION 'WS02D/B3 live employee_evaluation_save source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.employee_evaluation_update_employee(uuid,jsonb)'))) IS DISTINCT FROM 'ff6444c8ebbb11e7966dd25a655e8f60'
 THEN RAISE EXCEPTION 'WS02D/B3 live employee_evaluation_update_employee source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.employee_evaluation_update_settings(jsonb)'))) IS DISTINCT FROM 'c573ec4251b51a6f1865561aeac684cc'
 THEN RAISE EXCEPTION 'WS02D/B3 live employee_evaluation_update_settings source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.import_fueltrack_activity_backup(jsonb)'))) IS DISTINCT FROM '2dc777a252161222a3d2e316dd458eb6'
 THEN RAISE EXCEPTION 'WS02D/B3 live import_fueltrack_activity_backup source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_archive(uuid,integer)'))) IS DISTINCT FROM '893ef210228eeaa5e07f4e1c777982d4'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_archive source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_create(jsonb)'))) IS DISTINCT FROM '97365c21506bf81389667b1314ad9a13'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_create source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_create_idempotent(jsonb,uuid)'))) IS DISTINCT FROM 'bf1d6594b6846ff5d8b0acdf77799ce3'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_create_idempotent source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_qa_archive_once()'))) IS DISTINCT FROM '545be53d8ded36aff7ebc423b57dd741'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_qa_archive_once source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_restore(uuid,integer)'))) IS DISTINCT FROM '32998bbb80e1a15a5dd12f14a7f8f96a'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_restore source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_update_details(uuid,jsonb,integer)'))) IS DISTINCT FROM '1c6d418d29f31b27a8e35597c7ca3c7a'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_update_details source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.order_intake_update_status(uuid,text,integer)'))) IS DISTINCT FROM 'ae38dd0d556a963388b513501beb9942'
 THEN RAISE EXCEPTION 'WS02D/B3 live order_intake_update_status source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)'))) IS DISTINCT FROM '985640385f673b5b8ef74ce480ec6ccd'
 THEN RAISE EXCEPTION 'WS02D/B3 live timetracker_commit_attendance_raw_gps03 source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_asset_write(text,text,text,bigint)'))) IS DISTINCT FROM '1f00702f27deee65b3f134e81bb36cb7'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_asset_write source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_cleanup_fence_activate(text,bigint)'))) IS DISTINCT FROM 'aeda00392edb96c1269e7c60bc6e1f56'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_cleanup_fence_activate source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_cleanup_fence_release(text)'))) IS DISTINCT FROM '7ecd455a908c55d3136a85c2bfd01660'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_cleanup_fence_release source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_reconciliation_assess(text)'))) IS DISTINCT FROM '55678732a50cca6d4d4dd2cd0b0b4810'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_reconciliation_assess source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_reconciliation_report(text,text,text)'))) IS DISTINCT FROM '6327889c48be4e8d69c576513958c3c1'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_reconciliation_report source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.tradelink_reconciliation_request_cleanup(text,bigint)'))) IS DISTINCT FROM 'fa073e92fe1300403d3088a927b53b44'
 THEN RAISE EXCEPTION 'WS02D/B3 live tradelink_reconciliation_request_cleanup source drift; re-review required' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef(to_regprocedure('public.wm_admin_set_application_role(uuid,text,text,boolean)'))) IS DISTINCT FROM '3bd0edfb36b956ca68729ea81dc7a83e'
 THEN RAISE EXCEPTION 'WS02D/B3 live wm_admin_set_application_role source drift; re-review required' USING ERRCODE='42501'; END IF;
END $ws02d_b3_preflight$;
-- WS02D_B3_SOURCE_BEGIN:append_module_activity
CREATE OR REPLACE FUNCTION public.append_module_activity(p_module_id text, p_event_id text, p_event_type text, p_title text, p_message text DEFAULT ''::text, p_request_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; prof public.profiles%rowtype; role_name text; evt public.module_activity_events%rowtype;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if p_module_id<>'fueltrack-plus' then raise exception 'activity stream is not enabled for module' using errcode='22023'; end if;
  if length(trim(coalesce(p_event_id,'')))<8 or length(p_event_id)>160 then raise exception 'invalid event id' using errcode='22023'; end if;
  if length(trim(coalesce(p_title,'')))<1 or length(p_title)>240 then raise exception 'invalid activity title' using errcode='22023'; end if;
  if length(coalesce(p_message,''))>4000 then raise exception 'activity message is too long' using errcode='22023'; end if;
  if p_event_type not in ('submit','review','issue','system') then raise exception 'invalid activity type' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); select * into prof from public.profiles p where p.id=caller and p.status='active';
  role_name:=coalesce(public.module_role_for(p_module_id,caller),'User');
  insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload)
  values(ws,p_module_id,p_event_id,p_event_type,trim(p_title),coalesce(p_message,''),nullif(trim(coalesce(p_request_id,'')),''),caller,prof.email,coalesce(prof.display_name,prof.email),role_name,coalesce(p_payload,'{}'::jsonb))
  on conflict(workspace_id,module_id,event_id) do nothing;
  select * into evt from public.module_activity_events e where e.workspace_id=ws and e.module_id=p_module_id and e.event_id=p_event_id;
  return jsonb_build_object('id',evt.event_id,'sequence',evt.sequence,'type',evt.event_type,'title',evt.title,'message',evt.message,'requestId',coalesce(evt.request_id,''),'actor',evt.actor_name,'actorUserId',evt.actor_user_id,'actorEmail',evt.actor_email,'actorRole',evt.actor_role,'at',evt.occurred_at,'payload',evt.payload);
end;
$function$
;
-- WS02D_B3_SOURCE_END:append_module_activity
-- WS02D_B3_SOURCE_BEGIN:charter_admin_set_role
CREATE OR REPLACE FUNCTION public.charter_admin_set_role(p_user_id uuid, p_role text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_assignment public.module_role_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot modify your own Charter Navigator role' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin','user') OR p_role IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid Charter Navigator role or enabled state' USING ERRCODE = '22023';
  END IF;
  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = v_actor AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active administrator workspace membership required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = p_user_id AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target must be an active member of the current workspace' USING ERRCODE = '42501';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.module_role_assignments
      (user_id, module_id, role, enabled, assigned_by)
    VALUES (p_user_id, 'charter-navigator', p_role, true, v_actor)
    ON CONFLICT (user_id, module_id)
    DO UPDATE SET role = EXCLUDED.role, enabled = true,
      assigned_by = EXCLUDED.assigned_by, updated_at = now();
  ELSE
    UPDATE public.module_role_assignments
    SET enabled = false, assigned_by = v_actor, updated_at = now()
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  END IF;

  SELECT * INTO v_assignment FROM public.module_role_assignments
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  RETURN pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'role', CASE WHEN v_assignment.user_id IS NULL THEN NULL ELSE v_assignment.role END,
    'enabled', COALESCE(v_assignment.enabled, false),
    'updated_at', v_assignment.updated_at);
END;
$function$
;
-- WS02D_B3_SOURCE_END:charter_admin_set_role
-- WS02D_B3_SOURCE_BEGIN:commit_fueltrack_requests_with_activity
CREATE OR REPLACE FUNCTION public.commit_fueltrack_requests_with_activity(p_value text, p_expected_revision bigint, p_event_id text, p_event_type text, p_title text, p_message text DEFAULT ''::text, p_request_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller uuid:=auth.uid(); ws uuid; owner text:='*'; current_revision bigint; current_value text; effective_value text;
  result_revision bigint; result_updated_at timestamptz; existing_evt jsonb; activity_evt jsonb; pol record;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access('fueltrack-plus',caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  select jsonb_build_object('id',e.event_id,'sequence',e.sequence,'type',e.event_type,'title',e.title,'message',e.message,'requestId',coalesce(e.request_id,''),'actor',e.actor_name,'actorUserId',e.actor_user_id,'actorEmail',e.actor_email,'actorRole',e.actor_role,'at',e.occurred_at,'payload',e.payload)
    into existing_evt from public.module_activity_events e where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.event_id=p_event_id;
  if existing_evt is not null then
    select e.revision,e.updated_at into result_revision,result_updated_at from public.module_state_entries e
      where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.state_key='fueltrackplus.requests.v3' and e.scope='shared' and e.owner_key='*';
    return jsonb_build_object('state_key','fueltrackplus.requests.v3','revision',coalesce(result_revision,0),'updated_at',result_updated_at,'activity',existing_evt,'idempotent',true);
  end if;

  select * into pol from public.module_state_policy('fueltrack-plus','fueltrackplus.requests.v3');
  if not found or not pol.writable then raise exception 'request state policy unavailable' using errcode='42501'; end if;
  if p_value is null or octet_length(p_value)>pol.max_bytes then raise exception 'request state exceeds policy limit' using errcode='22023'; end if;

  select e.revision,e.value into current_revision,current_value from public.module_state_entries e
   where e.workspace_id=ws and e.module_id='fueltrack-plus' and e.state_key='fueltrackplus.requests.v3' and e.scope='shared' and e.owner_key=owner for update;
  if coalesce(current_revision,0)<>coalesce(p_expected_revision,0) then
    raise exception 'WM_STATE_CONFLICT expected %, current %',coalesce(p_expected_revision,0),coalesce(current_revision,0) using errcode='40001';
  end if;
  effective_value:=public.module_state_merge_authorized_payload('fueltrack-plus','fueltrackplus.requests.v3',current_value,p_value,caller);
  if not public.module_state_payload_allowed('fueltrack-plus','fueltrackplus.requests.v3',current_value,effective_value,caller) then
    raise exception 'request payload violates record ownership boundary' using errcode='42501';
  end if;
  if not public.module_state_invariants_valid('fueltrack-plus','fueltrackplus.requests.v3',effective_value) then
    raise exception 'request state violates data integrity invariants' using errcode='22023';
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,'fueltrack-plus','fueltrackplus.requests.v3','shared','*',effective_value,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update set value=excluded.value,revision=public.module_state_entries.revision+1,updated_by=caller,updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  activity_evt:=public.append_module_activity('fueltrack-plus',p_event_id,p_event_type,p_title,p_message,p_request_id,p_payload);
  return jsonb_build_object('state_key','fueltrackplus.requests.v3','revision',result_revision,'updated_at',result_updated_at,'activity',activity_evt,'idempotent',false);
end;
$function$
;
-- WS02D_B3_SOURCE_END:commit_fueltrack_requests_with_activity
-- WS02D_B3_SOURCE_BEGIN:employee_evaluation_create_employee
CREATE OR REPLACE FUNCTION public.employee_evaluation_create_employee(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid:=auth.uid(); v_workspace uuid; v_actor public.employee_evaluation_employees%ROWTYPE;
 v_supervisor public.employee_evaluation_employees%ROWTYPE; v_result public.employee_evaluation_employees%ROWTYPE;
 v_key text; v_code text; v_name text; v_email text; v_role text; v_supervisor_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 v_workspace:=public.current_workspace_id(v_user);
 IF v_workspace IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active)
 OR NOT public.has_module_access('employee-eval',v_user) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.employee_evaluation_employees WHERE workspace_id=v_workspace AND auth_user_id=v_user AND active;
 IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_input) LOOP
  IF v_key NOT IN ('employeeCode','name','email','jobTitle','department','supervisorId','role','active')
  THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_FIELD' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF jsonb_typeof(p_input->'employeeCode')<>'string' OR jsonb_typeof(p_input->'name')<>'string'
 OR jsonb_typeof(p_input->'email')<>'string' OR jsonb_typeof(p_input->'role')<>'string'
 OR (p_input ? 'active' AND jsonb_typeof(p_input->'active')<>'boolean')
 OR (p_input ? 'jobTitle' AND jsonb_typeof(p_input->'jobTitle') NOT IN ('string','null'))
 OR (p_input ? 'department' AND jsonb_typeof(p_input->'department') NOT IN ('string','null'))
 OR (p_input ? 'supervisorId' AND jsonb_typeof(p_input->'supervisorId') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TYPES' USING ERRCODE='22023'; END IF;
 v_code:=btrim(p_input->>'employeeCode'); v_name:=btrim(p_input->>'name');
 v_email:=lower(btrim(p_input->>'email')); v_role:=p_input->>'role';
 IF v_code IS NULL OR v_name IS NULL OR v_email IS NULL OR v_role IS NULL
 OR length(v_code) NOT BETWEEN 1 AND 80 OR length(v_name) NOT BETWEEN 1 AND 200
 OR length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR v_role NOT IN ('admin','supervisor','employee') THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_EMPLOYEE' USING ERRCODE='22023'; END IF;
 IF nullif(p_input->>'supervisorId','') IS NOT NULL THEN
  BEGIN v_supervisor_id:=(p_input->>'supervisorId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END;
  SELECT * INTO v_supervisor FROM public.employee_evaluation_employees
  WHERE id=v_supervisor_id AND workspace_id=v_workspace AND active AND role IN ('admin','supervisor');
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.employee_evaluation_employees
 (workspace_id,auth_user_id,employee_code,name,email,job_title,department,supervisor_id,role,active)
 VALUES(v_workspace,NULL,v_code,v_name,v_email,nullif(btrim(p_input->>'jobTitle'),''),
 nullif(btrim(p_input->>'department'),''),v_supervisor_id,v_role,coalesce((p_input->>'active')::boolean,true))
 RETURNING * INTO v_result;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(v_workspace,'CREATE','employee',v_result.id::text,'Employee record created',v_user,
 jsonb_build_object('employeeCode',v_code,'role',v_role,'revision',1));
 RETURN to_jsonb(v_result)-'auth_user_id';
END; $function$
;
-- WS02D_B3_SOURCE_END:employee_evaluation_create_employee
-- WS02D_B3_SOURCE_BEGIN:employee_evaluation_review_transition
CREATE OR REPLACE FUNCTION public.employee_evaluation_review_transition(p_evaluation_id uuid, p_target_status text, p_review_comment text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_workspace uuid;
  v_actor public.employee_evaluation_employees%ROWTYPE;
  v_current public.employee_evaluation_evaluations%ROWTYPE;
  v_updated public.employee_evaluation_evaluations%ROWTYPE;
  v_comment text := coalesce(p_review_comment, '');
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  v_workspace := public.current_workspace_id(v_user);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active=true
  ) OR NOT public.has_module_access('employee-eval',v_user) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_actor FROM public.employee_evaluation_employees e
    WHERE e.workspace_id=v_workspace AND e.auth_user_id=v_user AND e.active=true;
  IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVIEW_DENIED' USING ERRCODE='42501'; END IF;
  IF p_evaluation_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
      OR p_target_status IS NULL OR p_target_status NOT IN ('Reviewed','Returned','Finalized') THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  IF length(v_comment)>10000 OR (p_target_status='Returned' AND length(btrim(v_comment))<5) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_REVIEW_COMMENT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_current FROM public.employee_evaluation_evaluations ev
    WHERE ev.id=p_evaluation_id AND ev.workspace_id=v_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EVALUATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_current.revision<>p_expected_revision THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF NOT ((v_current.status='Submitted' AND p_target_status IN ('Reviewed','Returned')) OR
    (v_current.status='Reviewed' AND p_target_status IN ('Finalized','Returned'))) THEN
    RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;
  UPDATE public.employee_evaluation_evaluations ev SET
    status=p_target_status, review_comment=v_comment, revision=ev.revision+1, updated_at=transaction_timestamp(),
    reviewed_by=CASE WHEN p_target_status='Reviewed' THEN v_actor.id ELSE ev.reviewed_by END,
    reviewed_at=CASE WHEN p_target_status='Reviewed' THEN transaction_timestamp() ELSE ev.reviewed_at END,
    finalized_by=CASE WHEN p_target_status='Finalized' THEN v_actor.id ELSE ev.finalized_by END,
    finalized_at=CASE WHEN p_target_status='Finalized' THEN transaction_timestamp() ELSE ev.finalized_at END,
    returned_by=CASE WHEN p_target_status='Returned' THEN v_actor.id ELSE ev.returned_by END,
    returned_at=CASE WHEN p_target_status='Returned' THEN transaction_timestamp() ELSE ev.returned_at END
  WHERE ev.id=v_current.id AND ev.workspace_id=v_workspace AND ev.revision=p_expected_revision
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.employee_evaluation_activity
    (workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
  VALUES (v_workspace,'REVIEW','evaluation',v_updated.id::text,
    'Evaluation moved '||v_current.status||' → '||v_updated.status,v_user,
    jsonb_build_object('fromStatus',v_current.status,'toStatus',v_updated.status,'period',v_updated.period,'revision',v_updated.revision));
  RETURN to_jsonb(v_updated);
END;
$function$
;
-- WS02D_B3_SOURCE_END:employee_evaluation_review_transition
-- WS02D_B3_SOURCE_BEGIN:employee_evaluation_save
CREATE OR REPLACE FUNCTION public.employee_evaluation_save(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid(); w uuid; actor public.employee_evaluation_employees%ROWTYPE; target public.employee_evaluation_employees%ROWTYPE;
 cur public.employee_evaluation_evaluations%ROWTYPE; saved public.employee_evaluation_evaluations%ROWTYPE;
 s public.employee_evaluation_settings%ROWTYPE; eid uuid; tid uuid; evaluator uuid; rev bigint;
 st text; period_name text; ratings jsonb; k text; x numeric; score numeric:=0; total numeric:=0;
 weights integer[]:=ARRAY[10,10,10,10,5,5,5,5,5,5,5,5,5,8,7]; i integer;
 comments_text text; strengths_text text; improvements_text text; recommendation_text text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF u IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=w AND user_id=u AND active)
 OR NOT public.has_module_access('employee-eval',u) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.employee_evaluation_employees WHERE workspace_id=w AND auth_user_id=u AND active;
 IF NOT FOUND OR actor.role NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EVALUATOR_DENIED' USING ERRCODE='42501'; END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 BEGIN
 tid:=(p_input->>'employeeId')::uuid; evaluator:=(p_input->>'evaluatorId')::uuid;
 eid:=nullif(p_input->>'id','')::uuid; rev:=nullif(p_input->>'revision','')::bigint;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_IDENTIFIER' USING ERRCODE='22023'; END;
 IF tid IS NULL OR evaluator IS DISTINCT FROM actor.id OR tid=actor.id THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TARGET' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.employee_evaluation_employees WHERE id=tid AND workspace_id=w AND active;
 IF NOT FOUND OR (actor.role='supervisor' AND target.supervisor_id IS DISTINCT FROM actor.id) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_TARGET_DENIED' USING ERRCODE='42501'; END IF;
 st:=p_input->>'status'; period_name:=btrim(coalesce(p_input->>'period',''));ratings:=coalesce(p_input->'ratings','{}'::jsonb);
 comments_text:=coalesce(p_input->>'comments','');strengths_text:=coalesce(p_input->>'strengths','');
 improvements_text:=coalesce(p_input->>'improvements','');recommendation_text:=coalesce(p_input->>'recommendation','');
 IF st IS NULL OR st NOT IN ('Draft','Submitted') OR length(period_name) NOT BETWEEN 1 AND 100 OR jsonb_typeof(ratings)<>'object'
 OR length(comments_text)>10000 OR length(strengths_text)>10000 OR length(improvements_text)>10000
 OR length(recommendation_text)>100 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(ratings) LOOP
 IF k !~ '^c(1[0-5]|[1-9])$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF; END LOOP;
 FOR i IN 1..15 LOOP
 k:='c'||i::text;
 IF ratings ? k THEN
 IF jsonb_typeof(ratings->k)<>'number' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF;
 x:=(ratings->>k)::numeric;
 IF x NOT IN (1,2,3,4,5) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_RATING' USING ERRCODE='22023'; END IF;
 score:=score+x*weights[i];total:=total+weights[i];
 ELSIF st='Submitted' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_RATINGS_INCOMPLETE' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF st='Submitted' AND (length(btrim(comments_text))<20 OR length(btrim(strengths_text))<10 OR length(btrim(improvements_text))<10
 OR recommendation_text NOT IN ('Promote','Retain','Develop','Monitor','Action Required')) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_SUBMISSION_INCOMPLETE' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.employee_evaluation_settings WHERE workspace_id=w FOR SHARE;
 IF NOT FOUND OR s.active_period<>period_name THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_PERIOD_DENIED' USING ERRCODE='22023'; END IF;
 IF eid IS NULL THEN
 IF s.evaluation_window<>'Open' OR rev IS NOT NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_WINDOW_OR_REVISION_DENIED' USING ERRCODE='22023'; END IF;
 INSERT INTO public.employee_evaluation_evaluations(workspace_id,employee_id,evaluator_id,period,ratings,comments,strengths,improvements,recommendation,overall_score,status,submitted_at)
 VALUES(w,target.id,actor.id,period_name,ratings,comments_text,strengths_text,improvements_text,recommendation_text,
 CASE WHEN total>0 THEN round(score/total,2) ELSE 0 END,st,CASE WHEN st='Submitted' THEN transaction_timestamp() END)
 RETURNING * INTO saved;
 ELSE
 IF s.evaluation_window NOT IN ('Open','Grace Period') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_WINDOW_CLOSED' USING ERRCODE='22023'; END IF;
 SELECT * INTO cur FROM public.employee_evaluation_evaluations WHERE id=eid AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF rev IS NULL OR rev<>cur.revision THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF cur.evaluator_id<>actor.id OR cur.employee_id<>target.id OR cur.period<>period_name OR cur.status NOT IN ('Draft','Returned')
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EDIT_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.employee_evaluation_evaluations SET ratings=p_input->'ratings',comments=comments_text,strengths=strengths_text,
 improvements=improvements_text,recommendation=recommendation_text,
 overall_score=CASE WHEN total>0 THEN round(score/total,2) ELSE 0 END,status=st,revision=revision+1,
 updated_at=transaction_timestamp(),submitted_at=CASE WHEN st='Submitted' THEN transaction_timestamp() END
 WHERE id=eid AND workspace_id=w AND revision=rev RETURNING * INTO saved;
 END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(w,CASE WHEN st='Submitted' THEN 'SUBMIT' WHEN eid IS NULL THEN 'CREATE' ELSE 'UPDATE' END,'evaluation',
 saved.id::text,'Evaluation saved ('||st||')',u,jsonb_build_object('period',period_name,'revision',saved.revision,'status',st));
 RETURN to_jsonb(saved);
END; $function$
;
-- WS02D_B3_SOURCE_END:employee_evaluation_save
-- WS02D_B3_SOURCE_BEGIN:employee_evaluation_update_employee
CREATE OR REPLACE FUNCTION public.employee_evaluation_update_employee(p_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;actor public.employee_evaluation_employees%ROWTYPE;
 old_row public.employee_evaluation_employees%ROWTYPE;new_row public.employee_evaluation_employees%ROWTYPE;
 supervisor uuid;key_name text;revision_expected bigint;new_role text;new_active boolean;
 code_name text;employee_name text;email_address text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF u IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=w AND user_id=u AND active)
 OR NOT public.has_module_access('employee-eval',u) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.employee_evaluation_employees WHERE workspace_id=w AND auth_user_id=u AND active;
 IF NOT FOUND OR actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR jsonb_typeof(p_patch->'revision')<>'number'
 OR (p_patch->>'revision') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 FOR key_name IN SELECT jsonb_object_keys(p_patch) LOOP
 IF key_name NOT IN ('revision','employeeCode','name','email','jobTitle','department','supervisorId','role','active')
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_FORBIDDEN_FIELD' USING ERRCODE='22023'; END IF; END LOOP;
 revision_expected:=(p_patch->>'revision')::bigint;
 SELECT * INTO old_row FROM public.employee_evaluation_employees WHERE id=p_id AND workspace_id=w FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_EMPLOYEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_row.revision<>revision_expected THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF (p_patch ? 'employeeCode' AND jsonb_typeof(p_patch->'employeeCode')<>'string')
 OR (p_patch ? 'name' AND jsonb_typeof(p_patch->'name')<>'string')
 OR (p_patch ? 'email' AND jsonb_typeof(p_patch->'email')<>'string')
 OR (p_patch ? 'role' AND jsonb_typeof(p_patch->'role')<>'string')
 OR (p_patch ? 'active' AND jsonb_typeof(p_patch->'active')<>'boolean')
 OR (p_patch ? 'jobTitle' AND jsonb_typeof(p_patch->'jobTitle') NOT IN ('string','null'))
 OR (p_patch ? 'department' AND jsonb_typeof(p_patch->'department') NOT IN ('string','null'))
 OR (p_patch ? 'supervisorId' AND jsonb_typeof(p_patch->'supervisorId') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_TYPES' USING ERRCODE='22023'; END IF;
 code_name:=CASE WHEN p_patch ? 'employeeCode' THEN btrim(p_patch->>'employeeCode') ELSE old_row.employee_code END;
 employee_name:=CASE WHEN p_patch ? 'name' THEN btrim(p_patch->>'name') ELSE old_row.name END;
 email_address:=CASE WHEN p_patch ? 'email' THEN lower(btrim(p_patch->>'email')) ELSE old_row.email END;
 new_role:=CASE WHEN p_patch ? 'role' THEN p_patch->>'role' ELSE old_row.role END;
 new_active:=CASE WHEN p_patch ? 'active' THEN (p_patch->>'active')::boolean ELSE old_row.active END;
 IF length(code_name) NOT BETWEEN 1 AND 80 OR length(employee_name) NOT BETWEEN 1 AND 200
 OR length(email_address) NOT BETWEEN 3 AND 254 OR email_address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR new_role NOT IN ('admin','supervisor','employee') THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_EMPLOYEE' USING ERRCODE='22023'; END IF;
 IF old_row.auth_user_id IS NOT NULL AND (code_name IS DISTINCT FROM old_row.employee_code OR
 email_address IS DISTINCT FROM old_row.email OR new_role IS DISTINCT FROM old_row.role OR
 new_active IS DISTINCT FROM old_row.active) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_LINKED_IDENTITY_PROTECTED' USING ERRCODE='42501'; END IF;
 IF old_row.id=actor.id AND (new_role<>'admin' OR NOT new_active) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_SELF_ADMIN_PROTECTED' USING ERRCODE='42501'; END IF;
 IF p_patch ? 'supervisorId' THEN
 BEGIN supervisor:=nullif(p_patch->>'supervisorId','')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END;
 ELSE supervisor:=old_row.supervisor_id; END IF;
 IF supervisor=p_id THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SELF_SUPERVISION' USING ERRCODE='22023'; END IF;
 IF supervisor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employee_evaluation_employees
 WHERE id=supervisor AND workspace_id=w AND active AND role IN ('admin','supervisor')) THEN
 RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SUPERVISOR' USING ERRCODE='22023'; END IF;
 IF supervisor IS NOT NULL AND EXISTS(
 WITH RECURSIVE reports AS (
 SELECT id,supervisor_id,ARRAY[id] visited FROM public.employee_evaluation_employees WHERE id=p_id AND workspace_id=w
 UNION ALL SELECT child.id,child.supervisor_id,reports.visited||child.id
 FROM public.employee_evaluation_employees child JOIN reports ON child.supervisor_id=reports.id
 WHERE child.workspace_id=w AND NOT child.id=ANY(reports.visited))
 SELECT 1 FROM reports WHERE id=supervisor)
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SUPERVISOR_CYCLE' USING ERRCODE='22023'; END IF;
 IF (new_role NOT IN ('admin','supervisor') OR NOT new_active) AND EXISTS(
 SELECT 1 FROM public.employee_evaluation_employees WHERE workspace_id=w AND supervisor_id=p_id AND active)
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_DIRECT_REPORTS_PRESENT' USING ERRCODE='22023'; END IF;
 UPDATE public.employee_evaluation_employees e SET employee_code=code_name,name=employee_name,email=email_address,
 job_title=CASE WHEN p_patch ? 'jobTitle' THEN nullif(btrim(p_patch->>'jobTitle'),'') ELSE old_row.job_title END,
 department=CASE WHEN p_patch ? 'department' THEN nullif(btrim(p_patch->>'department'),'') ELSE old_row.department END,
 supervisor_id=supervisor,role=new_role,active=new_active,revision=e.revision+1,updated_at=transaction_timestamp()
 WHERE e.id=p_id AND e.workspace_id=w AND e.revision=revision_expected RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(w,'UPDATE','employee',p_id::text,'Employee record updated',u,
 jsonb_build_object('previousRevision',old_row.revision,'revision',new_row.revision,
 'roleChanged',old_row.role IS DISTINCT FROM new_row.role,
 'supervisorChanged',old_row.supervisor_id IS DISTINCT FROM new_row.supervisor_id,
 'activeChanged',old_row.active IS DISTINCT FROM new_row.active));
 RETURN to_jsonb(new_row)-'auth_user_id';
END; $function$
;
-- WS02D_B3_SOURCE_END:employee_evaluation_update_employee
-- WS02D_B3_SOURCE_BEGIN:employee_evaluation_update_settings
CREATE OR REPLACE FUNCTION public.employee_evaluation_update_settings(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid:=auth.uid(); v_workspace uuid; v_actor public.employee_evaluation_employees%ROWTYPE;
 v_current public.employee_evaluation_settings%ROWTYPE; v_updated public.employee_evaluation_settings%ROWTYPE; v_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF v_user IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 v_workspace:=public.current_workspace_id(v_user);
 IF v_workspace IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=v_workspace AND wm.user_id=v_user AND wm.active)
   OR NOT public.has_module_access('employee-eval',v_user) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.employee_evaluation_employees e WHERE e.workspace_id=v_workspace AND e.auth_user_id=v_user AND e.active;
 IF NOT FOUND OR v_actor.role<>'admin' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SETTINGS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR jsonb_typeof(p_patch->'revision')<>'number'
 OR (p_patch->>'revision') !~ '^[1-9][0-9]*$' THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SETTINGS' USING ERRCODE='22023'; END IF;
 FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
  IF v_key NOT IN ('activePeriod','evaluationWindow','windowOpenDate','windowCloseDate','gracePeriodDays','revision')
  THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_SETTINGS_FIELD' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT * INTO v_current FROM public.employee_evaluation_settings s WHERE s.workspace_id=v_workspace FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_SETTINGS_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_current.revision<>(p_patch->>'revision')::bigint THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF p_patch ? 'activePeriod' AND (jsonb_typeof(p_patch->'activePeriod')<>'string'
 OR length(btrim(p_patch->>'activePeriod')) NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_PERIOD' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'evaluationWindow' AND (jsonb_typeof(p_patch->'evaluationWindow')<>'string'
 OR p_patch->>'evaluationWindow' NOT IN ('Open','Grace Period','Closed')) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_WINDOW' USING ERRCODE='22023'; END IF;
 IF p_patch ? 'gracePeriodDays' AND (jsonb_typeof(p_patch->'gracePeriodDays')<>'number'
 OR (p_patch->>'gracePeriodDays') !~ '^[0-9]+$' OR length(p_patch->>'gracePeriodDays')>5
 OR (p_patch->>'gracePeriodDays')::integer>3650) THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_GRACE_DAYS' USING ERRCODE='22023'; END IF;
 IF (p_patch ? 'windowOpenDate' AND jsonb_typeof(p_patch->'windowOpenDate') NOT IN ('string','null'))
 OR (p_patch ? 'windowCloseDate' AND jsonb_typeof(p_patch->'windowCloseDate') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_DATES' USING ERRCODE='22023'; END IF;
 UPDATE public.employee_evaluation_settings s SET
 active_period=CASE WHEN p_patch ? 'activePeriod' THEN btrim(p_patch->>'activePeriod') ELSE s.active_period END,
 evaluation_window=CASE WHEN p_patch ? 'evaluationWindow' THEN p_patch->>'evaluationWindow' ELSE s.evaluation_window END,
 window_open_date=CASE WHEN p_patch ? 'windowOpenDate' THEN (p_patch->>'windowOpenDate')::timestamptz ELSE s.window_open_date END,
 window_close_date=CASE WHEN p_patch ? 'windowCloseDate' THEN (p_patch->>'windowCloseDate')::timestamptz ELSE s.window_close_date END,
 grace_period_days=CASE WHEN p_patch ? 'gracePeriodDays' THEN (p_patch->>'gracePeriodDays')::integer ELSE s.grace_period_days END,
 revision=s.revision+1,updated_at=transaction_timestamp()
 WHERE s.workspace_id=v_workspace AND s.revision=v_current.revision RETURNING * INTO v_updated;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF v_updated.window_open_date IS NOT NULL AND v_updated.window_close_date IS NOT NULL
 AND v_updated.window_close_date<v_updated.window_open_date THEN RAISE EXCEPTION 'EMPLOYEE_EVAL_INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.employee_evaluation_activity(workspace_id,action,entity_type,entity_id,summary,actor_user_id,metadata)
 VALUES(v_workspace,'SETTINGS','settings',v_workspace::text,'Evaluation settings updated',v_user,
 jsonb_build_object('revision',v_updated.revision,'evaluationWindow',v_updated.evaluation_window,'activePeriod',v_updated.active_period));
 RETURN to_jsonb(v_updated);
END; $function$
;
-- WS02D_B3_SOURCE_END:employee_evaluation_update_settings
-- WS02D_B3_SOURCE_BEGIN:import_fueltrack_activity_backup
CREATE OR REPLACE FUNCTION public.import_fueltrack_activity_backup(p_events jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; role_name text; item jsonb; eid text; at_time timestamptz; inserted_count integer:=0; prof public.profiles%rowtype;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if public.module_role_for('fueltrack-plus',caller)<>'Admin' then raise exception 'activity import requires FuelTrack+ Admin' using errcode='42501'; end if;
  if p_events is null or jsonb_typeof(p_events)<>'array' then raise exception 'activity import payload must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_events)>10000 then raise exception 'activity import exceeds 10000 events' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); select * into prof from public.profiles p where p.id=caller;
  for item in select * from jsonb_array_elements(p_events) loop
    eid:=coalesce(nullif(item->>'id',''),'backup-'||encode(digest(item::text,'sha256'),'hex'));
    begin at_time:=coalesce(nullif(item->>'at','')::timestamptz,now()); exception when others then at_time:=now(); end;
    insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload,occurred_at)
    values(ws,'fueltrack-plus',eid,
      case when item->>'type' in ('submit','review','issue','system') then item->>'type' else 'system' end,
      left(coalesce(nullif(item->>'title',''),'Imported activity'),240),left(coalesce(item->>'message',''),4000),nullif(item->>'requestId',''),caller,
      coalesce(nullif(item->>'actorEmail',''),prof.email),coalesce(nullif(item->>'actor',''),prof.display_name,prof.email),coalesce(nullif(item->>'actorRole',''),'Imported'),
      coalesce(item->'payload','{}'::jsonb)||jsonb_build_object('backupImported',true,'importedBy',caller,'originalActorUserId',item->>'actorUserId'),at_time)
    on conflict(workspace_id,module_id,event_id) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return inserted_count;
end;
$function$
;
-- WS02D_B3_SOURCE_END:import_fueltrack_activity_backup
-- WS02D_B3_SOURCE_BEGIN:order_intake_archive
CREATE OR REPLACE FUNCTION public.order_intake_archive(p_id uuid, p_expected_revision integer)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders WHERE id=p_id AND workspace_id=w AND archived=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.order_intake_orders o SET archived=true,archived_at=transaction_timestamp(),revision=o.revision+1,
 updated_at=transaction_timestamp() WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,'ARCHIVED',
 'Order archived (revision '||new_order.revision||', prior status '||old_order.status||')',u);
 RETURN new_order;
END $function$
;
-- WS02D_B3_SOURCE_END:order_intake_archive
-- WS02D_B3_SOURCE_BEGIN:order_intake_create
CREATE OR REPLACE FUNCTION public.order_intake_create(p_order jsonb)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_unknown_key text;
  v_po_number text;
  v_client_name text;
  v_status text;
  v_company text;
  v_industry text;
  v_po_date date;
  v_received date;
  v_delivery date;
  v_amount numeric(18,2);
  v_rate numeric(8,4);
  v_expenses numeric(18,2);
  v_exclusive numeric(18,2);
  v_vat numeric(18,2);
  v_profit numeric(18,2);
  v_created public.order_intake_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  IF v_user IS NULL OR NOT public.is_platform_admin(v_user)
      OR NOT public.has_module_access('order-intake', v_user) THEN
    RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  v_workspace := public.current_workspace_id(v_user);
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' OR pg_column_size(p_order) > 16384 THEN
    RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  SELECT key INTO v_unknown_key FROM jsonb_object_keys(p_order) AS key
  WHERE key NOT IN ('poNumber','clientName','poDate','dateReceived','deliveryDate',
      'poAmount','vatRate','procurementExpenses','currency','status','company','industry',
      'accountManager','buyerInCharge','endUserInCharge','notes') LIMIT 1;
  IF v_unknown_key IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_INTAKE_UNKNOWN_FIELD' USING ERRCODE='22023';
  END IF;
  v_po_number := btrim(coalesce(p_order->>'poNumber',''));
  v_client_name := btrim(coalesce(p_order->>'clientName',''));
  v_status := btrim(coalesce(p_order->>'status',''));
  v_company := btrim(coalesce(p_order->>'company',''));
  v_industry := btrim(coalesce(p_order->>'industry',''));
  IF length(v_po_number) NOT BETWEEN 1 AND 240 OR length(v_client_name) NOT BETWEEN 1 AND 240
     OR length(v_company) NOT BETWEEN 1 AND 240 OR length(v_industry) NOT BETWEEN 1 AND 240
     OR v_status NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged',
       'Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived',
       'Receiving Report','Delivered','Collected','Closed','Cancelled') THEN
    RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';
  END IF;
  v_po_date := (p_order->>'poDate')::date;
  v_received := (p_order->>'dateReceived')::date;
  v_delivery := (p_order->>'deliveryDate')::date;
  v_amount := (p_order->>'poAmount')::numeric(18,2);
  v_rate := coalesce((p_order->>'vatRate')::numeric(8,4),12);
  v_expenses := coalesce((p_order->>'procurementExpenses')::numeric(18,2),0);
  IF v_po_date IS NULL OR v_received IS NULL OR v_delivery IS NULL
      OR v_delivery < v_po_date OR v_amount IS NULL OR v_amount <= 0
      OR v_rate < 0 OR v_rate IS NULL OR v_expenses < 0 OR v_expenses IS NULL
      OR coalesce(p_order->>'currency','PHP') NOT IN ('PHP','USD','EUR')
      OR length(coalesce(p_order->>'accountManager','')) > 240
      OR length(coalesce(p_order->>'buyerInCharge','')) > 1000
      OR length(coalesce(p_order->>'endUserInCharge','')) > 1000
      OR length(coalesce(p_order->>'notes','')) > 12000 THEN
    RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';
  END IF;
  v_exclusive := round(v_amount / (1 + v_rate / 100), 2);
  v_vat := round(v_amount - v_exclusive, 2);
  v_profit := round(v_exclusive - v_expenses, 2);
  INSERT INTO public.order_intake_orders
      (workspace_id,po_number,client_name,po_date,date_received,delivery_date,currency,
       po_amount,vat_rate,vat_exclusive_amount,vat_amount,procurement_expenses,gross_profit,
       status,company,industry,account_manager,buyer_in_charge,end_user_in_charge,notes,fiscal_year)
  VALUES
      (v_workspace,v_po_number,v_client_name,v_po_date,v_received,v_delivery,
       coalesce(p_order->>'currency','PHP'),v_amount,v_rate,v_exclusive,v_vat,v_expenses,v_profit,
       v_status,v_company,v_industry,coalesce(nullif(btrim(p_order->>'accountManager'),''),'Unassigned'),
       coalesce(btrim(p_order->>'buyerInCharge'),''),coalesce(btrim(p_order->>'endUserInCharge'),''),
       coalesce(btrim(p_order->>'notes'),''),extract(year from v_received)::integer)
  RETURNING * INTO v_created;
  INSERT INTO public.order_intake_activity
      (workspace_id,order_id,po_number,type,message,actor_id)
  VALUES (v_workspace,v_created.id,v_created.po_number,'ORDER_CREATED',
    'Created PO ' || v_created.po_number || '.',v_user);
  RETURN v_created;
END;
$function$
;
-- WS02D_B3_SOURCE_END:order_intake_create
-- WS02D_B3_SOURCE_BEGIN:order_intake_create_idempotent
CREATE OR REPLACE FUNCTION public.order_intake_create_idempotent(p_order jsonb, p_request_id uuid)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare actor uuid:=auth.uid();ws uuid;recorded record;created public.order_intake_orders%rowtype;digest text;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 if actor is null or not public.is_platform_admin(actor) or not public.has_module_access('order-intake',actor) then raise exception 'ORDER_INTAKE_ACCESS_DENIED' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_request_id is null or p_order is null or jsonb_typeof(p_order)<>'object' then raise exception 'ORDER_INTAKE_INVALID_IDEMPOTENCY' using errcode='22023';end if;
 digest:=md5(p_order::text);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ws::text||':'||p_request_id::text,0));
 select i.actor_id,i.payload_hash,i.order_id into recorded from public.order_intake_create_idempotency i where i.workspace_id=ws and i.request_id=p_request_id;
 if found then
  if recorded.actor_id<>actor or recorded.payload_hash<>digest then raise exception 'ORDER_INTAKE_IDEMPOTENCY_KEY_REUSED' using errcode='22023';end if;
  select * into created from public.order_intake_orders o where o.workspace_id=ws and o.id=recorded.order_id;
  if not found then raise exception 'ORDER_INTAKE_IDEMPOTENCY_RECORD_MISSING' using errcode='22023';end if;
  return created;
 end if;
 created:=public.order_intake_create(p_order);
 insert into public.order_intake_create_idempotency(workspace_id,request_id,actor_id,payload_hash,order_id) values(ws,p_request_id,actor,digest,created.id);
 return created;
end;$function$
;
-- WS02D_B3_SOURCE_END:order_intake_create_idempotent
-- WS02D_B3_SOURCE_BEGIN:order_intake_qa_archive_once
CREATE OR REPLACE FUNCTION public.order_intake_qa_archive_once()
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_workspace uuid; v_order public.order_intake_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor)
 OR NOT public.has_module_access('order-intake',v_actor)
 THEN RAISE EXCEPTION 'M19514_QA_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_workspace := public.current_workspace_id(v_actor);
 IF v_workspace IS NULL
 THEN RAISE EXCEPTION 'M19514_QA_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(19514,20261020);
 UPDATE public.order_intake_orders
 SET archived=true,archived_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1
 WHERE workspace_id=v_workspace AND po_number='M19514-QA-ONLY-20261020' AND archived=false
 RETURNING * INTO v_order;
 IF NOT FOUND
 THEN RAISE EXCEPTION 'M19514_QA_ARCHIVE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.order_intake_activity
 (workspace_id,order_id,po_number,type,message,actor_id)
 VALUES (v_workspace,v_order.id,v_order.po_number,'ORDER_ARCHIVED',
 'Archived approved M195.14 QA-only purchase order.',v_actor);
 RETURN v_order;
END; $function$
;
-- WS02D_B3_SOURCE_END:order_intake_qa_archive_once
-- WS02D_B3_SOURCE_BEGIN:order_intake_restore
CREATE OR REPLACE FUNCTION public.order_intake_restore(p_id uuid, p_expected_revision integer)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders WHERE id=p_id AND workspace_id=w AND archived=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.order_intake_orders o SET archived=false,archived_at=NULL,revision=o.revision+1,
 updated_at=transaction_timestamp() WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,'RESTORED','Order restored (revision '||new_order.revision||')',u);
 RETURN new_order;
END $function$
;
-- WS02D_B3_SOURCE_END:order_intake_restore
-- WS02D_B3_SOURCE_BEGIN:order_intake_update_details
CREATE OR REPLACE FUNCTION public.order_intake_update_details(p_id uuid, p_patch jsonb, p_expected_revision integer)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_actor uuid:=auth.uid();v_workspace uuid;v_old public.order_intake_orders%ROWTYPE;v_updated public.order_intake_orders%ROWTYPE;v_payload jsonb;v_unknown text;v_amount numeric;v_rate numeric;v_expenses numeric;v_exclusive numeric;v_vat numeric;v_profit numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) OR NOT public.has_module_access('order-intake',v_actor) THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501';END IF;
v_workspace:=public.current_workspace_id(v_actor);
IF v_workspace IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=v_workspace AND user_id=v_actor AND active) THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501';END IF;
IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR pg_column_size(p_patch)>16384 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_INPUT' USING ERRCODE='22023';END IF;
SELECT key INTO v_unknown FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN ('poNumber','clientName','poDate','dateReceived','deliveryDate','currency','poAmount','vatRate','procurementExpenses','status','company','industry','accountManager','buyerInCharge','endUserInCharge','notes') LIMIT 1;
IF v_unknown IS NOT NULL THEN RAISE EXCEPTION 'ORDER_INTAKE_UNKNOWN_FIELD' USING ERRCODE='22023';END IF;
SELECT * INTO v_old FROM public.order_intake_orders WHERE workspace_id=v_workspace AND id=p_id AND archived=false FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002';END IF;
IF v_old.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
v_payload:=jsonb_build_object('poNumber',v_old.po_number,'clientName',v_old.client_name,'poDate',v_old.po_date,'dateReceived',v_old.date_received,'deliveryDate',v_old.delivery_date,'currency',v_old.currency,'poAmount',v_old.po_amount,'vatRate',v_old.vat_rate,'procurementExpenses',v_old.procurement_expenses,'status',v_old.status,'company',v_old.company,'industry',v_old.industry,'accountManager',v_old.account_manager,'buyerInCharge',v_old.buyer_in_charge,'endUserInCharge',v_old.end_user_in_charge,'notes',v_old.notes)||p_patch;
IF length(btrim(coalesce(v_payload->>'poNumber',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'clientName',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'company',''))) NOT BETWEEN 1 AND 240
OR length(btrim(coalesce(v_payload->>'industry',''))) NOT BETWEEN 1 AND 240
OR v_payload->>'status' NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged','Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived','Receiving Report','Delivered','Collected','Closed','Cancelled')
OR v_payload->>'currency' NOT IN ('PHP','USD','EUR')
OR length(coalesce(v_payload->>'accountManager',''))>240
OR length(coalesce(v_payload->>'buyerInCharge',''))>1000
OR length(coalesce(v_payload->>'endUserInCharge',''))>1000
OR length(coalesce(v_payload->>'notes',''))>12000
OR (v_payload->>'deliveryDate')::date < (v_payload->>'poDate')::date
OR (v_payload->>'poDate') IS NULL OR (v_payload->>'dateReceived') IS NULL OR (v_payload->>'deliveryDate') IS NULL
THEN RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';END IF;
v_amount:=(v_payload->>'poAmount')::numeric;v_rate:=(v_payload->>'vatRate')::numeric;v_expenses:=(v_payload->>'procurementExpenses')::numeric;
IF v_amount IS NULL OR v_amount<=0 OR v_amount>9999999999999999 OR v_rate IS NULL OR v_rate<0 OR v_rate>9999 OR v_expenses IS NULL OR v_expenses<0 OR v_expenses>9999999999999999 THEN RAISE EXCEPTION 'ORDER_INTAKE_VALIDATION_FAILED' USING ERRCODE='22023';END IF;
v_exclusive:=round(v_amount/(1+v_rate/100),2);v_vat:=round(v_amount-v_exclusive,2);v_profit:=round(v_exclusive-v_expenses,2);
UPDATE public.order_intake_orders SET po_number=btrim(v_payload->>'poNumber'),
client_name=btrim(v_payload->>'clientName'),
po_date=(v_payload->>'poDate')::date,
date_received=(v_payload->>'dateReceived')::date,
delivery_date=(v_payload->>'deliveryDate')::date,
currency=v_payload->>'currency',
po_amount=(v_payload->>'poAmount')::numeric,
vat_rate=(v_payload->>'vatRate')::numeric,
procurement_expenses=(v_payload->>'procurementExpenses')::numeric,
status=v_payload->>'status',
company=btrim(v_payload->>'company'),
industry=btrim(v_payload->>'industry'),
account_manager=coalesce(nullif(btrim(v_payload->>'accountManager'),''),'Unassigned'),
buyer_in_charge=btrim(v_payload->>'buyerInCharge'),
end_user_in_charge=btrim(v_payload->>'endUserInCharge'),
notes=btrim(v_payload->>'notes'),
fiscal_year=extract(year from (v_payload->>'dateReceived')::date)::integer,
vat_exclusive_amount=v_exclusive,
vat_amount=v_vat,
gross_profit=v_profit,
status_updated_at=CASE WHEN v_old.status IS DISTINCT FROM v_payload->>'status' THEN transaction_timestamp() ELSE v_old.status_updated_at END,
revision=revision+1,
updated_at=transaction_timestamp()
WHERE workspace_id=v_workspace AND id=p_id AND revision=p_expected_revision AND archived=false RETURNING * INTO v_updated;
IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
VALUES(v_workspace,p_id,v_updated.po_number,'ORDER_UPDATED','Updated PO '||v_updated.po_number||' (revision '||v_updated.revision||')',v_actor);
RETURN v_updated;
END $function$
;
-- WS02D_B3_SOURCE_END:order_intake_update_details
-- WS02D_B3_SOURCE_BEGIN:order_intake_update_status
CREATE OR REPLACE FUNCTION public.order_intake_update_status(p_id uuid, p_status text, p_expected_revision integer)
 RETURNS order_intake_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;old_order public.order_intake_orders%ROWTYPE;new_order public.order_intake_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 IF u IS NULL OR NOT public.is_platform_admin(u) OR NOT public.has_module_access('order-intake',u)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(u);
 IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w AND wm.user_id=u AND wm.active)
 THEN RAISE EXCEPTION 'ORDER_INTAKE_WORKSPACE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR p_status IS NULL
 OR p_status NOT IN ('Working on it','Processed','PO Issued to Supplier','PO Acknowledged',
 'Waiting for Delivery','In Transit','Customs Clearance','Delayed','Arrived',
 'Receiving Report','Delivered','Collected','Closed','Cancelled')
 THEN RAISE EXCEPTION 'ORDER_INTAKE_INVALID_STATUS' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_order FROM public.order_intake_orders
 WHERE id=p_id AND workspace_id=w AND archived=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF old_order.revision<>p_expected_revision THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF old_order.status IN ('Closed','Cancelled') AND p_status IS DISTINCT FROM old_order.status
 THEN RAISE EXCEPTION 'ORDER_INTAKE_TERMINAL_STATUS' USING ERRCODE='22023'; END IF;
 IF old_order.status=p_status THEN RETURN old_order; END IF;
 UPDATE public.order_intake_orders o SET status=p_status,revision=o.revision+1,
 status_updated_at=transaction_timestamp(),updated_at=transaction_timestamp()
 WHERE o.id=p_id AND o.workspace_id=w AND o.revision=p_expected_revision
 RETURNING * INTO new_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_INTAKE_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,'STATUS_UPDATED',
 'Status changed from '||old_order.status||' to '||p_status||' (revision '||new_order.revision||')',u);
 RETURN new_order;
END $function$
;
-- WS02D_B3_SOURCE_END:order_intake_update_status
-- WS02D_B3_SOURCE_BEGIN:timetracker_commit_attendance_raw_gps03
CREATE OR REPLACE FUNCTION public.timetracker_commit_attendance_raw_gps03(p_action text, p_record_id text, p_location text, p_department text, p_geo jsonb, p_work_note text, p_attendance_policy jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller uuid := auth.uid();
  ws uuid;
  actor_id text;
  actor_name text;
  owner text := '*';
  normalized_action text := lower(trim(coalesce(p_action,'')));
  current_value text;
  current_revision bigint := 0;
  current_state jsonb;
  records jsonb;
  active_count integer := 0;
  active_record jsonb;
  active_id text;
  committed_at timestamptz := clock_timestamp();
  committed_at_text text;
  record_id text;
  note_text text := nullif(trim(coalesce(p_work_note,'')),'');
  new_record jsonb;
  updated_records jsonb;
  updated_state jsonb;
  result_revision bigint;
  result_updated_at timestamptz;
  visible_value text;
  backup_revision bigint;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

  if caller is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if not public.has_module_access('time-tracker',caller) then
    raise exception 'module access denied' using errcode='42501';
  end if;
  if normalized_action not in ('clock-in','clock-out') then
    raise exception 'invalid attendance action' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_location,'')),'') is null or nullif(trim(coalesce(p_department,'')),'') is null then
    raise exception 'location and department are required' using errcode='22023';
  end if;
  if p_geo is null or jsonb_typeof(p_geo)<>'object' or coalesce(p_geo->>'status','')<>'captured' then
    raise exception 'valid captured GPS evidence is required' using errcode='22023';
  end if;
  if note_text is not null and length(note_text)>500 then
    raise exception 'work note exceeds maximum length' using errcode='22023';
  end if;

  ws := public.current_workspace_id(caller);
  if ws is null then
    raise exception 'workspace membership is required' using errcode='42501';
  end if;
  actor_id := 'cloud:'||caller::text;
  select coalesce(p.display_name,p.email,'Authenticated User') into actor_name
    from public.profiles p where p.id=caller;

  -- Permanent concurrency boundary: this transaction-scoped advisory lock cannot
  -- survive a failed request, tab close, refresh, navigation, or authentication
  -- change. It is automatically released by PostgreSQL at transaction end.
  perform pg_advisory_xact_lock(hashtextextended(ws::text||':time-tracker:attendance:'||caller::text,0));

  select e.value,e.revision into current_value,current_revision
    from public.module_state_entries e
    where e.workspace_id=ws
      and e.module_id='time-tracker'
      and e.state_key='timetracker.attendance.v1'
      and e.scope='shared'
      and e.owner_key=owner
    for update;

  if current_value is null then
    current_state := jsonb_build_object('version',1,'records','[]'::jsonb,'selection',jsonb_build_object('location','','department',''));
    current_revision := 0;
  else
    begin
      current_state := current_value::jsonb;
    exception when others then
      raise exception 'authoritative attendance state is malformed' using errcode='22023';
    end;
  end if;

  if jsonb_typeof(current_state)<>'object' or jsonb_typeof(coalesce(current_state->'records','[]'::jsonb))<>'array' then
    raise exception 'authoritative attendance state has an invalid shape' using errcode='22023';
  end if;
  records := coalesce(current_state->'records','[]'::jsonb);

  select count(*)
    into active_count
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb);
  select x into active_record
    from jsonb_array_elements(records) x
    where x->>'ownerId'=actor_id
      and (x->'clockOut' is null or x->'clockOut'='null'::jsonb)
    limit 1;

  committed_at_text := to_char(committed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if normalized_action='clock-in' then
    if active_count>0 then
      raise exception 'WM_ATTENDANCE_ACTIVE_EXISTS' using errcode='P0001';
    end if;

    record_id := gen_random_uuid()::text;
    new_record := jsonb_build_object(
      'id',record_id,
      'ownerId',actor_id,
      'ownerName',actor_name,
      'clockIn',jsonb_build_object(
        'location',trim(p_location),
        'department',trim(p_department),
        'timestamp',committed_at_text,
        'geo',p_geo
      ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
      'clockOut','null'::jsonb,
      'createdAt',committed_at_text,
      'updatedAt',committed_at_text
    );
    if note_text is not null then new_record := new_record || jsonb_build_object('note',note_text); end if;
    if p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object' then
      new_record := new_record || jsonb_build_object('attendancePolicy',p_attendance_policy);
    end if;
    updated_records := jsonb_build_array(new_record) || records;

  else
    if active_count=0 then
      raise exception 'WM_ATTENDANCE_NO_ACTIVE' using errcode='P0001';
    end if;
    if active_count<>1 then
      raise exception 'authoritative attendance contains multiple active sessions for this account' using errcode='22023';
    end if;
    active_id := active_record->>'id';
    if nullif(trim(coalesce(p_record_id,'')),'') is not null and active_id<>trim(p_record_id) then
      raise exception 'WM_ATTENDANCE_SESSION_CHANGED' using errcode='P0001';
    end if;

    select coalesce(jsonb_agg(
      case when elem->>'id'=active_id then
        (
          elem
          || jsonb_build_object(
            'clockOut', jsonb_build_object(
              'location',trim(p_location),
              'department',trim(p_department),
              'timestamp',committed_at_text,
              'geo',p_geo
            ) || case when note_text is not null then jsonb_build_object('workNote',note_text) else '{}'::jsonb end,
            'updatedAt',committed_at_text
          )
          || case
               when note_text is not null then jsonb_build_object(
                 'note', concat_ws(' • ',nullif(trim(coalesce(elem->>'note','')),''),note_text)
               ) else '{}'::jsonb
             end
          || case
               when p_attendance_policy is not null and jsonb_typeof(p_attendance_policy)='object'
                 then jsonb_build_object('attendancePolicy',p_attendance_policy)
               else '{}'::jsonb
             end
        )
      else elem end
      order by ord
    ),'[]'::jsonb)
    into updated_records
    from jsonb_array_elements(records) with ordinality a(elem,ord);

    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  updated_state := jsonb_set(current_state,'{records}',updated_records,true);
  updated_state := jsonb_set(updated_state,'{selection}',jsonb_build_object('location','','department',''),true);

  if not public.module_state_invariants_valid('time-tracker','timetracker.attendance.v1',updated_state::text) then
    raise exception 'attendance transaction violates data integrity invariants' using errcode='22023';
  end if;

  -- Maintain the rolling recovery copy in the same transaction. It never becomes
  -- runtime authority automatically, but remains available for explicit recovery.
  if current_value is not null then
    insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
    values(ws,'time-tracker','timetracker.attendance.v1.backup','shared','*',current_value,1,caller,now())
    on conflict on constraint module_state_entries_pkey do update
      set value=excluded.value,
          revision=public.module_state_entries.revision+1,
          updated_by=caller,
          updated_at=now()
    returning revision into backup_revision;
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,'time-tracker','timetracker.attendance.v1','shared','*',updated_state::text,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update
    set value=excluded.value,
        revision=public.module_state_entries.revision+1,
        updated_by=caller,
        updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;

  visible_value := public.module_state_visible_value('time-tracker','timetracker.attendance.v1',updated_state::text,caller);
  if normalized_action='clock-in' then
    -- new_record already points at the committed server-created record.
    null;
  else
    select elem into new_record from jsonb_array_elements(updated_records) elem where elem->>'id'=active_id limit 1;
  end if;

  return jsonb_build_object(
    'state_key','timetracker.attendance.v1',
    'action',normalized_action,
    'revision',result_revision,
    'updated_at',result_updated_at,
    'value',visible_value,
    'record',new_record,
    'committed_at',committed_at_text
  );
end;
$function$
;
-- WS02D_B3_SOURCE_END:timetracker_commit_attendance_raw_gps03
-- WS02D_B3_SOURCE_BEGIN:tradelink_asset_write
CREATE OR REPLACE FUNCTION public.tradelink_asset_write(p_vendor_id text, p_kind text, p_image_data text, p_expected_revision bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE u uuid:=auth.uid();w uuid;r bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

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
END $function$
;
-- WS02D_B3_SOURCE_END:tradelink_asset_write
-- WS02D_B3_SOURCE_BEGIN:tradelink_cleanup_fence_activate
CREATE OR REPLACE FUNCTION public.tradelink_cleanup_fence_activate(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(decision text, expires_at timestamp with time zone, deletion_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); ws uuid; state_revision bigint; candidate_created timestamptz; check_result record; fence_expiry timestamptz;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

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
end;$function$
;
-- WS02D_B3_SOURCE_END:tradelink_cleanup_fence_activate
-- WS02D_B3_SOURCE_BEGIN:tradelink_cleanup_fence_release
CREATE OR REPLACE FUNCTION public.tradelink_cleanup_fence_release(p_storage_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();ws uuid;released_count integer;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 if actor is null or not public.has_module_access('tradelink',actor) or not (public.is_platform_admin(actor) or lower(coalesce(public.module_role_for('tradelink',actor),'')) in ('general manager','admin')) then raise exception 'TradeLink administrator authorization required' using errcode='42501';end if;
 ws:=public.current_workspace_id(actor);
 if ws is null or p_storage_key is null or left(p_storage_key,length(ws::text)+1)<>ws::text||'/' then raise exception 'Invalid workspace key' using errcode='22023';end if;
 delete from public.tradelink_cleanup_reference_fences f where f.workspace_id=ws and f.storage_key=p_storage_key;
 get diagnostics released_count=row_count;
 return released_count>0;
end;$function$
;
-- WS02D_B3_SOURCE_END:tradelink_cleanup_fence_release
-- WS02D_B3_SOURCE_BEGIN:tradelink_reconciliation_assess
CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_assess(p_storage_key text)
 RETURNS TABLE(status text, workspace_revision bigint, storage_object_present boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ws uuid; payload jsonb; rev bigint; manifest_valid boolean:=false; reference_found boolean:=false; object_found boolean:=false; result_status text;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

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
end; $function$
;
-- WS02D_B3_SOURCE_END:tradelink_reconciliation_assess
-- WS02D_B3_SOURCE_BEGIN:tradelink_reconciliation_report
CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_report(p_storage_key text, p_attachment_id text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid := auth.uid(); ws uuid;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'edit') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

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
end; $function$
;
-- WS02D_B3_SOURCE_END:tradelink_reconciliation_report
-- WS02D_B3_SOURCE_BEGIN:tradelink_reconciliation_request_cleanup
CREATE OR REPLACE FUNCTION public.tradelink_reconciliation_request_cleanup(p_storage_key text, p_expected_revision bigint)
 RETURNS TABLE(request_id uuid, decision text, observed_revision bigint, deletion_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();ws uuid;guard record;logged_id uuid;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

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
end;$function$
;
-- WS02D_B3_SOURCE_END:tradelink_reconciliation_request_cleanup
-- WS02D_B3_SOURCE_BEGIN:wm_admin_set_application_role
CREATE OR REPLACE FUNCTION public.wm_admin_set_application_role(p_user_id uuid, p_module_id text, p_role text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_admin uuid:=auth.uid(); v_workspace uuid; v_roles text[]; v_row public.module_role_assignments%rowtype;
begin
  IF auth.uid() IS NULL OR NOT private.ws02d_workspace_ceiling(
    public.current_workspace_id(auth.uid()),auth.uid(),'manage') THEN
    RAISE EXCEPTION 'WS02D_B3_WORKSPACE_CEILING_DENIED' USING ERRCODE='42501';
  END IF;

 if v_admin is null or not public.apsyntra_role_is_bootstrap() then
   raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_user_id is null or p_user_id=v_admin or public.is_platform_admin(p_user_id) then
   raise exception 'Cannot change own or protected admin application role' using errcode='42501';
 end if;
 if p_module_id is null or p_role is null or p_enabled is null then
   raise exception 'Invalid application role request' using errcode='22023';
 end if;
 v_workspace:=public.current_workspace_id(v_admin);
 if v_workspace is null or not exists(
   select 1 from public.workspace_members m where m.workspace_id=v_workspace and m.user_id=v_admin and m.active
 ) or not exists(
   select 1 from public.workspace_members m join public.profiles p on p.id=m.user_id
   where m.workspace_id=v_workspace and m.user_id=p_user_id and m.active and p.status='active'
 ) then raise exception 'Administrator and target require active shared workspace' using errcode='42501'; end if;
 v_roles:=case p_module_id
  when 'tradelink' then array['User','Sales Supervisor','General Manager']
  when 'fueltrans' then array['Admin','User','Viewer']
  when 'fund-released-tracker' then array['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']
  when 'order-intake' then array['Admin','User','Viewer']
  when 'tool-traceability' then array['ADMIN','LOGISTICS','USER','VIEWER']
  when 'time-tracker' then array['Employee','OJT','Supervisor','HR','Finance','System Admin','IT Administrator']
  when 'fueltrack-plus' then array['User','Pump Attendant','Admin']
  when 'toolbox-issues' then array['team_leader','secretary','standard']
  when 'material-request-hub' then array['ADMIN','REQUESTOR','APPROVER','WAREHOUSE','VIEWER']
  when 'aps-aims' then array['Administrator','AssetManager','Custodian','Viewer']
  when 'employee-eval' then array['admin','supervisor','employee']
  else null end;
 if v_roles is null or not (p_role=any(v_roles)) then
   raise exception 'Unregistered application or unsupported operational role' using errcode='22023';
 end if;
 if p_module_id='fund-released-tracker' then
   if p_enabled then
     -- Existing FRT function validates the bootstrap admin, writes real module role and financial audit.
     perform public.frt_admin_set_role(v_workspace,p_user_id,p_role);
   else
     update public.module_role_assignments
        set enabled=false,assigned_by=v_admin,updated_at=now()
      where user_id=p_user_id and module_id=p_module_id;
     insert into public.frt_audit_logs(workspace_id,user_id,action,details)
       values(v_workspace,v_admin,'USER_ROLE_CHANGED',
        jsonb_build_object('targetUserId',p_user_id,'role',p_role,'enabled',false,'authority','WatchdogWorkspace'));
   end if;
 elsif p_module_id='tool-traceability' then
   perform public.tool_traceability_admin_set_role(v_workspace,p_user_id,p_role,p_enabled);
 elsif p_module_id='material-request-hub' then
   perform public.material_request_hub_admin_set_role(v_workspace,p_user_id,p_role,p_enabled);
 elsif p_module_id='toolbox-issues' then
   if not p_enabled then
     -- CP135: central administrator has already passed the active-workspace and target guards.
     -- The separate membership record is authoritative for Toolbox operational access.
     update public.toolbox_issues_memberships m
     set enabled=false,assigned_by=v_admin,updated_at=clock_timestamp()
     where m.workspace_id=v_workspace and m.user_id=p_user_id and m.enabled=true;
     if not found then
       raise exception 'Enabled Toolbox Issues membership required for revocation' using errcode='42501';
     end if;
     insert into public.toolbox_issues_activity(workspace_id,entity_type,entity_id,actor_user_id,event_type,detail)
     values(v_workspace,'membership',p_user_id::text,v_admin,'role_revoked',
       jsonb_build_object('role',p_role,'enabled',false,'authority','WatchdogWorkspace'));
   else
     perform public.toolbox_issues_admin_set_role(v_workspace,p_user_id,p_role);
   end if;
 end if;
 if p_module_id<>'fund-released-tracker' then
   insert into public.module_role_assignments(user_id,module_id,role,enabled,assigned_by)
   values(p_user_id,p_module_id,p_role,p_enabled,v_admin)
   on conflict(user_id,module_id) do update set
    role=excluded.role,enabled=excluded.enabled,assigned_by=excluded.assigned_by,updated_at=now();
 end if;
 select * into v_row from public.module_role_assignments where user_id=p_user_id and module_id=p_module_id;
 return jsonb_build_object('user_id',p_user_id,'module_id',p_module_id,
   'role',v_row.role,'enabled',coalesce(v_row.enabled,false),
   'updated_at',v_row.updated_at,'backendSynchronized',
   p_module_id=any(array['fund-released-tracker','tool-traceability','material-request-hub','toolbox-issues']::text[]));
end $function$
;
-- WS02D_B3_SOURCE_END:wm_admin_set_application_role
COMMIT;
