-- Run after CP-TL-LARGE-SAVE-02 and CP-TL-QUOTATION-EMAIL-VALIDATION-01.
-- All cases call the production shared validator directly; no rows are written.
DO $tests$
DECLARE
 base jsonb:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-EMAIL-VALIDATION-QA');
 email_case jsonb;
BEGIN
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','client@example.com','customerPhone','09170000001'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','Buyer+sales@sub.example.test'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','buyer'||pg_catalog.chr(96)||'name@example.com'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','a@b.c'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','','customerPhone','09170000001'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerPhone','09170000001'));
 FOREACH email_case IN ARRAY ARRAY[
  pg_catalog.jsonb_build_object('customerEmail','test@email'),
  pg_catalog.jsonb_build_object('customerEmail','bad-email'),
  pg_catalog.jsonb_build_object('customerEmail','client @example.com'),
  pg_catalog.jsonb_build_object('customerEmail','client@example .com'),
  pg_catalog.jsonb_build_object('customerEmail','a@@example.com'),
  pg_catalog.jsonb_build_object('customerEmail','a@-example.test'),
  pg_catalog.jsonb_build_object('customerEmail','a@exam!ple.test'),
  pg_catalog.jsonb_build_object('customerEmail','buyer@example')
 ] LOOP
  BEGIN
   PERFORM private.tl03_validate_draft(base||email_case);
   RAISE EXCEPTION 'Malformed quotation email unexpectedly passed validation: %',email_case;
  EXCEPTION WHEN SQLSTATE '22023' THEN
   IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
  END;
 END LOOP;
 PERFORM private.tl03_validate_draft(pg_catalog.jsonb_build_object(
  'documentType','esi','documentNumber','ESI-EMAIL-VALIDATION-QA',
  'customerEmail','test@email'));
END
$tests$;
