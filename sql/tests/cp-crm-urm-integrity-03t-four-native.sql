\set ON_ERROR_STOP on
-- Disposable fixture only: existing synthetic IDs, never run against production.
DO $accept$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 admin_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_module text;role_name text;old_role text;receipt jsonb;
 saved_role text; rev timestamptz; snapshot jsonb; access jsonb;
BEGIN
 PERFORM set_config('test.workspace',w::text,true);
 PERFORM set_config('test.actor',target::text,true);
 -- Capture source/effective roles before any writer is called.
 CREATE TEMP TABLE cp_03t_prior ON COMMIT DROP AS
 SELECT m.module_id, public.apsyntra_scoped_module_role(m.module_id,target,w) AS old_role
 FROM (VALUES ('time-tracker'),('fund-released-tracker'),('fueltrack-plus'),('tradelink')) m(module_id);
 IF (SELECT count(*) FROM cp_03t_prior)<>4 THEN RAISE EXCEPTION 'Incomplete prior role capture'; END IF;
 PERFORM set_config('test.actor',admin_id::text,true);
 FOR v_module,role_name IN
  SELECT * FROM (VALUES ('time-tracker','Employee'),('fund-released-tracker','REQUESTOR'),
   ('fueltrack-plus','User'),('tradelink','User')) as vals(v_module,role_name)
 LOOP
  IF v_module='fund-released-tracker' THEN
   receipt:=public.apsyntra_role_frt_workspace_set(w,target,role_name,true,NULL);
   snapshot:=public.apsyntra_role_frt_workspace_snapshot(w);
  ELSE
   receipt:=public.apsyntra_role_scoped_six_set(w,target,v_module,role_name,true,NULL);
   snapshot:=public.apsyntra_role_scoped_six_snapshot(w);
  END IF;
  IF receipt->>'role' IS DISTINCT FROM role_name OR receipt->>'enabled' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Writer receipt mismatch: %',v_module;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'assignments') a
   WHERE a->>'moduleId'=v_module AND a->>'userId'=target::text
     AND a->>'role'=role_name AND a->>'enabled'='true') THEN
   RAISE EXCEPTION 'Authoritative persisted snapshot mismatch: %',v_module;
  END IF;
  PERFORM set_config('test.actor',target::text,true);
  IF public.apsyntra_scoped_module_role(v_module,target,w) IS DISTINCT FROM role_name THEN
   RAISE EXCEPTION 'Independent Employee readback mismatch: %',v_module;
  END IF;
  PERFORM set_config('test.actor',admin_id::text,true);
 END LOOP;
 -- Confirm all four roles remain persisted as one complete employee-side snapshot.
 PERFORM set_config('test.actor',target::text,true);
 IF (SELECT count(*) FROM (VALUES ('time-tracker','Employee'),('fund-released-tracker','REQUESTOR'),
   ('fueltrack-plus','User'),('tradelink','User')) vals(id,role)
   WHERE public.apsyntra_scoped_module_role(vals.id,target,w)=vals.role)<>4 THEN
  RAISE EXCEPTION 'Four-app atomic readback failed';
 END IF;
 PERFORM set_config('test.actor',admin_id::text,true);
 -- Genuine scoped writer revocations followed by restoration to captured original roles.
 FOR v_module,old_role IN SELECT p.module_id,p.old_role FROM cp_03t_prior p LOOP
  IF v_module='fund-released-tracker' THEN
   SELECT updated_at INTO rev FROM public.frt_memberships WHERE workspace_id=w AND user_id=target;
   receipt:=public.apsyntra_role_frt_workspace_set(w,target,'REQUESTOR',false,rev);
  ELSE
   SELECT updated_at INTO rev FROM public.apsyntra_workspace_module_roles
    WHERE workspace_id=w AND user_id=target AND module_id=v_module;
   receipt:=public.apsyntra_role_scoped_six_set(w,target,v_module,
    CASE v_module WHEN 'time-tracker' THEN 'Employee' WHEN 'fueltrack-plus' THEN 'User' ELSE 'User' END,
    false,rev);
  END IF;
  PERFORM set_config('test.actor',target::text,true);
  IF public.apsyntra_scoped_module_role(v_module,target,w) IS NOT NULL THEN
   RAISE EXCEPTION 'Revoked role still effective: %',v_module;
  END IF;
  PERFORM set_config('test.actor',admin_id::text,true);
  -- Dispose the synthetic workspace override to restore original legacy fallback exactly.
  IF v_module='fund-released-tracker' THEN
   DELETE FROM public.frt_memberships WHERE workspace_id=w AND user_id=target;
  ELSE
   DELETE FROM public.apsyntra_workspace_module_roles s
   WHERE s.workspace_id=w AND s.user_id=target AND s.module_id=v_module;
  END IF;
  PERFORM set_config('test.actor',target::text,true);
  IF public.apsyntra_scoped_module_role(v_module,target,w) IS DISTINCT FROM old_role THEN
   RAISE EXCEPTION 'Original role restoration failed: %',v_module;
  END IF;
  PERFORM set_config('test.actor',admin_id::text,true);
 END LOOP;
 IF (SELECT count(*) FROM public.apsyntra_role_change_audit
  WHERE detail->>'targetUserId'=target::text)<8 THEN
  RAISE EXCEPTION 'Four assignments and four revocations lack audit records';
 END IF;
 RAISE NOTICE 'CP_CRM_URM_INTEGRITY_03T_FOUR_NATIVE_MUTATION_RESTORATION_PASS';
END;
$accept$;
