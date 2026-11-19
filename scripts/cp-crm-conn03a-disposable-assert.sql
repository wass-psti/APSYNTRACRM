-- Assert the backfill and all incremental trigger contracts.
DO $test$
DECLARE c integer;
BEGIN
 SELECT count(*) INTO c FROM private.crm_native_board_provision;
 IF c<>4 THEN RAISE EXCEPTION 'Expected four provenance rows, got %',c; END IF;
 SELECT count(*) INTO c FROM public.work_board_members
 WHERE user_id='11111111-1111-4111-8111-111111111111' AND role='viewer';
 IF c<>4 THEN RAISE EXCEPTION 'Expected four canonical viewer grants, got %',c; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.work_board_members
 WHERE user_id='22222222-2222-4222-8222-222222222222' AND role='owner')
 THEN RAISE EXCEPTION 'Owner role overwritten'; END IF;
 IF EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id IN ('22222222-2222-4222-8222-222222222222',
                  '33333333-3333-4333-8333-333333333333',
                  '44444444-4444-4444-8444-444444444444',
                  '55555555-5555-4555-8555-555555555555',
                  '66666666-6666-4666-8666-666666666666',
                  '77777777-7777-4777-8777-777777777777',
                  '88888888-8888-4888-8888-888888888888'))
 THEN RAISE EXCEPTION 'Invalid/grandfathered board member was auto-provisioned'; END IF;
END;
$test$;

-- Disabling a module revokes only its provisioned viewer, never other apps.
UPDATE public.module_role_assignments SET enabled=false
WHERE user_id='11111111-1111-4111-8111-111111111111' AND module_id='time-tracker';
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM public.work_board_members
  WHERE user_id='11111111-1111-4111-8111-111111111111'
    AND board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3')
 THEN RAISE EXCEPTION 'Auto-provisioned viewer not revoked'; END IF;
 IF (SELECT count(*) FROM private.crm_native_board_provision)<>3
 THEN RAISE EXCEPTION 'Other applications changed on revocation'; END IF;
END; $test$;

-- Reenable, then elevate membership manually: subsequent revoke preserves editor.
UPDATE public.module_role_assignments SET enabled=true
WHERE user_id='11111111-1111-4111-8111-111111111111' AND module_id='time-tracker';
UPDATE public.work_board_members
SET role='editor',updated_at=updated_at+interval '1 second'
WHERE user_id='11111111-1111-4111-8111-111111111111'
AND board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3';
UPDATE public.module_role_assignments SET enabled=false
WHERE user_id='11111111-1111-4111-8111-111111111111' AND module_id='time-tracker';
DO $test$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.work_board_members WHERE
 user_id='11111111-1111-4111-8111-111111111111'
 AND board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3' AND role='editor')
 THEN RAISE EXCEPTION 'Manual editor grant lost'; END IF;
 IF EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='11111111-1111-4111-8111-111111111111'
 AND board_id='46bf4ee7-368a-4c35-842c-8593ea1f6ac3')
 THEN RAISE EXCEPTION 'Outdated provenance retained'; END IF;
END;$test$;

-- A manual viewer revision also remains independent.
UPDATE public.work_board_members
SET updated_at=updated_at+interval '1 second'
WHERE user_id='11111111-1111-4111-8111-111111111111'
AND board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e';
UPDATE public.module_role_assignments SET enabled=false
WHERE user_id='11111111-1111-4111-8111-111111111111' AND module_id='fueltrack-plus';
DO $test$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.work_board_members WHERE
 user_id='11111111-1111-4111-8111-111111111111'
 AND board_id='7af78b3f-67bf-4600-9aa1-9006d19d486e' AND role='viewer')
 THEN RAISE EXCEPTION 'Independent viewer grant lost'; END IF;
END;$test$;

