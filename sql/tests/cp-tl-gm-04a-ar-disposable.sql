-- Synthetic PostgreSQL fixture: deliberately substitutes existing signed-session and review-evidence contracts.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000010'::uuid $$;
CREATE FUNCTION public.current_workspace_id(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION private.tl03_can_manage(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid AND current_setting('test.manager',true)='yes' $$;
CREATE TABLE public.tradelink_documents(
 id uuid PRIMARY KEY, board_id uuid NOT NULL DEFAULT '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 workspace_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
 document_number text NOT NULL, document_type text NOT NULL, workflow_state text NOT NULL,
 revision bigint NOT NULL DEFAULT 1, content jsonb NOT NULL, created_at timestamptz DEFAULT now(),
 archived_at timestamptz, deleted_at timestamptz);
CREATE TABLE private.fixture_evidence(document_id uuid,revision bigint,PRIMARY KEY(document_id,revision));
CREATE FUNCTION private.tl03_approval_evidence_complete(uuid,bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM private.fixture_evidence WHERE document_id=$1 AND revision=$2) $$;
REVOKE ALL ON FUNCTION private.tl03_approval_evidence_complete(uuid,bigint) FROM PUBLIC;
GRANT USAGE ON SCHEMA private,auth TO authenticated;
GRANT SELECT ON public.tradelink_documents TO authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_manage(uuid) TO authenticated;

\ir ../candidates/cp-tl-gm-04a-ar-reconciliation.sql
SET test.manager='yes';
CREATE FUNCTION public.fixture_payment(n integer, state text, cash numeric, cheque numeric,
 curr text DEFAULT 'PHP', signed boolean DEFAULT true, deleted boolean DEFAULT false, ref text DEFAULT 'ESI-1')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE k uuid:=('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
BEGIN
 INSERT INTO public.tradelink_documents(id,document_number,document_type,workflow_state,content,deleted_at)
 VALUES(k,'AR-'||n,'payment',state,jsonb_build_object('currency',curr,'referenceNumber',ref,
  'cashAmount',cash,'chequeAmount',cheque,'bankName','Fixture bank','chequeNumber','C-'||n),
  CASE WHEN deleted THEN now() END);
 IF signed THEN INSERT INTO private.fixture_evidence VALUES(k,1); END IF;
END $$;
CREATE FUNCTION public.fixture_assert(outstanding numeric,open_count integer,excess numeric,pending numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE a jsonb; actual numeric; n integer; e numeric; p numeric;
BEGIN
 a:=public.tl03_analytics_summary('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88')->'aging';
 SELECT coalesce(sum((r->>'outstanding')::numeric),0),coalesce(sum((r->>'invoiceCount')::int),0)
 INTO actual,n FROM jsonb_array_elements(a->'buckets') r WHERE r->>'currency'='PHP';
 SELECT coalesce(sum((r->>'amount')::numeric),0) INTO e FROM jsonb_array_elements(a->'excessPayments') r WHERE r->>'currency'='PHP';
 SELECT coalesce(sum((r->>'amount')::numeric),0) INTO p FROM jsonb_array_elements(a->'pendingChequeReceipts') r WHERE r->>'currency'='PHP';
 IF (actual,n,e,p) IS DISTINCT FROM (outstanding,open_count,excess,pending) THEN
  RAISE EXCEPTION 'Expected %,%,%,%; got %,%,%,%',outstanding,open_count,excess,pending,actual,n,e,p;
 END IF;
END $$;
INSERT INTO public.tradelink_documents(id,document_number,document_type,workflow_state,content)
VALUES('00000000-0000-4000-8000-000000000001','ESI-1','esi','approved',
 jsonb_build_object('currency','PHP','dueDate',current_date::text,'items',jsonb_build_array(jsonb_build_object('kind','item','quantity',1,'unitPrice',100000))));
SELECT public.fixture_assert(100000,1,0,0);
SELECT public.fixture_payment(2,'closed',40000,0);
SELECT public.fixture_assert(60000,1,0,0);
SELECT public.fixture_payment(3,'completed',0,20000);
SELECT public.fixture_assert(60000,1,0,20000);
SET ROLE authenticated;
DO $$ DECLARE r jsonb; saved_stamp text; BEGIN
 r:=public.tl03_cheque_clearance_status('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',1);
 IF r->'clearedAt' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'expected pending readback'; END IF;
 r:=public.tl03_record_cheque_clearance('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',1);
 IF r->>'idempotent'<>'false' THEN RAISE EXCEPTION 'first clearance'; END IF;
 saved_stamp:=r->>'clearedAt';
 r:=public.tl03_cheque_clearance_status('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',1);
 IF r->>'clearedAt' IS DISTINCT FROM saved_stamp OR saved_stamp IS NULL THEN RAISE EXCEPTION 'persistent clearance readback'; END IF;
 r:=public.tl03_record_cheque_clearance('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',1);
 IF r->>'idempotent'<>'true' THEN RAISE EXCEPTION 'duplicate clearance'; END IF;
 BEGIN PERFORM public.tl03_record_cheque_clearance('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',2);
 RAISE EXCEPTION 'stale clearance accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
SELECT public.fixture_assert(40000,1,0,0);
RESET ROLE;
SELECT public.fixture_payment(4,'closed',40000,0);
SELECT public.fixture_assert(0,0,0,0);
SELECT public.fixture_payment(5,'completed',5000,0);
SELECT public.fixture_assert(0,0,5000,0);
SELECT public.fixture_payment(6,'closed',9000,0,'USD');
SELECT public.fixture_payment(7,'closed',9000,0,'PHP',false);
SELECT public.fixture_payment(8,'cancelled',9000,0);
SELECT public.fixture_payment(9,'closed',9000,0,'PHP',true,true);
SELECT public.fixture_payment(10,'approved',9000,0);
SELECT public.fixture_assert(0,0,5000,0);
UPDATE public.tradelink_documents SET revision=2 WHERE document_number='AR-3';
INSERT INTO private.fixture_evidence VALUES('00000000-0000-4000-8000-000000000003',2);
SELECT public.fixture_assert(15000,1,0,20000);
SET ROLE authenticated;
SET test.manager='no';
DO $$ BEGIN
 BEGIN PERFORM public.tl03_record_cheque_clearance('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000003',2);
 RAISE EXCEPTION 'nonmanager clearance accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'CP-TL-GM-04A synthetic financial assertions passed' AS result;

-- Rehearse rollback after recording clearance: evidence must survive.
\ir ../candidates/cp-tl-gm-04c-ar-rollback.sql
DO $rollback_check$ BEGIN
 IF (SELECT count(*) FROM private.tradelink_cheque_clearances)<>1 THEN RAISE EXCEPTION 'rollback lost clearance evidence'; END IF;
 IF has_function_privilege('authenticated','public.tl03_record_cheque_clearance(uuid,uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'rollback left clearance write available'; END IF;
END $rollback_check$;
-- Reapply candidate to verify retained evidence and repeatable deployment.
\ir ../candidates/cp-tl-gm-04a-ar-reconciliation.sql
SET test.manager='yes';
SELECT public.fixture_assert(15000,1,0,20000);
