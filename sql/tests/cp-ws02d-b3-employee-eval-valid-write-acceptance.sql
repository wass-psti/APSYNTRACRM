-- CP-WS-02D/B3: real Employee Evaluation RPC business transitions in PG17.
-- Synthetic signed actor/domain employees; no production employee data.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.employee_evaluation_activity)<>0
 OR (SELECT count(*) FROM public.employee_evaluation_employees)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR NOT has_function_privilege('authenticated','public.employee_evaluation_save(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Employee Evaluation positive test fixture drift' USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE eval_b3_base ON COMMIT PRESERVE ROWS AS
 SELECT (SELECT count(*) FROM public.employee_evaluation_employees) AS employees,
 (SELECT count(*) FROM public.employee_evaluation_evaluations) AS evaluations,
 (SELECT count(*) FROM public.employee_evaluation_settings) AS settings,
 (SELECT count(*) FROM public.employee_evaluation_activity) AS audit,
 (SELECT count(*) FROM private.ws02d_member_access) AS scoped_roles;
BEGIN;
CREATE TEMP TABLE eval_b3_ids(key text PRIMARY KEY,id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO public.employee_evaluation_employees(
 workspace_id,auth_user_id,employee_code,name,email,role,active
) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','ACTOR-C','Fixture Admin C',
  'fixture-c@example.invalid','admin',true),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','ACTOR-D','Fixture Admin Viewer D',
  'fixture-d@example.invalid','admin',true),
 ('00000000-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','ACTOR-B','Foreign Admin B',
  'fixture-b@example.invalid','admin',true);
INSERT INTO public.employee_evaluation_settings(
 workspace_id,active_period,evaluation_window,revision
) VALUES
 ('00000000-0000-4000-8000-000000000001','2026-Q4','Open',1),
 ('00000000-0000-4000-8000-000000000002','2026-Q4','Open',1);
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $create_employee$
DECLARE e jsonb;uid uuid;
BEGIN
 e:=public.employee_evaluation_create_employee(
 '{"employeeCode":"EMP-B3-001","name":"Synthetic Test Employee",
 "email":"employee-b3@example.invalid","role":"employee","active":true}'::jsonb);
 uid:=(e->>'id')::uuid;
 INSERT INTO pg_temp.eval_b3_ids VALUES('target',uid);
 IF e->>'name'<>'Synthetic Test Employee' OR (e->>'revision')::bigint<>1
  OR e ? 'auth_user_id'
 THEN RAISE EXCEPTION 'Employee creation result or identity redaction incorrect'; END IF;
 e:=public.employee_evaluation_update_employee(uid,
  '{"revision":1,"name":"Updated Synthetic Employee","department":"Operations"}'::jsonb);
 IF e->>'name'<>'Updated Synthetic Employee' OR (e->>'revision')::bigint<>2
 THEN RAISE EXCEPTION 'Authorized employee update or CAS failed'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_update_employee(uid,
   '{"revision":1,"department":"Stale"}'::jsonb);
  RAISE EXCEPTION 'Stale employee revision allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $create_employee$;
DO $member_manage_denied$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_update_settings(
   '{"revision":1,"gracePeriodDays":5}'::jsonb);
  RAISE EXCEPTION 'Workspace Member changed admin-only settings'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $member_manage_denied$;
-- Scoped Admin can manage settings if they ALSO hold domain Admin role;
-- this is an explicit upper bound, not a platform-role mutation.
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
UPDATE private.ws02d_member_access SET role='admin'
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $admin_settings$
DECLARE s jsonb;
BEGIN
 s:=public.employee_evaluation_update_settings(
  '{"revision":1,"gracePeriodDays":5,"evaluationWindow":"Open"}'::jsonb);
 IF (s->>'revision')::bigint<>2 OR (s->>'grace_period_days')::integer<>5
 THEN RAISE EXCEPTION 'Authorized scoped settings change failed'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_update_settings(
   '{"revision":1,"gracePeriodDays":4}'::jsonb);
  RAISE EXCEPTION 'Stale settings revision accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
