-- CP-FRT-SEC10: isolated PostgreSQL 17 transaction/session-context acceptance.
-- NEVER apply to connected production. Runs only after CP06 fixture and tests.
-- Separate transactions simulate a new request with auth.uid(), NOT a fresh
-- Supabase Auth JWT/session issuance. That requires real nonproduction logins.

-- The CP06 fixture must have returned to inherited roles with three audit events.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.apsyntra_crm_platform_roles) OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit)<>3
 THEN RAISE EXCEPTION 'SEC10 fixture did not begin after CP06 clean revocation'; END IF;
END $$;

-- Transaction 1: signed bootstrap grants an explicit viewer ceiling with CAS NULL.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 ack jsonb;
BEGIN
 ack:=public.apsyntra_crm_platform_role_set(ws,b,'viewer',NULL);
 IF ack->>'effectiveRole'<>'viewer' OR
    ack->>'scope'<>'crm-platform' OR
    ack->>'currentRevision' IS NULL OR
    ack->>'changeId' IS NULL OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit)<>4
 THEN RAISE EXCEPTION 'SEC10 initial assignment not atomically audited'; END IF;
END $$;
COMMIT;

-- Transaction 2: a separate signed member request reflects the new role
-- directly from authoritative DB state; no JWT role claims are trusted.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 board uuid:='00000000-0000-4000-8000-00000000000d';
BEGIN
 IF public.apsyntra_crm_effective_role(b,ws)<>'viewer'
    OR NOT public.work_board_access(board,'view')
    OR public.work_board_access(board,'edit')
    OR public.work_board_access(board,'manage')
    OR public.has_module_access('fund-released-tracker',b)
    OR private.frt_current_role(ws) IS NOT NULL
 THEN RAISE EXCEPTION 'SEC10 viewer ceiling violated after separate request'; END IF;

 -- Nonbootstrap cannot promote itself or read privileged CRM roster.
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,b,'admin',NULL);
  RAISE EXCEPTION 'SEC10 unauthorized self-promotion';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_snapshot(ws);
  RAISE EXCEPTION 'SEC10 unauthorized CRM snapshot';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;
COMMIT;

-- Transaction 3: stale-revision update must be refused without new audit.
-- Followed by a valid revision-bound supervisor assignment.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 revision timestamptz;
 before_count integer;
 ack jsonb;
BEGIN
 SELECT updated_at INTO revision FROM public.apsyntra_crm_platform_roles
  WHERE user_id=b AND workspace_id=ws;
 before_count:=(SELECT count(*) FROM public.apsyntra_role_change_audit);
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(ws,b,'admin',
    '2020-01-01 00:00:00+00'::timestamptz);
  RAISE EXCEPTION 'SEC10 stale revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 IF (SELECT count(*) FROM public.apsyntra_role_change_audit)<>before_count
 THEN RAISE EXCEPTION 'SEC10 stale update produced audit entry'; END IF;
 ack:=public.apsyntra_crm_platform_role_set(ws,b,'supervisor',revision);
 IF ack->>'effectiveRole'<>'supervisor' OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit)<>before_count+1
 THEN RAISE EXCEPTION 'SEC10 supervisor transition or audit failed'; END IF;
END $$;
COMMIT;

-- Transaction 4: separate signed request sees new supervisor limits.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 board uuid:='00000000-0000-4000-8000-00000000000d';
BEGIN
 IF public.apsyntra_crm_effective_role(b,ws)<>'supervisor'
    OR NOT public.has_module_access('fund-released-tracker',b)
    OR private.frt_current_role(ws)<>'FINANCE_MANAGER'
    OR NOT public.work_board_access(board,'view')
    OR NOT public.work_board_access(board,'edit')
    OR public.work_board_access(board,'manage')
 THEN RAISE EXCEPTION 'SEC10 supervisor access ceiling violated'; END IF;
END $$;
COMMIT;

-- Transaction 5: authorization is revoked using current revision.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 revision timestamptz;
 ack jsonb;
BEGIN
 SELECT updated_at INTO revision FROM public.apsyntra_crm_platform_roles
  WHERE user_id=b AND workspace_id=ws;
 ack:=public.apsyntra_crm_platform_role_set(ws,b,NULL,revision);
 IF ack->>'effectiveRole'<>'employee' OR
    ack->'after'<>'null'::jsonb OR
    (SELECT count(*) FROM public.apsyntra_crm_platform_roles)<>0
 THEN RAISE EXCEPTION 'SEC10 override revocation not effective'; END IF;
END $$;
COMMIT;

-- Transaction 6: separate signed request reads restored original authority.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
DO $$
DECLARE
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
 board uuid:='00000000-0000-4000-8000-00000000000d';
BEGIN
 IF NOT public.has_module_access('fund-released-tracker',b)
    OR NOT public.work_board_access(board,'manage')
    OR private.frt_current_role(ws)<>'FINANCE_MANAGER'
 THEN RAISE EXCEPTION 'SEC10 inherited original permissions not restored'; END IF;
 IF (SELECT count(*) FROM public.apsyntra_role_change_audit)<>6
    OR (SELECT count(*) FROM public.apsyntra_role_change_requests)<>6
    OR (SELECT count(DISTINCT change_id) FROM public.apsyntra_role_change_audit)<>6
    OR EXISTS(SELECT 1 FROM public.apsyntra_crm_platform_roles)
    OR (SELECT count(*) FROM public.module_role_assignments)<>1
    OR (SELECT count(*) FROM public.work_board_members)<>1
    OR (SELECT count(*) FROM auth.users)<>3
 THEN RAISE EXCEPTION 'SEC10 audit integrity or original data preservation failed'; END IF;
END $$;
COMMIT;

SELECT 'PASS CP-FRT-SEC10 disposable separate-transaction acceptance (not real JWT)' AS outcome;
