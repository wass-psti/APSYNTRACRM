-- Combined WS02D + WS11 + delivery ledger acceptance, synthetic sessions only.
-- Requires existing disposable workspace_disposable fixture; all writes rollback.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
    OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
    OR to_regprocedure('private.ws02d_accept(text)') IS NULL
    OR to_regprocedure('private.ws11_list_invitations(uuid)') IS NULL
    OR to_regprocedure('private.ws11_revoke_invitation(uuid,uuid)') IS NULL
    OR to_regprocedure('private.ws02d_delivery_prepare(uuid,uuid,uuid)') IS NULL
    OR to_regprocedure('private.ws02d_delivery_record(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('private.ws02d_delivery_list(uuid)') IS NULL
    OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
    OR (SELECT count(*) FROM private.ws02d_invitations)<>0
    OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'WS02D integrated lifecycle requires inactive disposable fixture'; END IF;
END $preflight$;
BEGIN;
CREATE TEMP TABLE ws02d_integrated_receipts(kind text PRIMARY KEY, id uuid, token text) ON COMMIT DROP;
UPDATE auth.users SET email='owner@example.invalid' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE auth.users SET email='recipient@example.invalid' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id;
DO $issue_and_list$
DECLARE r jsonb; prep jsonb; delivered jsonb; listing jsonb; d jsonb; id uuid;
BEGIN
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'Recipient@Example.Invalid','member','01111111-1111-4111-8111-111111111111');
 id:=(r->>'invitationId')::uuid;
 INSERT INTO pg_temp.ws02d_integrated_receipts VALUES('accept',id,r->>'token');
 prep:=private.ws02d_delivery_prepare('00000000-0000-4000-8000-000000000001',id,
   '01111111-1111-4111-8111-111111111111');
 IF prep->>'deliveryState'<>'prepared' THEN RAISE EXCEPTION 'Delivery ledger not prepared'; END IF;
 delivered:=private.ws02d_delivery_record('00000000-0000-4000-8000-000000000001',id,
  'submitted','synthetic_provider_01');
 listing:=private.ws11_list_invitations('00000000-0000-4000-8000-000000000001');
 d:=private.ws02d_delivery_list('00000000-0000-4000-8000-000000000001');
 IF listing->>'authorized'<>'true'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'invitations') x
    WHERE x->>'id'=id::text AND x->>'state'='pending' AND x->>'role'='member')
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'delivery') x
    WHERE x->>'invitationId'=id::text AND x->>'deliveryState'='submitted')
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 THEN RAISE EXCEPTION 'Pending manager/delivery readback or premature membership failed'; END IF;
 -- Stable request ID must never yield another bearer token or provider email.
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'recipient@example.invalid','member','01111111-1111-4111-8111-111111111111');
 IF r->>'idempotent'<>'true' OR r ? 'token' THEN RAISE EXCEPTION 'Replay leaked invite token'; END IF;
END $issue_and_list$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $recipient_accept$
DECLARE r jsonb;
BEGIN
 r:=private.ws02d_accept((SELECT token FROM pg_temp.ws02d_integrated_receipts WHERE kind='accept'));
 IF r->>'state'<>'accepted' OR r->>'switched'<>'false'
  OR (SELECT count(*) FROM public.workspace_members WHERE workspace_id='00000000-0000-4000-8000-000000000001'
      AND user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND active)<>1
  OR public.current_workspace_id('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM
     '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Signed recipient acceptance did not persist exact workspace / no-switch'; END IF;
 BEGIN
  PERFORM private.ws02d_accept((SELECT token FROM pg_temp.ws02d_integrated_receipts WHERE kind='accept'));
  RAISE EXCEPTION 'Single-use acceptance replay succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $recipient_accept$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $manager_revoke$
DECLARE r jsonb; listing jsonb; revoked jsonb; id uuid;
BEGIN
 listing:=private.ws11_list_invitations('00000000-0000-4000-8000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'invitations') x
  WHERE x->>'id'=(SELECT receipt.id::text FROM pg_temp.ws02d_integrated_receipts AS receipt WHERE receipt.kind='accept')
   AND x->>'state'='accepted')
 THEN RAISE EXCEPTION 'Manager does not observe accepted state'; END IF;
 r:=private.ws02d_issue('00000000-0000-4000-8000-000000000001',
   'cancel@example.invalid','member','02222222-2222-4222-8222-222222222222');
 id:=(r->>'invitationId')::uuid;
 revoked:=private.ws11_revoke_invitation('00000000-0000-4000-8000-000000000001',id);
 IF revoked->>'state'<>'revoked' THEN RAISE EXCEPTION 'Manager revoke receipt invalid'; END IF;
 listing:=private.ws11_list_invitations('00000000-0000-4000-8000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'invitations') x
  WHERE x->>'id'=id::text AND x->>'state'='revoked')
 THEN RAISE EXCEPTION 'Manager revoked status not persisted'; END IF;
END $manager_revoke$;
ROLLBACK;
DO $post$
BEGIN
 IF (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_delivery)<>0
  OR (SELECT count(*) FROM private.ws02d_invitation_events)<>0
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Disposable invitation workflow left unexpected persisted state'; END IF;
 RAISE NOTICE 'CP_CRM_WORKSPACE_INVITE_01_INTEGRATED_LIFECYCLE_PASS';
END $post$;
