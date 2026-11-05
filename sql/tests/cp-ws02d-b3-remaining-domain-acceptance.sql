-- CP-WS-02D/B3 — disposable-only denial regression against source-preserved RPCs.
\set ON_ERROR_STOP on
DO $gate$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR to_regprocedure('public.tradelink_reconciliation_report(text,text,text)') IS NULL
 OR to_regprocedure('public.charter_admin_set_role(uuid,text,boolean)') IS NULL
 THEN RAISE EXCEPTION 'B3 remaining-domain acceptance requires isolated disabled fixture'
 USING ERRCODE='42501'; END IF;
END $gate$;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role)
VALUES
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer'),
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_denied$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_report('wrong','id','commit-uncertain');
  RAISE EXCEPTION 'Viewer bypassed edit ceiling' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $viewer_denied$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_manage_denied$
BEGIN
 BEGIN
  PERFORM public.charter_admin_set_role(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
  RAISE EXCEPTION 'Member bypassed manage ceiling' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $member_manage_denied$;
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
WHERE id='cccccccc-0000-4000-8000-000000000003';
SET ROLE authenticated;
DO $expired_denied$
BEGIN
 BEGIN
  PERFORM public.tradelink_reconciliation_report('wrong','id','commit-uncertain');
  RAISE EXCEPTION 'Expired session bypassed edit ceiling' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $expired_denied$;
RESET ROLE;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT not_after<now() FROM auth.sessions
     WHERE id='cccccccc-0000-4000-8000-000000000003')
 THEN RAISE EXCEPTION 'Remaining-domain role/session rollback incomplete'; END IF;
 RAISE NOTICE 'WS02D/B3 role ceiling source-preserved edit/manage and expired-session denial PASS';
END $rollback$;
