-- CP-FRT-SEC02 — STRICT, TEST-ONLY FRT membership/configuration retirement.
-- Deletes ONLY four FRT QA membership rows and three QA company configuration rows.
-- DOES NOT touch shared auth.users, profiles, workspace_members, sessions, applications,
-- role-change audit, legitimate Work Management FRT rows or any financial data.
-- Phase A cross-workspace identity sessions remain available.
BEGIN;
DO $guard$
DECLARE v_workspace uuid;v_users integer;v_members integer;v_companies integer;
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces
 WHERE name='FRT-ACCEPTANCE-QA-v0.5.0';
 SELECT count(*) INTO v_users FROM auth.users u
 JOIN public.workspace_members m ON m.user_id=u.id
 WHERE m.workspace_id=v_workspace AND m.active
   AND lower(u.email) LIKE '%frt%' AND lower(u.email) LIKE '%qa%';
 SELECT count(*) INTO v_members FROM public.frt_memberships f
 WHERE f.workspace_id=v_workspace;
 SELECT count(*) INTO v_companies FROM public.frt_companies c
 WHERE c.workspace_id=v_workspace;
 IF v_users<>4 OR v_members<>4 OR v_companies<>3
 OR (SELECT count(*) FROM public.workspace_members m WHERE m.workspace_id=v_workspace)<>4
 OR (SELECT count(*) FROM public.frt_memberships f WHERE f.workspace_id=v_workspace
     AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=f.user_id
       AND lower(u.email) LIKE '%frt%' AND lower(u.email) LIKE '%qa%'))<>0
 OR EXISTS(SELECT 1 FROM public.frt_requests r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_request_items r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_liquidations r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_liquidation_items r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_comments r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_attachments r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_voucher_counters r WHERE r.workspace_id=v_workspace)
 OR EXISTS(SELECT 1 FROM public.frt_audit_logs r WHERE r.workspace_id=v_workspace)
 THEN
  RAISE EXCEPTION 'FRT QA cleanup aborted: non-test membership, data or changed inventory';
 END IF;
END $guard$;
DO $cleanup$
DECLARE v_workspace uuid;deleted_members integer;deleted_config integer;
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces
 WHERE name='FRT-ACCEPTANCE-QA-v0.5.0';
 DELETE FROM public.frt_memberships f
 WHERE f.workspace_id=v_workspace AND EXISTS
 (SELECT 1 FROM auth.users u JOIN public.workspace_members m ON m.user_id=u.id
  WHERE u.id=f.user_id AND m.workspace_id=v_workspace AND m.active
  AND lower(u.email) LIKE '%frt%' AND lower(u.email) LIKE '%qa%');
 GET DIAGNOSTICS deleted_members=ROW_COUNT;
 IF deleted_members<>4 THEN RAISE EXCEPTION 'Unexpected FRT QA member count'; END IF;
 DELETE FROM public.frt_companies c WHERE c.workspace_id=v_workspace;
 GET DIAGNOSTICS deleted_config=ROW_COUNT;
 IF deleted_config<>3 THEN RAISE EXCEPTION 'Unexpected FRT QA configuration count'; END IF;
END $cleanup$;
COMMIT;
