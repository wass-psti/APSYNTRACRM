-- CP-WS-02D: isolated default-off invitation schema and role constraints.
-- Synthetic rows only. Explicit transaction ROLLBACK. Never run on production.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regclass('private.ws02d_invitations') IS NULL
  OR to_regclass('private.ws02d_member_access') IS NULL
  OR to_regclass('private.ws02d_invitation_flags') IS NULL
  OR to_regclass('private.ws02d_invitation_events') IS NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
  OR (SELECT count(*) FROM public.workspaces)<>2
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
  OR (SELECT count(*) FROM private.ws02d_member_access)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_flags WHERE
    id IS TRUE AND enabled IS FALSE AND advanced_roles_enabled IS FALSE)<>1
 THEN RAISE EXCEPTION 'WS02D private schema not staged in isolated default-off fixture'
  USING ERRCODE='42501'; END IF;
END $pre$;
DO $grants$
DECLARE c text;
BEGIN
 FOREACH c IN ARRAY ARRAY[
  'private.ws02d_invitations','private.ws02d_member_access',
  'private.ws02d_invitation_events','private.ws02d_invitation_flags'
 ] LOOP
  IF has_table_privilege('anon',c,'SELECT')
   OR has_table_privilege('anon',c,'INSERT')
   OR has_table_privilege('anon',c,'UPDATE')
   OR has_table_privilege('anon',c,'DELETE')
   OR has_table_privilege('authenticated',c,'SELECT')
   OR has_table_privilege('authenticated',c,'INSERT')
   OR has_table_privilege('authenticated',c,'UPDATE')
   OR has_table_privilege('authenticated',c,'DELETE')
  THEN RAISE EXCEPTION 'WS02D direct client privileges on %',c; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class rel
  JOIN pg_namespace n ON n.oid=rel.relnamespace
  WHERE n.nspname='private'
   AND rel.relname LIKE 'ws02d_%'
   AND rel.relkind='r' AND rel.relrowsecurity IS FALSE)
  OR has_sequence_privilege('authenticated',
   'private.ws02d_invitation_events_id_seq','USAGE')
 THEN RAISE EXCEPTION 'WS02D RLS or private sequence protection failed'; END IF;
END $grants$;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer');
DO $role_denial$
BEGIN
 BEGIN
  INSERT INTO private.ws02d_member_access(workspace_id,user_id,role)
   VALUES('00000000-0000-4000-8000-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin');
  RAISE EXCEPTION 'Foreign membership role inserted' USING ERRCODE='P9999';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  UPDATE private.ws02d_member_access SET role='owner';
  RAISE EXCEPTION 'Invitation role elevated to owner' USING ERRCODE='P9999';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $role_denial$;
INSERT INTO private.ws02d_invitations(
 id,workspace_id,issued_by,issued_session,request_id,recipient_email,
 role,token_salt,token_digest,expires_at
) VALUES(
 'bbbbdddd-bbbb-4bbb-8bbb-bbbbddddbbbb',
 '00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-0000-4000-8000-000000000001',
 '11112222-3333-4444-8555-666677778888',
 'recipient@example.invalid','member',
 decode(repeat('ae',16),'hex'),decode(repeat('cd',32),'hex'),
 now()+interval '1 hour');
DO $token_constraints$
BEGIN
 BEGIN
  UPDATE private.ws02d_invitations SET token_digest=decode('aa','hex');
  RAISE EXCEPTION 'Invalid short token digest accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE private.ws02d_invitations SET state='accepted';
  RAISE EXCEPTION 'Acceptance without accepted actor and time allowed'
   USING ERRCODE='P9999';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE private.ws02d_invitations SET role='owner';
  RAISE EXCEPTION 'Owner invitation accepted in role enum'
   USING ERRCODE='P9999';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM private.ws02d_invitations)<>1
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Synthetic invite changed membership or audit prematurely'; END IF;
END $token_constraints$;
ROLLBACK;
DO $after$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT count(*) FROM private.ws02d_member_access)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02d_invitation_flags
    WHERE id IS TRUE AND enabled IS FALSE AND advanced_roles_enabled IS FALSE)<>1
 THEN RAISE EXCEPTION 'WS02D disposable rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D private schema default-off and denial PASS';
END $after$;
