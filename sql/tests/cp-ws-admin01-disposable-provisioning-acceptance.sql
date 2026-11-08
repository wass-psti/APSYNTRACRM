-- Disposable PostgreSQL 17 acceptance for one-time admin-only provisioning.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regclass('private.ws02_admin_creation_approvals') IS NULL
  OR (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
  OR has_function_privilege('anon','public.ws02_admin_stage_creation(text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.ws02_admin_stage_creation(text,text)','EXECUTE')
  OR has_table_privilege('authenticated','private.ws02_admin_creation_approvals','SELECT')
 THEN RAISE EXCEPTION 'Admin provisioning cannot be tested safely' USING ERRCODE='42501'; END IF;
END $pre$;

BEGIN;
-- No permit, even if the user spoofs an administrator ticket in app_metadata.
DO $no_approval$
BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_app_meta_data)
  VALUES('dddddddd-0000-4000-8000-000000000001','unapproved@example.invalid',
   now(),false,'{"apsyntra_approval_ticket":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
  RAISE EXCEPTION 'Unapproved account was created' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM auth.users WHERE email='unapproved@example.invalid')
 THEN RAISE EXCEPTION 'Unapproved user persisted'; END IF;
END $no_approval$;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT public.ws02_admin_stage_creation(
 'APPROVED@EXAMPLE.INVALID',
 encode(pg_catalog.sha256(pg_catalog.convert_to(repeat('a',64),'UTF8')),'hex')
);
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data,raw_app_meta_data)
VALUES(
 'dddddddd-0000-4000-8000-000000000002','approved@example.invalid',
 now(),false,'{"display_name":"Approved Example","platform_role":"admin_general_manager"}',
 jsonb_build_object('apsyntra_approval_ticket',repeat('a',64))
);
DO $accepted$
DECLARE w uuid;
BEGIN
 SELECT workspace_id INTO STRICT w FROM private.ws02_personal_workspaces
 WHERE user_id='dddddddd-0000-4000-8000-000000000002';
 IF (SELECT platform_role FROM public.profiles WHERE id='dddddddd-0000-4000-8000-000000000002')<>'employee'
  OR (SELECT status FROM public.profiles WHERE id='dddddddd-0000-4000-8000-000000000002')<>'active'
  OR (SELECT name FROM public.workspaces WHERE id=w)<>'Main Workspace'
  OR (SELECT count(*) FROM public.workspace_members
    WHERE user_id='dddddddd-0000-4000-8000-000000000002' AND active)<>1
  OR (SELECT count(*) FROM private.ws02_admin_creation_approvals
    WHERE email='approved@example.invalid' AND consumed_at IS NOT NULL
      AND user_id='dddddddd-0000-4000-8000-000000000002')<>1
 THEN RAISE EXCEPTION 'Admin-approved user not properly restricted/provisioned';
 END IF;
END $accepted$;

-- Consumed ticket can't be reused to create another account, even with metadata.
DO $replay$
BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_app_meta_data)
  VALUES('dddddddd-0000-4000-8000-000000000003','approved@example.invalid',
   now(),false,jsonb_build_object('apsyntra_approval_ticket',repeat('a',64)));
  RAISE EXCEPTION 'Ticket replay unexpectedly succeeded' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $replay$;

-- A ticket for one email does not authorize a different email.
SET ROLE service_role;
SELECT public.ws02_admin_stage_creation(
 'second@example.invalid',encode(pg_catalog.sha256(pg_catalog.convert_to(repeat('b',64),'UTF8')),'hex')
);
RESET ROLE;
DO $foreign$
BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous,raw_app_meta_data)
  VALUES('dddddddd-0000-4000-8000-000000000004','different@example.invalid',
   now(),false,jsonb_build_object('apsyntra_approval_ticket',repeat('b',64)));
  RAISE EXCEPTION 'Foreign email stole ticket' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;

-- Never restore intentionally disabled accounts through re-verification.
UPDATE public.profiles SET status='disabled'
 WHERE id='dddddddd-0000-4000-8000-000000000002';
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='dddddddd-0000-4000-8000-000000000002';
DO $disabled$
BEGIN
 IF (SELECT status FROM public.profiles
  WHERE id='dddddddd-0000-4000-8000-000000000002')<>'disabled'
 THEN RAISE EXCEPTION 'Reverification reactivated disabled account'; END IF;
END $disabled$;
ROLLBACK;
SELECT 'WS_ADMIN01_DISPOSABLE_PG17_PASS' AS acceptance;