END $admin_settings$;
DO $save_eval$
DECLARE e jsonb;ratings jsonb;actor_id uuid;target_id uuid;eid uuid;payload jsonb;
BEGIN
 SELECT id INTO STRICT actor_id FROM public.employee_evaluation_employees
 WHERE auth_user_id=auth.uid() AND workspace_id='00000000-0000-4000-8000-000000000001';
 SELECT id INTO STRICT target_id FROM pg_temp.eval_b3_ids WHERE key='target';
 payload:=jsonb_build_object('employeeId',target_id,'evaluatorId',actor_id,
  'status','Draft','period','2026-Q4','ratings',jsonb_build_object('c1',4),
  'comments','Draft comment');
 e:=public.employee_evaluation_save(payload);
 eid:=(e->>'id')::uuid;
 INSERT INTO pg_temp.eval_b3_ids VALUES('evaluation',eid);
 IF e->>'status'<>'Draft' OR (e->>'revision')::bigint<>1
 OR (e->>'overall_score')::numeric<>4
 THEN RAISE EXCEPTION 'Authorized draft evaluation or scoring failed'; END IF;
 SELECT jsonb_object_agg('c'||i::text,4) INTO ratings
 FROM generate_series(1,15) AS i;
 payload:=jsonb_build_object(
  'id',eid,'revision',1,'employeeId',target_id,'evaluatorId',actor_id,
  'status','Submitted','period','2026-Q4','ratings',ratings,
  'comments','This is a complete synthetic evaluation comment.',
  'strengths','Strong consistent synthetic performance.',
  'improvements','Continue developing synthetic skills.',
  'recommendation','Retain');
 e:=public.employee_evaluation_save(payload);
 IF e->>'status'<>'Submitted' OR (e->>'revision')::bigint<>2
 OR (e->>'submitted_at') IS NULL
 THEN RAISE EXCEPTION 'Authorized submitted evaluation transition failed'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_save(payload);
  RAISE EXCEPTION 'Stale evaluation update accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 e:=public.employee_evaluation_review_transition(eid,'Reviewed','Accepted',2);
 IF e->>'status'<>'Reviewed' OR (e->>'revision')::bigint<>3
 THEN RAISE EXCEPTION 'Review transition failed'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_review_transition(eid,'Finalized','',2);
  RAISE EXCEPTION 'Stale review transition accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 e:=public.employee_evaluation_review_transition(eid,'Finalized','',3);
 IF e->>'status'<>'Finalized' OR (e->>'revision')::bigint<>4
 THEN RAISE EXCEPTION 'Finalized review transition failed'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_review_transition(eid,'Returned','A reason',4);
  RAISE EXCEPTION 'Terminal evaluation change accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $save_eval$;
-- Domain admin on a scoped Viewer must not write anything.
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',true);
DO $viewer$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_create_employee(
   '{"employeeCode":"VIEWER","name":"Viewer Blocked",
     "email":"viewer-blocked@example.invalid","role":"employee"}'::jsonb);
  RAISE EXCEPTION 'Workspace Viewer created employee despite domain Admin' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.employee_evaluation_update_settings('{"revision":2}'::jsonb);
  RAISE EXCEPTION 'Workspace Viewer changed domain settings' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $viewer$;
-- Foreign workspace identity cannot see/change home workspace rows.
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE e jsonb;
BEGIN
 e:=public.employee_evaluation_create_employee(
  '{"employeeCode":"B3-FOREIGN","name":"Foreign Synthetic Employee",
    "email":"foreign-b3@example.invalid","role":"employee"}'::jsonb);
 IF (SELECT count(*) FROM public.employee_evaluation_employees WHERE
  id=(e->>'id')::uuid AND workspace_id='00000000-0000-4000-8000-000000000002')<>1
 THEN RAISE EXCEPTION 'Foreign account generated record outside its workspace'; END IF;
 BEGIN
  PERFORM public.employee_evaluation_update_employee(
   (SELECT id FROM pg_temp.eval_b3_ids WHERE key='target'),
   '{"revision":2,"department":"Foreign illegal edit"}'::jsonb);
  RAISE EXCEPTION 'Foreign workspace updated home workspace employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.employee_evaluation_create_employee(
   '{"employeeCode":"EXPIRED","name":"Expired",
     "email":"expired@example.invalid","role":"employee"}'::jsonb);
  RAISE EXCEPTION 'Expired signed user created employee' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $expired$;
-- Audit integrity: core actions by C (create/update/settings/save/review)
-- and isolated B creation. All records are synthetic and transaction scoped.
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.employee_evaluation_activity)<>8
 OR (SELECT count(*) FROM public.employee_evaluation_activity
  WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>7
 OR (SELECT count(*) FROM public.employee_evaluation_activity
  WHERE workspace_id='00000000-0000-4000-8000-000000000002')<>1
 OR (SELECT status FROM public.employee_evaluation_evaluations WHERE
 id=(SELECT id FROM pg_temp.eval_b3_ids WHERE key='evaluation'))<>'Finalized'
 THEN RAISE EXCEPTION 'Employee Evaluation audit/foreign-workspace integrity mismatch'; END IF;
END $audit$;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.eval_b3_base;
 IF (SELECT count(*) FROM public.employee_evaluation_employees)<>b.employees
 OR (SELECT count(*) FROM public.employee_evaluation_evaluations)<>b.evaluations
 OR (SELECT count(*) FROM public.employee_evaluation_settings)<>b.settings
 OR (SELECT count(*) FROM public.employee_evaluation_activity)<>b.audit
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.scoped_roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Employee Evaluation test altered existing fixture'; END IF;
 RAISE NOTICE 'WS02D/B3 five Employee Evaluation valid-write and denial workflows PASS';
END $rollback$;
DROP TABLE pg_temp.eval_b3_base;
