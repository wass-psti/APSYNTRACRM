-- CP-WS-02D/B3: six staged ORIGINAL TradeLink business entrypoints.
-- Synthetic attachments/storage only, disposable PG17, no actual object deletion.
\set ON_ERROR_STOP on
DO $pre$ BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.tradelink_vendor_assets)<>0
 OR (SELECT count(*) FROM public.tradelink_attachment_reconciliation)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'TradeLink positive test requires empty disposable fixture' USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE tradelink_b3_baseline ON COMMIT PRESERVE ROWS AS SELECT
 (SELECT count(*) FROM public.tradelink_vendor_assets) AS assets,
 (SELECT count(*) FROM public.tradelink_attachment_reconciliation) AS candidates,
 (SELECT count(*) FROM public.tradelink_attachment_cleanup_audit) AS audits,
 (SELECT count(*) FROM public.tradelink_cleanup_reference_fences) AS fences,
 (SELECT count(*) FROM public.module_state_entries) AS states,
 (SELECT count(*) FROM storage.objects) AS stored_objects,
 (SELECT count(*) FROM private.ws02d_member_access) AS scoped_roles;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
CREATE TEMP TABLE tradelink_b3_key(storage_key text NOT NULL) ON COMMIT DROP;
INSERT INTO tradelink_b3_key(storage_key)
VALUES('00000000-0000-4000-8000-000000000001/fixture/unused-image.png');
INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by)
VALUES('00000000-0000-4000-8000-000000000001',
 'tradelink','tradelink_state_v1','shared','*','{"attachments":[]}',1,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO storage.objects(bucket_id,name)
SELECT 'tradelink-attachments',storage_key FROM pg_temp.tradelink_b3_key;
-- TradeLink Report is an 'edit' permission, available to a scoped member with
-- a valid TradeLink module right, without granting cleanup privilege.
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_report$
DECLARE state text; key text;
BEGIN
 SELECT storage_key INTO STRICT key FROM pg_temp.tradelink_b3_key;
 state:=public.tradelink_reconciliation_report(key,'attachment-b3-1','commit-uncertain');
 IF state<>'pending' OR (SELECT count(*) FROM public.tradelink_attachment_reconciliation
   WHERE storage_key=key AND workspace_id='00000000-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'Member TradeLink report not persisted'; END IF;
 state:=public.tradelink_reconciliation_report(key,'attachment-b3-1','cleanup-failed');
 IF state<>'pending' OR (SELECT reason FROM public.tradelink_attachment_reconciliation
  WHERE storage_key=key)<>'cleanup-failed'
 OR (SELECT count(*) FROM public.tradelink_attachment_reconciliation)<>1
 THEN RAISE EXCEPTION 'TradeLink report replay update not idempotent'; END IF;
 BEGIN
  PERFORM public.tradelink_reconciliation_report(
    '00000000-0000-4000-8000-000000000002/foreign.png','attachment-b3-1','commit-uncertain');
  RAISE EXCEPTION 'Member reported foreign workspace key' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(key);
  RAISE EXCEPTION 'Workspace Member assessed cleanup without manage role' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $member_report$;
-- Existing platform administrator A retains domain authorization and manage
-- upper bound; do not grant manage to Member C through module access alone.
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $asset$
DECLARE r bigint;
BEGIN
 r:=public.tradelink_asset_write('vendor-b3','logo','data:image/png;base64,YWJj',0);
 IF r<>1 OR (SELECT image_data FROM public.tradelink_vendor_assets
  WHERE vendor_id='vendor-b3')<>'data:image/png;base64,YWJj'
 THEN RAISE EXCEPTION 'TradeLink image asset write failed'; END IF;
 BEGIN
  PERFORM public.tradelink_asset_write('vendor-b3','logo','data:image/png;base64,YWJj',0);
  RAISE EXCEPTION 'Stale TradeLink asset revision accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 r:=public.tradelink_asset_write('vendor-b3','logo',NULL,1);
 IF r<>0 OR (SELECT count(*) FROM public.tradelink_vendor_assets WHERE vendor_id='vendor-b3')<>0
 THEN RAISE EXCEPTION 'CAS-bound asset removal failed'; END IF;
END $asset$;
DO $assess_cleanup$
DECLARE key text; status_text text;rev bigint; present boolean;rid uuid;d text;
 fence_expiry timestamptz;deletion boolean;released boolean;
BEGIN
 SELECT storage_key INTO STRICT key FROM pg_temp.tradelink_b3_key;
 SELECT a.status,a.workspace_revision,a.storage_object_present
 INTO status_text,rev,present
 FROM public.tradelink_reconciliation_assess(key) a;
 IF status_text<>'unreferenced-at-revision' OR rev<>1 OR NOT present
  OR (SELECT status FROM public.tradelink_attachment_reconciliation
      WHERE storage_key=key)<>'unreferenced-at-revision'
 THEN RAISE EXCEPTION 'TradeLink reconciliation assessment drift'; END IF;
 SELECT c.request_id,c.decision,c.observed_revision,c.deletion_enabled
 INTO rid,d,rev,deletion
 FROM public.tradelink_reconciliation_request_cleanup(key,1) c;
 IF rid IS NULL OR d<>'blocked:unreferenced-at-locked-revision'
  OR rev<>1 OR deletion IS DISTINCT FROM false
  OR (SELECT count(*) FROM public.tradelink_attachment_cleanup_audit
    WHERE workspace_id='00000000-0000-4000-8000-000000000001'
      AND request_id=rid AND execution_status='blocked')<>1
 THEN RAISE EXCEPTION 'TradeLink cleanup request violated no-deletion boundary'; END IF;
 SELECT f.decision,f.expires_at,f.deletion_enabled
 INTO d,fence_expiry,deletion
 FROM public.tradelink_cleanup_fence_activate(key,1) f;
 IF d<>'blocked:grace-period' OR deletion IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'TradeLink grace-period guard failed'; END IF;
 UPDATE public.tradelink_attachment_reconciliation
 SET created_at=now()-interval '25 hours' WHERE storage_key=key;
 SELECT f.decision,f.expires_at,f.deletion_enabled
 INTO d,fence_expiry,deletion
 FROM public.tradelink_cleanup_fence_activate(key,1) f;
 IF d<>'fenced:review-only' OR fence_expiry<=now()
  OR deletion IS DISTINCT FROM false
  OR (SELECT count(*) FROM public.tradelink_cleanup_reference_fences
    WHERE storage_key=key)<>1
 THEN RAISE EXCEPTION 'TradeLink 30-second review fence not recorded'; END IF;
 released:=public.tradelink_cleanup_fence_release(key);
 IF NOT released OR public.tradelink_cleanup_fence_release(key)
  OR (SELECT count(*) FROM public.tradelink_cleanup_reference_fences)<>0
 THEN RAISE EXCEPTION 'TradeLink fence release/idempotent replay incorrect'; END IF;
 -- Security property: all cleanup operations are review-only; no storage deletion.
 IF (SELECT count(*) FROM storage.objects WHERE name=key)<>1
 THEN RAISE EXCEPTION 'TradeLink cleanup removed a storage object'; END IF;
END $assess_cleanup$;
-- Give C workspace Admin maximum but not module/portfolio Admin: underlying
-- operational Admin check must still deny cleanup (no OR grant).
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
UPDATE private.ws02d_member_access SET role='admin'
 WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $scope_not_grant$
DECLARE key text;
BEGIN
 SELECT storage_key INTO STRICT key FROM pg_temp.tradelink_b3_key;
 BEGIN
  PERFORM public.tradelink_reconciliation_assess(key);
  RAISE EXCEPTION 'Workspace Admin elevated to TradeLink Admin by ceiling'
    USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'TradeLink administrator authorization required' THEN RAISE; END IF; END;
END $scope_not_grant$;
-- D can have legacy platform Admin in the fixture but must not escape a
-- scoped Viewer upper bound, for both edit and manage operations.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer$
DECLARE key text;
BEGIN
 SELECT storage_key INTO STRICT key FROM pg_temp.tradelink_b3_key;
 BEGIN
  PERFORM public.tradelink_asset_write('vendor-b3','logo','data:image/png;base64,YWJj',0);
  RAISE EXCEPTION 'Workspace Viewer wrote TradeLink asset' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.tradelink_reconciliation_report(key,'attachment-b3-1','cleanup-failed');
  RAISE EXCEPTION 'Workspace Viewer wrote TradeLink reconciliation report' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(key);
  RAISE EXCEPTION 'Workspace Viewer released TradeLink fence' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $viewer$;
-- B belongs to second workspace. Even given platform Admin solely in the
-- rollback test, it cannot change workspace 1's candidates.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE key text;
BEGIN
 SELECT storage_key INTO STRICT key FROM pg_temp.tradelink_b3_key;
 BEGIN
  PERFORM public.tradelink_cleanup_fence_release(key);
  RAISE EXCEPTION 'Foreign signed Admin released other workspace fence' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.tradelink_asset_write('vendor-b3','logo','data:image/png;base64,YWJj',0);
  RAISE EXCEPTION 'Expired TradeLink Admin wrote asset' USING ERRCODE='P9999';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM<>'WS02D_B3_WORKSPACE_CEILING_DENIED' THEN RAISE; END IF; END;
END $expired$;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.tradelink_b3_baseline;
 IF (SELECT count(*) FROM public.tradelink_vendor_assets)<>b.assets
 OR (SELECT count(*) FROM public.tradelink_attachment_reconciliation)<>b.candidates
 OR (SELECT count(*) FROM public.tradelink_attachment_cleanup_audit)<>b.audits
 OR (SELECT count(*) FROM public.tradelink_cleanup_reference_fences)<>b.fences
 OR (SELECT count(*) FROM public.module_state_entries)<>b.states
 OR (SELECT count(*) FROM storage.objects)<>b.stored_objects
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.scoped_roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'TradeLink six-path fixture not fully rolled back'; END IF;
 RAISE NOTICE 'WS02D/B3 TradeLink 6 source-preserved valid/denied operational paths PASS';
END $rollback$;
DROP TABLE pg_temp.tradelink_b3_baseline;
