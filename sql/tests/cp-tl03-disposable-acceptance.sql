-- CP-TL-03A: disposable-only signed CRUD/CAS/RLS/session/board acceptance.
-- Requires cp-tl03-disposable-setup.sql + cp-tl03-staged-domain.sql in fresh Postgres17.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',false);
DO $accept$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='99999999-9999-4999-8999-999999999999';
 payload jsonb:='{"documentType":"quotation","documentNumber":"Q-0001","currency":"PHP","vatType":"12","customerName":"Disposable Customer","items":[{"id":"line-1","kind":"item","description":"Test only","quantity":2,"unit":"pc","unitPrice":100}]}'::jsonb;
 modified jsonb;
 r jsonb;
BEGIN
 IF has_table_privilege('authenticated','public.tradelink_documents','INSERT')
   OR has_table_privilege('authenticated','public.tradelink_documents','UPDATE')
   OR has_table_privilege('authenticated','public.tradelink_documents','DELETE')
   OR has_table_privilege('authenticated','public.tradelink_document_events','INSERT')
   OR has_table_privilege('anon','public.tradelink_documents','SELECT') THEN
  RAISE EXCEPTION 'Direct grants exceed intended role'; END IF;
 r:=public.tl03_document_commit(board,doc,0,'create',payload);
 IF r->>'operation'<>'create' OR (r->>'revision')::int<>1
  OR r->>'state'<>'draft' OR coalesce((r->>'idempotent')::boolean,true)
  OR (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>1
  OR pg_catalog.jsonb_array_length(public.tl03_documents_list(board,50))<>1
  OR public.tl03_document_read(board,doc)->>'document_number'<>'Q-0001' THEN
  RAISE EXCEPTION 'Draft create, board link, audit or signed read failed'; END IF;
 r:=public.tl03_document_commit(board,doc,0,'create',payload);
 IF r->>'idempotent'<>'true' OR
  (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>1 OR
  (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>1 THEN
  RAISE EXCEPTION 'Idempotent retry duplicated state'; END IF;
 modified:=jsonb_set(payload,'{documentNumber}','"Q-0002"'::jsonb);
 r:=public.tl03_document_commit(board,doc,1,'update',modified);
 IF (r->>'revision')::int<>2 OR
  NOT EXISTS(SELECT 1 FROM public.work_board_items i
    JOIN public.tradelink_documents d ON d.board_item_id=i.id
    WHERE i.id=(r->>'boardItemId')::uuid AND i.title='Q-0002' AND i.archived_at IS NULL
      AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by) THEN
  RAISE EXCEPTION 'Draft CAS update, Board title or timestamp projection failed'; END IF;
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,1,'update',modified);
  RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,0,'create',payload);
  RAISE EXCEPTION 'Changed draft accepted as idempotent create';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,2,'update',
   modified||'{"workflow":{"state":"approved"}}'::jsonb);
  RAISE EXCEPTION 'Forged workflow accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,2,NULL,NULL);
  RAISE EXCEPTION 'NULL command accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,2,'update',
   modified||'{"items":[{"id":"line-1","kind":"item","quantity":1,"unitPrice":4,"unit":{}}]}'::jsonb);
  RAISE EXCEPTION 'Malformed source item accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Verify a same-title, content-only edit updates Board time. Roll back
 -- only this positive probe so the original fixture's 2→3→4 CAS remains intact.
 DECLARE
  old_board_modified timestamptz;
  new_board_modified timestamptz;
 BEGIN
  SELECT updated_at INTO old_board_modified FROM public.work_board_items
   WHERE id=(r->>'boardItemId')::uuid;
  PERFORM public.tl03_document_commit(board,doc,2,'update',
   jsonb_set(modified,'{remarks}','"Changed notes"'::jsonb));
  SELECT i.updated_at INTO new_board_modified FROM public.work_board_items i
   JOIN public.tradelink_documents d ON d.board_item_id=i.id WHERE d.id=doc;
  IF new_board_modified<=old_board_modified OR
    NOT EXISTS(SELECT 1 FROM public.work_board_items i
      JOIN public.tradelink_documents d ON d.board_item_id=i.id WHERE d.id=doc
       AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by
       AND d.content->>'remarks'='Changed notes')
   THEN RAISE EXCEPTION 'Same-title Draft update failed Board time synchronization'; END IF;
  RAISE EXCEPTION 'ROLLBACK_PROBE' USING ERRCODE='P0001';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'ROLLBACK_PROBE' THEN RAISE; END IF;
 END;
 r:=public.tl03_document_commit(board,doc,2,'archive',NULL);
 IF (r->>'revision')::int<>3 OR
   NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE id=(r->>'boardItemId')::uuid
     AND archived_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Reversible archive failed'; END IF;
 r:=public.tl03_document_commit(board,doc,3,'restore',NULL);
 IF (r->>'revision')::int<>4 OR
   NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE id=(r->>'boardItemId')::uuid
     AND archived_at IS NULL) OR
   (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>4 THEN
  RAISE EXCEPTION 'Reversible restore or monotonic audit failed'; END IF;
 RAISE NOTICE 'CP-TL-03A General Manager draft create/retry/CAS/archive/restore/audit PASS';
END $accept$;
-- Module User with board owner is denied despite manage permission.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',false);
DO $denied$
BEGIN
 BEGIN
  PERFORM public.tl03_documents_list('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',10);
  RAISE EXCEPTION 'User role could read sensitive documents';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','99999999-9999-4999-8999-999999999999',
   4,'archive',NULL);
  RAISE EXCEPTION 'User role could mutate documents';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
