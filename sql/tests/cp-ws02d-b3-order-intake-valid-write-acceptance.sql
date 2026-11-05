-- CP-WS-02D/B3: original Order Intake financial/currency/CAS/audit contracts.
-- Disposable PostgreSQL 17, synthetic signed users, complete rollback.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.order_intake_orders)<>0
 OR (SELECT count(*) FROM public.order_intake_activity)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 OR NOT has_function_privilege('authenticated','public.order_intake_create(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.order_intake_qa_archive_once()','EXECUTE')
 THEN RAISE EXCEPTION 'Order Intake business acceptance fixture drift'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE order_b3_base ON COMMIT PRESERVE ROWS AS
 SELECT (SELECT count(*) FROM public.order_intake_orders) AS orders,
  (SELECT count(*) FROM public.order_intake_activity) AS audit,
  (SELECT count(*) FROM public.order_intake_create_idempotency) AS keys,
  (SELECT count(*) FROM private.ws02d_member_access) AS roles;
BEGIN;
CREATE TEMP TABLE order_b3_ids(key text PRIMARY KEY,id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
-- Synthetic payload is separate from any actual purchasing record.
CREATE TEMP TABLE order_b3_payload(json jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO order_b3_payload(json) VALUES(
 '{"poNumber":"B3-PO-001","clientName":"Synthetic Client",
   "poDate":"2026-11-01","dateReceived":"2026-11-02",
   "deliveryDate":"2026-11-15","poAmount":1120,
   "vatRate":12,"procurementExpenses":200,"currency":"PHP",
   "status":"Working on it","company":"Synthetic Supply",
   "industry":"Services","notes":"Disposable authorization test"}'::jsonb
);
DO $create$
DECLARE o public.order_intake_orders%ROWTYPE; payload jsonb; idempotent public.order_intake_orders%ROWTYPE; replay public.order_intake_orders%ROWTYPE;
BEGIN
 SELECT json INTO STRICT payload FROM pg_temp.order_b3_payload;
 o:=public.order_intake_create(payload);
 INSERT INTO pg_temp.order_b3_ids VALUES('primary',o.id);
 IF o.revision<>1 OR o.po_amount<>1120 OR o.vat_exclusive_amount<>1000
 OR o.vat_amount<>120 OR o.gross_profit<>800
 OR o.workspace_id<>'00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Authorized PO financial calculation or scope changed'; END IF;
 idempotent:=public.order_intake_create_idempotent(
  payload||'{"poNumber":"B3-PO-IDEMPOTENT"}'::jsonb,
  '11111111-2222-4333-8444-555555555555');
 replay:=public.order_intake_create_idempotent(
  payload||'{"poNumber":"B3-PO-IDEMPOTENT"}'::jsonb,
  '11111111-2222-4333-8444-555555555555');
 IF idempotent.id IS NULL OR replay.id IS DISTINCT FROM idempotent.id
 OR (SELECT count(*) FROM public.order_intake_orders)<>2
 OR (SELECT count(*) FROM public.order_intake_create_idempotency)<>1
 THEN RAISE EXCEPTION 'Idempotency receipt or duplicate suppression changed'; END IF;
 BEGIN
  PERFORM public.order_intake_create_idempotent(
   payload||'{"poNumber":"B3-PO-CONFLICT"}'::jsonb,
   '11111111-2222-4333-8444-555555555555');
  RAISE EXCEPTION 'Conflicting idempotency payload accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $create$;
DO $rev_update$
DECLARE o public.order_intake_orders%ROWTYPE;uid uuid;
BEGIN
 SELECT id INTO STRICT uid FROM pg_temp.order_b3_ids WHERE key='primary';
 o:=public.order_intake_update_details(uid,'{"poAmount":2240,"procurementExpenses":500}'::jsonb,1);
 IF o.revision<>2 OR o.po_amount<>2240 OR o.vat_exclusive_amount<>2000
 OR o.vat_amount<>240 OR o.gross_profit<>1500
 THEN RAISE EXCEPTION 'Authorized Order Intake financial update incorrect'; END IF;
 BEGIN
  PERFORM public.order_intake_update_details(uid,'{"notes":"stale"}'::jsonb,1);
  RAISE EXCEPTION 'Stale PO update permitted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 o:=public.order_intake_update_status(uid,'Processed',2);
 IF o.revision<>3 OR o.status<>'Processed'
 THEN RAISE EXCEPTION 'Authorized PO status transition incorrect'; END IF;
 BEGIN
  PERFORM public.order_intake_update_status(uid,'Delivered',2);
  RAISE EXCEPTION 'Stale PO status update permitted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 o:=public.order_intake_archive(uid,3);
 IF o.revision<>4 OR NOT o.archived OR o.archived_at IS NULL
 THEN RAISE EXCEPTION 'Authorized PO archive incorrect'; END IF;
 BEGIN
  PERFORM public.order_intake_archive(uid,4);
  RAISE EXCEPTION 'Double archive accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
 o:=public.order_intake_restore(uid,4);
 IF o.revision<>5 OR o.archived OR o.archived_at IS NOT NULL
 THEN RAISE EXCEPTION 'Authorized PO restore incorrect'; END IF;
 o:=public.order_intake_update_status(uid,'Closed',5);
 IF o.revision<>6 OR o.status<>'Closed' THEN
  RAISE EXCEPTION 'Closing terminal PO incorrect'; END IF;
 BEGIN
  PERFORM public.order_intake_update_status(uid,'Processed',6);
  RAISE EXCEPTION 'Terminal PO status changed after Closed' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $rev_update$;
DO $qa_restricted$
DECLARE payload jsonb;o public.order_intake_orders%ROWTYPE;
BEGIN
 SELECT json INTO STRICT payload FROM pg_temp.order_b3_payload;
 o:=public.order_intake_create(
  payload||'{"poNumber":"M19514-QA-ONLY-20261020"}'::jsonb);
 IF o.archived THEN RAISE EXCEPTION 'Fixture QA order initially archived'; END IF;
 o:=public.order_intake_qa_archive_once();
 IF NOT o.archived OR o.po_number<>'M19514-QA-ONLY-20261020'
 THEN RAISE EXCEPTION 'Restricted QA archive did not update approved fixture'; END IF;
 BEGIN
  PERFORM public.order_intake_qa_archive_once();
  RAISE EXCEPTION 'Restricted QA archive ran twice' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $qa_restricted$;
-- C's ordinary Member ceiling cannot perform manage-level archive even
-- when their platform role is elevated in this ROLLBACK-only fixture.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_manage_denied$
BEGIN
 BEGIN
  PERFORM public.order_intake_archive(
   (SELECT id FROM pg_temp.order_b3_ids WHERE key='primary'),6);
  RAISE EXCEPTION 'Workspace Member acquired order archive privilege'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $member_manage_denied$;
-- D has platform Admin in synthetic fixture but remains workspace Viewer.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer$
DECLARE payload jsonb;
BEGIN
 SELECT json INTO STRICT payload FROM pg_temp.order_b3_payload;
 BEGIN
  PERFORM public.order_intake_create(payload);
  RAISE EXCEPTION 'Scoped Viewer with platform Admin created order'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.order_intake_archive(
   (SELECT id FROM pg_temp.order_b3_ids WHERE key='primary'),6);
  RAISE EXCEPTION 'Scoped Viewer with platform Admin archived order'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $viewer$;
-- Authorized platform Admin in the other workspace must not modify home order.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE o public.order_intake_orders%ROWTYPE;payload jsonb;
BEGIN
 SELECT json INTO STRICT payload FROM pg_temp.order_b3_payload;
 o:=public.order_intake_create(payload||'{"poNumber":"B3-FOREIGN-PO"}'::jsonb);
 IF o.workspace_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Foreign platform Admin wrote outside their workspace'; END IF;
 BEGIN
  PERFORM public.order_intake_update_status(
   (SELECT id FROM pg_temp.order_b3_ids WHERE key='primary'),'Delivered',6);
  RAISE EXCEPTION 'Foreign platform Admin updated a home-workspace PO'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.order_intake_create(
   (SELECT json FROM pg_temp.order_b3_payload));
  RAISE EXCEPTION 'Expired signed platform Admin created PO'
   USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF;
 END;
END $expired$;
DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.order_intake_orders)<>4
 OR (SELECT count(*) FROM public.order_intake_activity)<>10
 OR (SELECT count(*) FROM public.order_intake_activity
    WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>9
 OR (SELECT count(*) FROM public.order_intake_activity
    WHERE workspace_id='00000000-0000-4000-8000-000000000002')<>1
 OR (SELECT count(*) FROM public.order_intake_create_idempotency)<>1
 THEN RAISE EXCEPTION 'Order Intake audit, idempotency or workspace integrity wrong'; END IF;
END $audit$;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.order_b3_base;
 IF (SELECT count(*) FROM public.order_intake_orders)<>b.orders
 OR (SELECT count(*) FROM public.order_intake_activity)<>b.audit
 OR (SELECT count(*) FROM public.order_intake_create_idempotency)<>b.keys
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Order Intake disposable acceptance rollback failed'; END IF;
 RAISE NOTICE 'WS02D/B3 seven Order Intake original write RPCs valid/denied PASS';
END $rollback$;
DROP TABLE pg_temp.order_b3_base;
