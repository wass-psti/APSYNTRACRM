-- CP-TL-QUOTATION-EMAIL-VALIDATION-01
-- Keep quotation contact email validation consistent across the frontend and
-- every signed TradeLink write / submission path.
-- Depends on CP-TL-LARGE-SAVE-02 (20261125014338) so the 250-item / 2 MiB
-- shared validator contract is retained without reverting its capacity changes.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $preflight$
DECLARE
 validator text;
 document_check text;
 snapshot_check text;
BEGIN
 validator:=pg_catalog.pg_get_functiondef('private.tl03_validate_draft(jsonb)'::regprocedure);
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO document_check
 FROM pg_catalog.pg_constraint
 WHERE conrelid='public.tradelink_documents'::regclass
  AND conname='tradelink_documents_content_check' AND convalidated;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO snapshot_check
 FROM pg_catalog.pg_constraint
 WHERE conrelid='private.tradelink_document_revision_snapshots'::regclass
  AND conname='tradelink_document_revision_snapshots_content_check' AND convalidated;
 -- Exact post-CP02 function fingerprint prevents overwriting any later
 -- validator change while retaining the approved capacity contract.
 IF pg_catalog.md5(validator) IS DISTINCT FROM '84ba479daa8a792279f142c8d50ce49e' THEN
  RAISE EXCEPTION 'CP-TL-QUOTATION-EMAIL-VALIDATION-01 requires the exact CP-TL-LARGE-SAVE-02 shared validator.'
   USING ERRCODE='55000';
 END IF;
 IF pg_catalog.strpos(validator,'octet_length(p_data::text)>2097152')=0
  OR pg_catalog.strpos(validator,'jsonb_array_length(p_data->''items'')>250')=0
  OR pg_catalog.strpos(validator,'Duplicate TradeLink line item identifier')=0
  OR pg_catalog.strpos(validator,'Invalid Quotation contact email.')>0
  OR document_check IS NULL OR pg_catalog.strpos(document_check,'2097152')=0
  OR snapshot_check IS NULL OR pg_catalog.strpos(snapshot_check,'2097152')=0 THEN
  RAISE EXCEPTION 'CP-TL-QUOTATION-EMAIL-VALIDATION-01 requires the verified CP-TL-LARGE-SAVE-02 capacity contract first.'
   USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
     WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'postgres'
  OR (SELECT provolatile FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'i'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'TradeLink shared validator execution contract changed; refusing replacement.'
   USING ERRCODE='55000';
 END IF;
 IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure),'private.tl03_validate_draft')=0
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure),'private.tl03_validate_draft')=0
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_submit(uuid,uuid,bigint)'::regprocedure),'private.tl03_validate_draft')=0
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_create_document(uuid,uuid,jsonb,text)'::regprocedure),'private.tl03_save')=0 THEN
  RAISE EXCEPTION 'TradeLink create, save, commit or submit path no longer uses the shared validator.'
   USING ERRCODE='55000';
 END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.tl03_validate_draft(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $validate$
DECLARE it jsonb; field text;
BEGIN
 IF p_data IS NULL OR pg_catalog.jsonb_typeof(p_data)<>'object'
  OR pg_catalog.octet_length(p_data::text)>2097152 THEN
  RAISE EXCEPTION 'Invalid TradeLink draft envelope' USING ERRCODE='22023'; END IF;
 IF (p_data - ARRAY[
  'documentType','documentNumber','date','vendorId','templateId',
  'customerName','customerAddress','customerTin','customerContact','customerEmail','customerPhone',
  'dueDate','referenceNumber','poNumber','paymentTerms','paymentTermsCustom',
  'validity','validityCustom','deliveryCommitment','deliveryCommitmentCustom',
  'targetDeliveryDate','remarks','terms','currency','exchangeRate',
  'vatType','discountType','discountValue','discountReason','items','quoteStatus',
  'verifiedBy','verifiedByEmail','approvedBy','approvedByEmail',
  'paymentForm','cashAmount','bankName','chequeAmount','chequeNumber',
  'paymentParticulars','receivedBy','drIncludePricing','checkedBy','deliveredBy'
 ])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Unknown or server-owned document property' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p_data->'documentType') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(p_data->'documentNumber') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(p_data->'documentType') IS DISTINCT FROM 'string'
  OR p_data->>'documentType' NOT IN ('esi','packing','delivery','payment','quotation','po')
  OR p_data->>'documentNumber' IS NULL
  OR pg_catalog.char_length(p_data->>'documentNumber') NOT BETWEEN 1 AND 120
  OR p_data->>'documentNumber' !~ '^[A-Za-z0-9][A-Za-z0-9._ /-]*$'
  OR p_data->>'documentNumber' IS DISTINCT FROM pg_catalog.btrim(p_data->>'documentNumber') THEN
  RAISE EXCEPTION 'Invalid document type or number' USING ERRCODE='22023'; END IF;
 IF p_data ? 'quoteStatus' AND
  (p_data->>'documentType' IS DISTINCT FROM 'quotation'
   OR p_data->>'quoteStatus' IS NULL OR p_data->>'quoteStatus' NOT IN
   ('Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed')) THEN
  RAISE EXCEPTION 'Invalid source quote status' USING ERRCODE='22023'; END IF;
 IF p_data ? 'currency' AND (p_data->>'currency' IS NULL OR p_data->>'currency' NOT IN
  ('PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR')) THEN
  RAISE EXCEPTION 'Invalid currency' USING ERRCODE='22023'; END IF;
 IF p_data ? 'vatType' AND (p_data->>'vatType' IS NULL
  OR p_data->>'vatType' NOT IN ('15_tkm','15_ksa','12','exempt','zero')) THEN
  RAISE EXCEPTION 'Invalid VAT code' USING ERRCODE='22023'; END IF;
 IF p_data ? 'discountType' AND (p_data->>'discountType' IS NULL
  OR p_data->>'discountType' NOT IN ('percentage','fixed')) THEN
  RAISE EXCEPTION 'Invalid discount type' USING ERRCODE='22023'; END IF;
 IF p_data ? 'paymentForm' AND (p_data->>'paymentForm' IS NULL
  OR p_data->>'paymentForm' NOT IN ('cash','cheque')) THEN
  RAISE EXCEPTION 'Invalid payment form' USING ERRCODE='22023'; END IF;
 FOR field IN SELECT pg_catalog.unnest(ARRAY[
  'exchangeRate','discountValue','cashAmount','chequeAmount']) LOOP
  IF p_data ? field AND (pg_catalog.jsonb_typeof(p_data->field)<>'number'
   OR (p_data->>field)::numeric<0 OR (p_data->>field)::numeric>1000000000000) THEN
   RAISE EXCEPTION 'Invalid numeric TradeLink field %',field USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR field IN SELECT pg_catalog.unnest(ARRAY[
  'date','vendorId','templateId','customerName','customerAddress','customerTin',
  'customerContact','customerEmail','customerPhone','dueDate','referenceNumber',
  'poNumber','paymentTerms','paymentTermsCustom','validity','validityCustom',
  'deliveryCommitment','deliveryCommitmentCustom','targetDeliveryDate',
  'remarks','terms','discountReason','verifiedBy','verifiedByEmail',
  'approvedBy','approvedByEmail','bankName','chequeNumber','paymentParticulars',
  'receivedBy','checkedBy','deliveredBy']) LOOP
  IF p_data ? field AND (pg_catalog.jsonb_typeof(p_data->field)<>'string'
   OR pg_catalog.char_length(p_data->>field)>5000) THEN
   RAISE EXCEPTION 'Invalid text TradeLink field %',field USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_data->>'documentType'='quotation'
  AND coalesce(p_data->>'customerEmail','')<>''
  AND p_data->>'customerEmail' !~ '^[A-Za-z0-9.!#$%&''*+/=?^_\x60{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$' THEN
  RAISE EXCEPTION 'Invalid Quotation contact email.' USING ERRCODE='22023';
 END IF;
 FOREACH field IN ARRAY ARRAY['date','dueDate'] LOOP
  IF p_data ? field THEN
   IF p_data->>field !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid TradeLink calendar date %',field USING ERRCODE='22023'; END IF;
   BEGIN
    PERFORM (p_data->>field)::date;
   EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid TradeLink calendar date %',field USING ERRCODE='22023';
   END;
  END IF;
 END LOOP;
 IF p_data ? 'drIncludePricing'
   AND pg_catalog.jsonb_typeof(p_data->'drIncludePricing')<>'boolean' THEN
  RAISE EXCEPTION 'Invalid delivery pricing flag' USING ERRCODE='22023'; END IF;
 IF p_data ? 'items' THEN
  IF pg_catalog.jsonb_typeof(p_data->'items')<>'array'
   OR pg_catalog.jsonb_array_length(p_data->'items')>250 THEN
   RAISE EXCEPTION 'Invalid bounded line items' USING ERRCODE='22023'; END IF;
  FOR it IN SELECT value FROM pg_catalog.jsonb_array_elements(p_data->'items') LOOP
   IF pg_catalog.jsonb_typeof(it)<>'object' OR it->>'kind' IS NULL
    OR it->>'kind' NOT IN ('item','note')
    OR pg_catalog.char_length(coalesce(it->>'id','')) NOT BETWEEN 1 AND 120
    OR pg_catalog.char_length(coalesce(it->>'description',''))>2000
    OR pg_catalog.jsonb_typeof(it->'id') IS DISTINCT FROM 'string'
    OR (it ? 'description' AND pg_catalog.jsonb_typeof(it->'description')<>'string')
    OR (it ? 'unit' AND pg_catalog.jsonb_typeof(it->'unit')<>'string')
    OR (it ? 'serialNumber' AND pg_catalog.jsonb_typeof(it->'serialNumber')<>'string')
    OR (it - ARRAY['id','kind','description','quantity','unit','unitPrice','serialNumber'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid source line item' USING ERRCODE='22023'; END IF;
   IF it->>'kind'='item' AND
    (pg_catalog.jsonb_typeof(it->'quantity') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(it->'unitPrice') IS DISTINCT FROM 'number'
     OR (it->>'quantity')::numeric<0 OR (it->>'quantity')::numeric>1000000000
     OR (it->>'unitPrice')::numeric<0 OR (it->>'unitPrice')::numeric>1000000000) THEN
    RAISE EXCEPTION 'Invalid quantity or unit price' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF EXISTS (
   SELECT 1 FROM pg_catalog.jsonb_array_elements(p_data->'items') AS line(value)
   GROUP BY line.value->>'id' HAVING pg_catalog.count(*)>1
  ) THEN
   RAISE EXCEPTION 'Duplicate TradeLink line item identifier' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN p_data;
END $validate$;

DO $postflight$
DECLARE
 validator text;
BEGIN
 validator:=pg_catalog.pg_get_functiondef('private.tl03_validate_draft(jsonb)'::regprocedure);
 IF pg_catalog.md5(validator) IS DISTINCT FROM '8840f7176a5f187a7a9ef77773fa0626' THEN
  RAISE EXCEPTION 'Quotation email validator postflight fingerprint mismatch.'
   USING ERRCODE='55000';
 END IF;
 IF pg_catalog.strpos(validator,'Invalid Quotation contact email.')=0
  OR pg_catalog.strpos(validator,'octet_length(p_data::text)>2097152')=0
  OR pg_catalog.strpos(validator,'jsonb_array_length(p_data->''items'')>250')=0
  OR pg_catalog.strpos(validator,'Duplicate TradeLink line item identifier')=0 THEN
  RAISE EXCEPTION 'Quotation email validation or the approved capacity contract is missing.'
   USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
     WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'postgres'
  OR (SELECT provolatile FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'i'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc
      WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'TradeLink shared validator execution contract changed after replacement.'
   USING ERRCODE='55000';
 END IF;
END
$postflight$;

DO $tests$
DECLARE
 base jsonb:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-EMAIL-VALIDATION-QA');
 result jsonb;
BEGIN
 result:=private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','client@example.com','customerPhone','09170000001'));
 IF result->>'customerEmail'<>'client@example.com' THEN
  RAISE EXCEPTION 'Valid quotation email was not preserved.';
 END IF;
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','buyer'||pg_catalog.chr(96)||'name@example.com'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','a@b.c'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','','customerPhone','09170000001'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerPhone','09170000001'));
 BEGIN
  PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
   'customerEmail','test@email','customerPhone','09170000001'));
  RAISE EXCEPTION 'Malformed quotation email unexpectedly passed validation.';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
   'customerEmail','client @example.com','customerPhone','09170000001'));
  RAISE EXCEPTION 'Whitespace in quotation email unexpectedly passed validation.';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
 END;
 -- Email formatting remains quotation-specific; other document modules retain
 -- their existing field contract.
 PERFORM private.tl03_validate_draft(pg_catalog.jsonb_build_object(
  'documentType','esi','documentNumber','ESI-EMAIL-VALIDATION-QA',
  'customerEmail','test@email'));
END
$tests$;

COMMIT;