-- GM module with editor board role is also denied.
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.session_id','33333333-3333-4333-8333-333333333333',false);
DO $editor$
BEGIN
 BEGIN
  PERFORM public.tl03_documents_list('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',10);
  RAISE EXCEPTION 'Module GM bypassed board manage';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $editor$;
-- Active foreign workspace GM is denied despite same module label.
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.jwt.claim.session_id','44444444-4444-4444-8444-444444444444',false);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.tl03_document_read(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','99999999-9999-4999-8999-999999999999');
  RAISE EXCEPTION 'Cross-workspace read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
-- Revoke active session using disposable postgres role, not a real user.
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 hour'
 WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',false);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.tl03_documents_list('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',10);
  RAISE EXCEPTION 'Expired session could read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
RESET ROLE;
DELETE FROM auth.sessions WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $revoked$
BEGIN
 BEGIN
  PERFORM public.tl03_document_commit(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','99999999-9999-4999-8999-999999999999',
   4,'archive',NULL);
  RAISE EXCEPTION 'Revoked session could archive';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked$;
RESET ROLE;
DO $audit$
BEGIN
 BEGIN
  UPDATE public.tradelink_document_events SET metadata='{}'::jsonb;
  RAISE EXCEPTION 'Authoritative event mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.tradelink_document_events)<>4
   OR (SELECT count(*) FROM public.tradelink_documents)<>1
   OR (SELECT count(*) FROM public.work_board_items)<>1 THEN
  RAISE EXCEPTION 'Denial tests mutated authoritative records'; END IF;
 RAISE NOTICE 'CP-TL-03A role ceilings, foreign scope, expired/revoked session, immutable audit PASS';
END $audit$;

-- Owner of the TradeLink board but WITHOUT a module-role assignment.
-- This is not the same as the explicit 'User' assignment tested above.
RESET ROLE;
INSERT INTO auth.users(id) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff');
INSERT INTO public.profiles(id,status) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','active');
INSERT INTO public.workspace_members(workspace_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff');
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','ffffffff-ffff-4fff-8fff-ffffffffffff','owner');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('55555555-5555-4555-8555-555555555555','ffffffff-ffff-4fff-8fff-ffffffffffff');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',false);
SELECT set_config('request.jwt.claim.session_id','55555555-5555-4555-8555-555555555555',false);
DO $unassigned$
BEGIN
 IF private.tl03_can_manage('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88') IS DISTINCT FROM FALSE THEN
  RAISE EXCEPTION 'Missing module assignment should yield definite FALSE'; END IF;
 IF (SELECT count(*) FROM public.tradelink_documents)>0 THEN
  RAISE EXCEPTION 'Unassigned role could read via table RLS'; END IF;
 BEGIN
  PERFORM public.tl03_documents_list('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',10);
  RAISE EXCEPTION 'Unassigned role could read via RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '99999999-9999-4999-8999-999999999999',4,'archive',NULL);
  RAISE EXCEPTION 'Unassigned role could commit';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'CP-TL-03A absent module role with board owner denied';
END $unassigned$;
RESET ROLE;
