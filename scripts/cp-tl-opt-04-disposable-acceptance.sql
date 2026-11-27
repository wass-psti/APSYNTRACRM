\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_actor uuid) RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT CASE WHEN p_actor IS NULL THEN NULL ELSE '00000000-0000-4000-8000-000000000001'::uuid END $$;
CREATE OR REPLACE FUNCTION private.tl03_can_view_documents(p_board_id uuid) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT auth.uid() IS NOT NULL AND p_board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid $$;

CREATE TABLE public.tradelink_documents (
 id uuid PRIMARY KEY,board_id uuid NOT NULL,workspace_id uuid NOT NULL,board_item_id uuid NOT NULL,
 document_type text NOT NULL,document_number text NOT NULL,workflow_state text NOT NULL,
 revision bigint NOT NULL,content jsonb NOT NULL,created_by uuid NOT NULL,updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,archived_at timestamptz,deleted_at timestamptz
);
CREATE TABLE private.tradelink_document_revision_snapshots (
 document_id uuid NOT NULL,board_id uuid NOT NULL,workspace_id uuid NOT NULL,board_item_id uuid NOT NULL,
 document_type text NOT NULL,document_number text NOT NULL,workflow_state text NOT NULL,
 revision bigint NOT NULL,content jsonb NOT NULL,created_by uuid NOT NULL,updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,archived_at timestamptz,
 revision_at timestamptz NOT NULL,snapshot_source text NOT NULL,captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(document_id,revision)
);
CREATE OR REPLACE FUNCTION private.tl03_test_capture_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO private.tradelink_document_revision_snapshots (
  document_id,board_id,workspace_id,board_item_id,document_type,document_number,workflow_state,
  revision,content,created_by,updated_by,created_at,updated_at,archived_at,revision_at,snapshot_source
 ) VALUES (NEW.id,NEW.board_id,NEW.workspace_id,NEW.board_item_id,NEW.document_type,NEW.document_number,
  NEW.workflow_state,NEW.revision,NEW.content,NEW.created_by,NEW.updated_by,NEW.created_at,NEW.updated_at,
  NEW.archived_at,NEW.updated_at,'captured') ON CONFLICT(document_id,revision) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER tl03_document_revision_snapshot_insert AFTER INSERT ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_test_capture_revision();
CREATE TRIGGER tl03_document_revision_snapshot_update AFTER UPDATE OF revision ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_test_capture_revision();

INSERT INTO public.tradelink_documents (
 id,board_id,workspace_id,board_item_id,document_type,document_number,workflow_state,revision,
 content,created_by,updated_by,created_at,updated_at
)
SELECT ('00000000-0000-4000-8000-'||pg_catalog.lpad(n::text,12,'0'))::uuid,
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid,'00000000-0000-4000-8000-000000000001'::uuid,
 ('11111111-1111-4111-8111-'||pg_catalog.lpad(n::text,12,'0'))::uuid,
 CASE n%6 WHEN 0 THEN 'esi' WHEN 1 THEN 'packing' WHEN 2 THEN 'delivery' WHEN 3 THEN 'payment' WHEN 4 THEN 'quotation' ELSE 'po' END,
 CASE n%6 WHEN 0 THEN 'ESI-' WHEN 1 THEN 'PL-' WHEN 2 THEN 'DR-' WHEN 3 THEN 'AR-' WHEN 4 THEN 'Q-' ELSE 'PO-' END||'OPT04-'||n,
 'approved',CASE WHEN n<=19 OR n=43 THEN 2 ELSE 1 END,
 jsonb_build_object(
  'documentType',CASE n%6 WHEN 0 THEN 'esi' WHEN 1 THEN 'packing' WHEN 2 THEN 'delivery' WHEN 3 THEN 'payment' WHEN 4 THEN 'quotation' ELSE 'po' END,
  'documentNumber',CASE n%6 WHEN 0 THEN 'ESI-' WHEN 1 THEN 'PL-' WHEN 2 THEN 'DR-' WHEN 3 THEN 'AR-' WHEN 4 THEN 'Q-' ELSE 'PO-' END||'OPT04-'||n,
  'vendorId',CASE WHEN n<=28 THEN CASE n%3 WHEN 0 THEN 'watchdog-sales' WHEN 1 THEN 'watchdog-opc' ELSE 'plc-systems' END ELSE NULL END,
  'templateId',CASE WHEN n<=28 THEN CASE n%3 WHEN 0 THEN 'watchdog-sales-reference-v1' WHEN 1 THEN 'watchdog-opc-reference-v1' ELSE 'plc-systems-reference-v1' END ELSE NULL END,
  'terms',CASE WHEN n%2=0 THEN 'CP-TL-OPT-04-LEGACY-TERMS-'||n ELSE NULL END,'items','[]'::jsonb
 ),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 '2026-11-01T00:00:00Z'::timestamptz,'2026-11-02T00:00:00Z'::timestamptz
