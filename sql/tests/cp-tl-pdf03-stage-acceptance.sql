-- Isolated PostgreSQL 17 only. All fixture modifications roll back.
\set ON_ERROR_STOP on
BEGIN;
-- pg fixture owner preps verified signed synthetic accounts; no production users.
UPDATE auth.users SET email='aacsenagan@watchdogautomation.com.ph',email_confirmed_at=now()
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE auth.users SET email='asenagan@watchdogautomation.com.ph',email_confirmed_at=now()
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
UPDATE public.work_board_members SET role='viewer'
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
INSERT INTO public.work_board_items(id,board_id,group_id,title,created_by,updated_by)
 VALUES('55555555-5555-4555-8555-555555555555',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '867aeecd-ea67-4e2f-aec7-1207e2ebe20f','Q-PDF03-01',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.tradelink_documents
 (id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by)
 VALUES('66666666-6666-4666-8666-666666666666',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '00000000-0000-4000-8000-000000000001',
 '55555555-5555-4555-8555-555555555555',
 'quotation','Q-PDF03-01','submitted',3,
 '{"documentType":"quotation","documentNumber":"Q-PDF03-01",
 "verifiedByEmail":"aacsenagan@watchdogautomation.com.ph",
 "approvedByEmail":"asenagan@watchdogautomation.com.ph"}'::jsonb,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',true);
DO $order_denial$
BEGIN
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '66666666-6666-4666-8666-666666666666',3,'secondary');
  RAISE EXCEPTION 'Secondary without primary accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $order_denial$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);

SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $primary$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='66666666-6666-4666-8666-666666666666'; r jsonb;
BEGIN
 IF NOT private.tl03_can_pdf_approve(board) OR private.tl03_can_manage(board)
 THEN RAISE EXCEPTION 'Narrow reviewer capability grants manager privilege'; END IF;
 r:=public.tl03_record_pdf_approval_stage(board,doc,3,'primary');
 IF r->>'stage'<>'primary' OR r->>'actorEmail'<>'aacsenagan@watchdogautomation.com.ph'
 OR r->>'actorId'<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 OR (r->>'revision')::integer<>3 OR (r->>'recordedAt')::timestamptz>now()+interval '1 minute'
 THEN RAISE EXCEPTION 'Primary signed receipt mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(board,doc,3,'primary');
  RAISE EXCEPTION 'Duplicate primary accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(board,doc,3,'secondary');
  RAISE EXCEPTION 'Primary signed user signed secondary';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(board,doc,2,'primary');
  RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $primary$;

SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',true);
DO $secondary$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='66666666-6666-4666-8666-666666666666'; r jsonb;
BEGIN
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(board,doc,3,'primary');
  RAISE EXCEPTION 'Secondary user signed primary';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=public.tl03_record_pdf_approval_stage(board,doc,3,'secondary');
 IF r->>'stage'<>'secondary' OR r->>'actorEmail'<>'asenagan@watchdogautomation.com.ph'
 THEN RAISE EXCEPTION 'Secondary receipt mismatch'; END IF;
 r:=public.tl03_pdf_approval_stages(board,doc);
 IF jsonb_array_length(r->'stages')<>2 OR
   r->'stages'->0->>'stage'<>'primary' OR r->'stages'->1->>'stage'<>'secondary'
 THEN RAISE EXCEPTION 'Two-stage independent signed read mismatch'; END IF;
END $secondary$;
-- RLS denies direct DML/read of the private table under non-owner identity.
DO $grants$
BEGIN
 IF has_table_privilege('authenticated','private.tradelink_pdf_approval_events','SELECT') OR
   has_table_privilege('authenticated','private.tradelink_pdf_approval_events','INSERT') OR
   has_table_privilege('authenticated','private.tradelink_pdf_approval_events','UPDATE') OR
   has_table_privilege('authenticated','private.tradelink_pdf_approval_events','DELETE')
 THEN RAISE EXCEPTION 'Private approval table accidentally exposed'; END IF;
END $grants$;
-- Confirmed identity and module assignment remain independently required.
-- Change the synthetic primary actor only within this rolled-back transaction.
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $unconfirmed$
BEGIN
 BEGIN
  PERFORM public.tl03_record_pdf_approval_stage(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '66666666-6666-4666-8666-666666666666',3,'primary');
  RAISE EXCEPTION 'Unconfirmed signed account accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $unconfirmed$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.module_role_assignments SET enabled=false
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND module_id='tradelink';
SET LOCAL ROLE authenticated;
DO $module_denial$
BEGIN
 IF private.tl03_can_pdf_approve(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88')
 THEN RAISE EXCEPTION 'Disabled TradeLink module role passed reviewer guard'; END IF;
 BEGIN
  PERFORM public.tl03_pdf_approval_stages(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'Disabled module role read approval events';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $module_denial$;
RESET ROLE;
UPDATE public.module_role_assignments SET enabled=true
 WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND module_id='tradelink';
SET LOCAL ROLE authenticated;
-- A signed session that is revoked loses all approval privileges immediately.
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '5 minutes'
 WHERE id='33333333-3333-4333-8333-333333333333';
SET LOCAL ROLE authenticated;
DO $revoked$
BEGIN
 BEGIN
  PERFORM public.tl03_pdf_approval_stages(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'Revoked-session read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked$;
-- Foreign workspace and unconfirmed account cannot access PDF review.
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','44444444-4444-4444-8444-444444444444',true);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.tl03_pdf_approval_stages(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'Foreign workspace stage read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
RESET ROLE;
ROLLBACK;
