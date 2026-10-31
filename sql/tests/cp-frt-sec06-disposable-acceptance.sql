-- Disposable DB acceptance: PostgreSQL, NOT a genuine Supabase signed-user test.
-- Raises an error immediately for any failed role, RLS, audit or workspace gate.
DO $$
DECLARE a uuid:='00000000-0000-4000-8000-00000000000a';
        b uuid:='00000000-0000-4000-8000-00000000000b';
        c uuid:='00000000-0000-4000-8000-00000000000c';
        ws uuid:='00000000-0000-4000-8000-000000000001';
        ws2 uuid:='00000000-0000-4000-8000-000000000002';
        board uuid:='00000000-0000-4000-8000-00000000000d';
        rev timestamptz;
        result jsonb;
BEGIN
 -- Baseline must be unchanged until a role override is deliberately assigned.
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT public.work_board_access(board,'manage') THEN
  RAISE EXCEPTION 'Legacy employee board ownership unexpectedly restricted'; END IF;
 IF NOT public.has_module_access('fund-released-tracker',b) THEN
  RAISE EXCEPTION 'Legacy FRT role unexpectedly restricted'; END IF;
 IF private.frt_current_role(ws) <> 'FINANCE_MANAGER' THEN
  RAISE EXCEPTION 'Original FRT domain role changed without a CRM override'; END IF;

 -- Untrusted nonbootstrap is not allowed to manage its CRM role.
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,b,'admin',NULL);
  RAISE EXCEPTION 'SECURITY: nonbootstrap CRM role change permitted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);

 -- Protected self, cross-workspace and out-of-workspace targets denied.
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,a,'viewer',NULL);
  RAISE EXCEPTION 'SECURITY: protected bootstrap user modified';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws2,c,'viewer',NULL);
  RAISE EXCEPTION 'SECURITY: cross-workspace mutation accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,c,'viewer',NULL);
  RAISE EXCEPTION 'SECURITY: out-of-workspace target accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;

 result:=public.apsyntra_crm_platform_role_set(ws,b,'viewer',NULL);
 IF result->>'effectiveRole'<>'viewer' OR result->>'scope'<>'crm-platform' THEN
  RAISE EXCEPTION 'CRM role assignment acknowledgement invalid'; END IF;
 IF (SELECT count(*) FROM public.apsyntra_crm_platform_roles
   WHERE workspace_id=ws AND user_id=b AND role='viewer')<>1 THEN
  RAISE EXCEPTION 'CRM role not persisted'; END IF;

 -- Explicit viewer cannot exercise FRT FINANCE_MANAGER or employee board ownership.
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF public.work_board_access(board,'edit') OR public.work_board_access(board,'manage')
    OR NOT public.work_board_access(board,'view') THEN
  RAISE EXCEPTION 'Viewer board access ceiling bypassed'; END IF;
 IF public.work_board_access(board,NULL) THEN
  RAISE EXCEPTION 'NULL board permission requirement treated as view'; END IF;
 IF public.has_module_access('fund-released-tracker',b) THEN
  RAISE EXCEPTION 'Viewer FRT module access ceiling bypassed'; END IF;
 IF public.module_role_for('fund-released-tracker',b) IS NOT NULL THEN
  RAISE EXCEPTION 'Viewer FRT effective role not denied'; END IF;
 IF private.frt_current_role(ws) IS NOT NULL THEN
  RAISE EXCEPTION 'Viewer FRT domain authorization not denied'; END IF;

 -- Deliberate tier change, CAS and stale revision rejection.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SELECT updated_at INTO rev FROM public.apsyntra_crm_platform_roles
 WHERE workspace_id=ws AND user_id=b;
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,b,'supervisor',
   '2020-01-01 00:00:00+00'::timestamptz);
  RAISE EXCEPTION 'SECURITY: stale CRM role revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM public.apsyntra_crm_platform_role_set(ws,b,'supervisor',rev);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT public.has_module_access('fund-released-tracker',b) OR
  private.frt_current_role(ws)<>'FINANCE_MANAGER' THEN
  RAISE EXCEPTION 'Supervisor FRT FINANCE_MANAGER bound incorrectly'; END IF;
 IF public.work_board_access(board,'manage') THEN
  RAISE EXCEPTION 'Supervisor manage ceiling bypassed'; END IF;

 -- Revocation restores inherited host/board/domain behavior without deleting any.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 SELECT updated_at INTO rev FROM public.apsyntra_crm_platform_roles
 WHERE workspace_id=ws AND user_id=b;
 PERFORM public.apsyntra_crm_platform_role_set(ws,b,NULL,rev);
 IF EXISTS(SELECT 1 FROM public.apsyntra_crm_platform_roles
   WHERE workspace_id=ws AND user_id=b) THEN
  RAISE EXCEPTION 'CRM override not revoked'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 IF NOT public.work_board_access(board,'manage') OR
  NOT public.has_module_access('fund-released-tracker',b) OR
  private.frt_current_role(ws)<>'FINANCE_MANAGER' THEN
  RAISE EXCEPTION 'Inherited roles not restored'; END IF;

 IF (SELECT count(*) FROM public.apsyntra_role_change_requests)<>3 OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit WHERE event='applied')<>3 THEN
  RAISE EXCEPTION 'Expected applied audit rows missing'; END IF;
 IF (SELECT count(*) FROM public.module_role_assignments)<>1 OR
    (SELECT count(*) FROM public.work_board_members)<>1 OR
    (SELECT count(*) FROM auth.users)<>3 THEN
  RAISE EXCEPTION 'Original user/domain/board data mutated'; END IF;
END $$;

-- Verify the Data API's anonymous and signed roles cannot perform direct DML.
DO $$
BEGIN
 IF has_table_privilege('anon','public.apsyntra_crm_platform_roles','SELECT')
  OR has_table_privilege('authenticated','public.apsyntra_crm_platform_roles','UPDATE')
  OR has_function_privilege('anon',
      'public.apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'Direct CRM authorization grants leaked'; END IF;
END $$;
SELECT 'PASS CP-FRT-SEC06 disposable PostgreSQL contract' AS outcome;
