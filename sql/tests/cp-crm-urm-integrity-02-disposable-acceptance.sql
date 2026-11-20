-- CP-CRM-URM-INTEGRITY-02 — disposable PG17, synthetic users only.
-- Execute after the existing CP-URM-04B disposable setup and migration.
-- All actions remain inside a transaction that is rolled back at the end.
\set ON_ERROR_STOP on
BEGIN;
DO $acceptance$
DECLARE
  actor uuid := '11111111-1111-4111-8111-111111111111';
  target uuid := '44444444-4444-4444-8444-444444444444';
  foreign_user uuid := '22222222-2222-4222-8222-222222222222';
  ws uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  board uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  receipt jsonb;
  revision timestamptz;
  v_change_id uuid;
  initial_events integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('app.workspace_id', ws::text, true);
  IF NOT public.apsyntra_role_is_admin() THEN
    RAISE EXCEPTION 'Fixture CRM administrator unavailable'; END IF;
  SELECT count(*) INTO initial_events FROM public.apsyntra_role_change_audit;

  -- Real module assignment RPC, persisted readback and effective actor-side grant.
  receipt := public.apsyntra_role_manage_user_access(ws,target,'module','order-intake','User',true,NULL);
  v_change_id := (receipt->>'changeId')::uuid;
  IF receipt->>'effective'<>'true' OR NOT EXISTS(
     SELECT 1 FROM public.module_role_assignments WHERE user_id=target
       AND module_id='order-intake' AND role='User' AND enabled)
     OR NOT EXISTS(SELECT 1 FROM public.apsyntra_role_change_requests
        WHERE id=v_change_id AND status='applied')
     OR NOT EXISTS(SELECT 1 FROM public.apsyntra_role_change_audit
        WHERE change_id=v_change_id AND event='applied')
  THEN RAISE EXCEPTION 'Module receipt did not persist with audit'; END IF;
  SELECT updated_at INTO revision FROM public.module_role_assignments
    WHERE user_id=target AND module_id='order-intake';
  IF revision IS NULL THEN RAISE EXCEPTION 'Missing persisted role revision'; END IF;

  -- Simulate independently signed target request context; no token refresh required.
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  PERFORM set_config('app.workspace_id',ws::text,true);
  IF public.module_role_for('order-intake',target) IS DISTINCT FROM 'User' THEN
     RAISE EXCEPTION 'Target effective role did not recalculate'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  BEGIN
    PERFORM public.apsyntra_role_manage_user_access(ws,target,'module','order-intake','Admin',true,NULL);
    RAISE EXCEPTION 'Stale module edit was unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF (SELECT role FROM public.module_role_assignments WHERE user_id=target AND module_id='order-intake')<>'User'
  THEN RAISE EXCEPTION 'Stale module edit changed stored role'; END IF;

  -- Exact revision allows controlled role update; stale revision must then fail.
  receipt := public.apsyntra_role_manage_user_access(ws,target,'module','order-intake','Admin',true,revision);
  IF receipt->>'effective'<>'true' OR NOT EXISTS(
    SELECT 1 FROM public.module_role_assignments WHERE user_id=target AND module_id='order-intake'
      AND role='Admin' AND enabled) THEN RAISE EXCEPTION 'CAS role update failed'; END IF;
  BEGIN
    PERFORM public.apsyntra_role_manage_user_access(ws,target,'module','order-intake','User',true,revision);
    RAISE EXCEPTION 'Concurrent stale update unexpectedly accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  SELECT updated_at INTO revision FROM public.module_role_assignments WHERE user_id=target AND module_id='order-intake';
  receipt := public.apsyntra_role_manage_user_access(ws,target,'module','order-intake','Admin',false,revision);
  IF receipt->>'effective'<>'true' OR EXISTS(
     SELECT 1 FROM public.module_role_assignments WHERE user_id=target
       AND module_id='order-intake' AND enabled)
  THEN RAISE EXCEPTION 'Role revocation did not persist'; END IF;
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  IF public.module_role_for('order-intake',target)='Admin' THEN
    RAISE EXCEPTION 'Revoked module role still effective'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);

  -- Board membership viewer -> editor -> revoke, with exact row checks.
  receipt := public.apsyntra_role_manage_user_access(ws,target,'board',board::text,'viewer',true,NULL);
  IF receipt->>'effective'<>'true' OR NOT EXISTS(
    SELECT 1 FROM public.work_board_members WHERE user_id=target AND board_id=board AND role='viewer')
  THEN RAISE EXCEPTION 'Viewer Board role not persisted'; END IF;
  SELECT updated_at INTO revision FROM public.work_board_members WHERE user_id=target AND board_id=board;
  receipt := public.apsyntra_role_manage_user_access(ws,target,'board',board::text,'editor',true,revision);
  IF NOT EXISTS(SELECT 1 FROM public.work_board_members WHERE user_id=target AND board_id=board AND role='editor')
  THEN RAISE EXCEPTION 'Board editor change not persisted'; END IF;
  BEGIN
    PERFORM public.apsyntra_role_manage_user_access(ws,target,'board',board::text,'viewer',true,revision);
    RAISE EXCEPTION 'Stale Board editor revision unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  SELECT updated_at INTO revision FROM public.work_board_members WHERE user_id=target AND board_id=board;
  receipt := public.apsyntra_role_manage_user_access(ws,target,'board',board::text,'editor',false,revision);
  IF EXISTS(SELECT 1 FROM public.work_board_members WHERE user_id=target AND board_id=board)
  THEN RAISE EXCEPTION 'Board revocation left membership'; END IF;

  -- CRM workspace tier: signed user projection and revocation inheritance.
  receipt := public.apsyntra_crm_platform_role_set(ws,target,'viewer',NULL);
  IF receipt->>'effectiveRole'<>'viewer' OR NOT EXISTS(
     SELECT 1 FROM public.apsyntra_crm_platform_roles WHERE workspace_id=ws AND user_id=target AND role='viewer')
  THEN RAISE EXCEPTION 'CRM tier assignment not persisted'; END IF;
  SELECT updated_at INTO revision FROM public.apsyntra_crm_platform_roles WHERE workspace_id=ws AND user_id=target;
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  IF public.apsyntra_crm_effective_role(target,ws)<>'viewer' THEN
     RAISE EXCEPTION 'Target effective CRM tier not refreshed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  BEGIN
    PERFORM public.apsyntra_crm_platform_role_set(ws,target,'admin',NULL);
    RAISE EXCEPTION 'Stale CRM tier was incorrectly accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  receipt := public.apsyntra_crm_platform_role_set(ws,target,NULL,revision);
  IF EXISTS(SELECT 1 FROM public.apsyntra_crm_platform_roles WHERE workspace_id=ws AND user_id=target)
    OR public.apsyntra_crm_effective_role(target,ws)='viewer'
  THEN RAISE EXCEPTION 'CRM role revoke failed to restore inherited tier'; END IF;

  -- Denied foreign workspace and non-admin mutations have zero persisted side effects.
  BEGIN
    PERFORM public.apsyntra_role_manage_user_access(ws,foreign_user,'module','order-intake','Admin',true,NULL);
    RAISE EXCEPTION 'Foreign target incorrectly assigned';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  BEGIN
    PERFORM public.apsyntra_role_manage_user_access(ws,actor,'board',board::text,'editor',true,NULL);
    RAISE EXCEPTION 'Employee unexpectedly mutated Board roles';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF EXISTS(SELECT 1 FROM public.module_role_assignments WHERE user_id=foreign_user AND module_id='order-intake')
   THEN RAISE EXCEPTION 'Foreign user gained an assignment'; END IF;
  IF (SELECT count(*) FROM public.apsyntra_role_change_audit)<>initial_events+8 THEN
    RAISE EXCEPTION 'Unexpected role audit event count'; END IF;
  RAISE NOTICE 'CP_CRM_URM_INTEGRITY_02_DISPOSABLE_RPC_READBACK_PASS';
END;
$acceptance$;
ROLLBACK;