FROM generate_series(1,43) AS n;

INSERT INTO private.tradelink_document_revision_snapshots (
 document_id,board_id,workspace_id,board_item_id,document_type,document_number,workflow_state,
 revision,content,created_by,updated_by,created_at,updated_at,archived_at,revision_at,snapshot_source
)
SELECT d.id,d.board_id,d.workspace_id,d.board_item_id,d.document_type,d.document_number,d.workflow_state,1,
 CASE WHEN n=43 THEN d.content ELSE jsonb_set(d.content,'{terms}',to_jsonb('CP-TL-OPT-04-OLD-REVISION-TERMS-'||n),true) END,
 d.created_by,d.updated_by,d.created_at,d.created_at,d.archived_at,d.created_at,'baseline'
FROM public.tradelink_documents d
JOIN generate_series(1,43) AS n
 ON d.id=('00000000-0000-4000-8000-'||pg_catalog.lpad(n::text,12,'0'))::uuid
WHERE n<=19 OR n=43;

\ir ../supabase/migrations/20261127120000_cp_tl_opt_04_document_template_render_snapshots.sql

SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $assert$
DECLARE v_count bigint;v_derived bigint;v_defaulted bigint;v_value jsonb;
 v_new_id uuid:='99999999-9999-4999-8999-999999999991'::uuid;
 v_actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
 v_board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid;
 v_workspace uuid:='00000000-0000-4000-8000-000000000001'::uuid;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE snapshot_source='legacy-derived'),
  count(*) FILTER(WHERE snapshot_source='legacy-defaulted')
 INTO v_count,v_derived,v_defaulted FROM private.tradelink_document_render_snapshots;
 IF v_count<>63 OR v_derived<>47 OR v_defaulted<>16 THEN
  RAISE EXCEPTION 'Historical backfill mismatch: total %, derived %, defaulted %',v_count,v_derived,v_defaulted;
 END IF;
 SELECT render_snapshot INTO v_value FROM private.tradelink_document_render_snapshots
 WHERE document_id='00000000-0000-4000-8000-000000000001'::uuid AND revision=1;
 IF v_value->>'terms'<>'CP-TL-OPT-04-OLD-REVISION-TERMS-1'
  OR v_value->'company'->>'id'<>'watchdog-opc'
  OR v_value->'template'->>'version'<>'v1.42.0' THEN
  RAISE EXCEPTION 'Historical revision 1 did not retain its exact profile, template and terms';
 END IF;
 SELECT render_snapshot INTO v_value FROM private.tradelink_document_render_snapshots
 WHERE document_id='00000000-0000-4000-8000-000000000029'::uuid AND revision=1;
 IF v_value->>'snapshotSource'<>'legacy-defaulted' OR v_value->'company'->>'id'<>'watchdog-sales'
  OR v_value->>'termsSource'<>'legacy-defaulted' THEN
  RAISE EXCEPTION 'Legacy defaulted revision was not explicitly classified';
 END IF;

 INSERT INTO public.tradelink_documents (
  id,board_id,workspace_id,board_item_id,document_type,document_number,workflow_state,revision,
  content,created_by,updated_by,created_at,updated_at
 ) VALUES (v_new_id,v_board,v_workspace,'99999999-9999-4999-8999-999999999992'::uuid,
  'quotation','Q-OPT04-NEW-001','for-approval',1,
  jsonb_build_object('documentType','quotation','documentNumber','Q-OPT04-NEW-001',
   'vendorId','watchdog-opc','templateId','watchdog-opc-reference-v1',
   'terms','CP-TL-OPT-04-NEW-REVISION-ONE','items','[]'::jsonb),
  v_actor,v_actor,clock_timestamp(),clock_timestamp());
 UPDATE public.tradelink_documents SET revision=2,
  content=jsonb_set(content,'{terms}',to_jsonb('CP-TL-OPT-04-NEW-REVISION-TWO'::text),true),
  updated_at=clock_timestamp() WHERE id=v_new_id;

 SELECT public.tl04_document_render_snapshot(v_board,v_new_id,1) INTO v_value;
 IF v_value->>'revision'<>'1' OR v_value->'snapshot'->>'terms'<>'CP-TL-OPT-04-NEW-REVISION-ONE'
  OR v_value->'snapshot'->'company'->>'id'<>'watchdog-opc'
  OR v_value->'snapshot'->>'snapshotSource'<>'captured' THEN
  RAISE EXCEPTION 'New revision 1 rendering snapshot was not preserved';
 END IF;
 SELECT public.tl04_document_render_snapshot(v_board,v_new_id,2) INTO v_value;
 IF v_value->>'revision'<>'2' OR v_value->'snapshot'->>'terms'<>'CP-TL-OPT-04-NEW-REVISION-TWO' THEN
  RAISE EXCEPTION 'New revision 2 did not receive its own rendering snapshot';
 END IF;

 BEGIN
  UPDATE private.tradelink_company_profile_versions SET profile=profile||jsonb_build_object('name','mutated')
  WHERE profile_id='watchdog-sales';
  RAISE EXCEPTION 'Company profile update unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
  DELETE FROM private.tradelink_template_versions WHERE template_id='watchdog-sales-reference-v1';
  RAISE EXCEPTION 'Template version deletion unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
  UPDATE private.tradelink_document_render_snapshots
  SET render_snapshot=render_snapshot||jsonb_build_object('terms','mutated')
  WHERE document_id=v_new_id AND revision=1;
  RAISE EXCEPTION 'Render snapshot update unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN
  DELETE FROM private.tradelink_document_render_snapshots
  WHERE document_id=v_new_id AND revision=1;
  RAISE EXCEPTION 'Render snapshot deletion unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;

 IF NOT has_function_privilege('authenticated','public.tl04_document_render_snapshot(uuid,uuid,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.tl04_document_render_snapshot(uuid,uuid,bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'Render snapshot RPC grants differ from the signed document-read contract';
 END IF;
END
$assert$;

DO $signed_read$
DECLARE v_value jsonb;
BEGIN
 v_value:=public.tl04_document_render_snapshot('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid,
  '99999999-9999-4999-8999-999999999991'::uuid,1);
 IF v_value->>'revision'<>'1' OR v_value->'snapshot'->>'terms'<>'CP-TL-OPT-04-NEW-REVISION-ONE' THEN
  RAISE EXCEPTION 'Signed historical render snapshot RPC readback failed';
 END IF;
END
$signed_read$;

DO $versioning$
DECLARE v_value jsonb;
BEGIN
 INSERT INTO private.tradelink_company_profile_versions
  (profile_id,profile_version,profile,source_template_version)
 VALUES ('watchdog-opc',2,jsonb_build_object(
  'id','watchdog-opc','templateId','watchdog-opc-reference-v1',
  'name','Watchdog Automation OPC — CP-TL-OPT-04B version 2',
  'address','Synthetic QA address','phone','+63 917 7073079',
  'quotationPhone','+63 917 7073079','email','qa@example.test',
  'website','qa.example.test','tin','QA-TIN',
  'logoAsset','profiles/v1/watchdog-opc-f55506ddd9b2569658f2eecac7f081cc08ba3a19.png',
  'quotationLogoAsset','profiles/v1/watchdog-opc-quotation-6d43decfa6a476219c2cae149311c84bd7109c57.png'
 ),'v1.43.0');
 INSERT INTO private.tradelink_template_versions
  (template_id,template_version,profile_id,profile_version,template,default_terms)
 VALUES ('watchdog-opc-reference-v1','v1.43.0','watchdog-opc',2,
  jsonb_build_object('id','watchdog-opc-reference-v1','version','v1.43.0',
   'profileId','watchdog-opc','profileVersion',2,'accent','#14b866',
   'tableBackground','#e3f7e9','tableText','#244f78','ruleColor','#2f68c4',
   'termsMode','flow','rendererVersion','tradelink-renderer-v1',
   'stylesheetAssets',jsonb_build_array(
    'templates/tradelink-application-v1.42.0-fc3a9e2dd3626a4b7657ea72c105b042d8128287.css',
    'templates/tradelink-quotation-redesign-v1.42.0-866f644ed2f9a5fa569e799351feac19a90325fa.css'
   )
  ),jsonb_build_object('quotation','CP-TL-OPT-04B-V2-DEFAULT-TERMS'));
 v_value:=private.tl04_build_document_render_snapshot('quotation',
  jsonb_build_object('documentType','quotation','documentNumber','Q-OPT04B-V2',
   'vendorId','watchdog-opc','templateId','watchdog-opc-reference-v1',
   'terms','CP-TL-OPT-04B-V2-DOCUMENT-TERMS'),'captured');
 IF v_value->>'profileVersion'<>'2'
  OR v_value->'company'->>'name'<>'Watchdog Automation OPC — CP-TL-OPT-04B version 2'
  OR v_value->'template'->>'version'<>'v1.43.0'
  OR v_value->'template'->>'profileVersion'<>'2'
  OR v_value->>'terms'<>'CP-TL-OPT-04B-V2-DOCUMENT-TERMS' THEN
  RAISE EXCEPTION 'Latest company/template versions were not paired for the new render snapshot';
 END IF;
 SELECT render_snapshot INTO v_value
 FROM private.tradelink_document_render_snapshots
 WHERE document_id='00000000-0000-4000-8000-000000000001'::uuid AND revision=1;
 IF v_value->>'profileVersion'<>'1'
  OR v_value->'template'->>'version'<>'v1.42.0'
  OR v_value->'company'->>'name'<>'Watchdog Automation OPC' THEN
  RAISE EXCEPTION 'Adding a new company/template version changed an existing historical snapshot';
 END IF;
 INSERT INTO private.tradelink_company_profile_versions
  (profile_id,profile_version,profile,source_template_version)
 VALUES ('cp-tl-opt-04b-unpaired',1,
  jsonb_build_object('id','cp-tl-opt-04b-unpaired',
   'templateId','cp-tl-opt-04b-unpaired-template','name','Synthetic unpaired profile'),
  'v1.42.0');
 BEGIN
  PERFORM private.tl04_build_document_render_snapshot('quotation',
   jsonb_build_object('vendorId','cp-tl-opt-04b-unpaired',
    'templateId','cp-tl-opt-04b-unpaired-template','terms','test'),'captured');
  RAISE EXCEPTION 'Unpaired company/template versions unexpectedly resolved';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  INSERT INTO private.tradelink_template_versions
   (template_id,template_version,profile_id,profile_version,template,default_terms)
  VALUES ('watchdog-sales-reference-v1','v1.42','watchdog-sales',1,
   jsonb_build_object('id','watchdog-sales-reference-v1','version','v1.42'),
   jsonb_build_object('quotation','invalid version QA'));
  RAISE EXCEPTION 'Malformed semantic template version unexpectedly inserted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END
$versioning$;

SELECT 'PASS: 63 historical render snapshots (47 legacy-derived, 16 legacy-defaulted).' AS result;
SELECT 'PASS: new revisions capture separate immutable rendering snapshots.' AS result;
SELECT 'PASS: historical read RPC and immutable profile/template/snapshot guards.' AS result;