-- FRT-specific workspace revocation, then reenable must follow source precedence.
UPDATE public.frt_memberships SET enabled=true,status='active'
WHERE user_id='66666666-6666-4666-8666-666666666666';
DO $test$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='66666666-6666-4666-8666-666666666666')
 THEN RAISE EXCEPTION 'FRT scoped enable not provisioned'; END IF;
END;$test$;
UPDATE public.frt_memberships SET enabled=false,status='disabled'
WHERE user_id='66666666-6666-4666-8666-666666666666';
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='66666666-6666-4666-8666-666666666666')
 THEN RAISE EXCEPTION 'FRT scoped disable failed'; END IF;
END;$test$;

-- Scoped assignment overrides the legacy enabled role.
UPDATE public.apsyntra_workspace_module_roles SET enabled=true
WHERE user_id='55555555-5555-4555-8555-555555555555';
DO $test$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='55555555-5555-4555-8555-555555555555')
 THEN RAISE EXCEPTION 'Scoped role enable failed'; END IF;
END;$test$;
UPDATE public.apsyntra_workspace_module_roles SET enabled=false
WHERE user_id='55555555-5555-4555-8555-555555555555';
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='55555555-5555-4555-8555-555555555555')
 THEN RAISE EXCEPTION 'Scoped disable failed'; END IF;
END;$test$;

-- Initially mult-workspace target is excluded, then becomes eligible after
-- the extra membership is deactivated and Work Management membership refreshes.
UPDATE public.workspace_members SET active=false
WHERE user_id='44444444-4444-4444-8444-444444444444'
 AND workspace_id='00000000-0000-4000-8000-000000000002';
UPDATE public.workspace_members SET active=true
WHERE user_id='44444444-4444-4444-8444-444444444444'
 AND workspace_id='00000000-0000-4000-8000-000000000001';
DO $test$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM private.crm_native_board_provision
 WHERE user_id='44444444-4444-4444-8444-444444444444')
 THEN RAISE EXCEPTION 'Workspace member activation did not synchronize'; END IF;
END;$test$;

-- Invalidate one canonical board: no additional membership from new assignment.
UPDATE public.work_boards SET status='trashed',trashed_at=clock_timestamp()
WHERE id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
INSERT INTO public.profiles VALUES ('99999999-9999-4999-8999-999999999999','active');
INSERT INTO public.workspace_members VALUES
('00000000-0000-4000-8000-000000000001','99999999-9999-4999-8999-999999999999',true);
INSERT INTO public.module_role_assignments VALUES
('99999999-9999-4999-8999-999999999999','tradelink','User',true);
DO $test$ BEGIN
 IF EXISTS (SELECT 1 FROM public.work_board_members
 WHERE user_id='99999999-9999-4999-8999-999999999999')
 THEN RAISE EXCEPTION 'Trashed canonical board accidentally provisioned'; END IF;
END;$test$;

-- Run repeatedly: idempotence must preserve revision, no extra provenance.
DO $test$ DECLARE n integer; before_revision timestamptz; after_revision timestamptz;
BEGIN
 SELECT count(*) INTO n FROM private.crm_native_board_provision;
 SELECT updated_at INTO before_revision FROM public.work_board_members
 WHERE user_id='11111111-1111-4111-8111-111111111111'
 AND board_id='f36da8fe-8d9d-4629-9938-12533cb3ca39';
 PERFORM private.crm_native_board_sync(
 '11111111-1111-4111-8111-111111111111','fund-released-tracker');
 SELECT updated_at INTO after_revision FROM public.work_board_members
 WHERE user_id='11111111-1111-4111-8111-111111111111'
 AND board_id='f36da8fe-8d9d-4629-9938-12533cb3ca39';
 IF before_revision IS DISTINCT FROM after_revision
 OR n<>(SELECT count(*) FROM private.crm_native_board_provision)
 THEN RAISE EXCEPTION 'Idempotency violated'; END IF;
END;$test$;
SELECT 'CP_CRM_CONN03A_DISPOSABLE_ACCEPTANCE_PASS' AS result;
