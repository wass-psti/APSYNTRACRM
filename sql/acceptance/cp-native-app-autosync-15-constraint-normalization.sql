-- CP15 observed PostgreSQL expression normalization, clone only.
-- Live staging md5 of the provider-ID check: f54b41109af8b61bddd720ae63182e12
-- Restored PostgreSQL md5: d0e76e5e7e92c5380031f3379e79b73d
-- Both predicate forms differ only in associative AND parentheses.
DO $verify$
DECLARE v text;
DECLARE original boolean;
DECLARE restored boolean;
BEGIN
 IF current_database()<>'cp_native15_staging_clone' THEN
  RAISE EXCEPTION 'Constraint test only permitted inside the disposable clone';
 END IF;
 IF (SELECT md5(pg_get_constraintdef(co.oid))
     FROM pg_constraint co
     WHERE co.conrelid='private.ws02d_invitation_delivery'::regclass
       AND co.conname='ws02d_invitation_delivery_provider_email_id_check')
     <>'d0e76e5e7e92c5380031f3379e79b73d' THEN
  RAISE EXCEPTION 'Unrecognized staging constraint transformation';
 END IF;
 FOR v IN SELECT unnest(ARRAY[
   NULL::text,''::text,'provider-123','provider_123',
   'contains space','with.dot','with/slash',
   repeat('a',128),repeat('a',129)
 ]) LOOP
  original := v IS NULL OR
    (((length(v)>=1) AND (length(v)<=128)) AND
     (v ~ '^[a-zA-Z0-9_-]+$'));
  restored := v IS NULL OR
    (length(v)>=1 AND length(v)<=128 AND
     v ~ '^[a-zA-Z0-9_-]+$');
  IF original IS DISTINCT FROM restored THEN
   RAISE EXCEPTION 'Provider-ID predicate normalization changes behavior';
  END IF;
 END LOOP;
END $verify$;
SELECT 'PASS: recognized check parenthesis normalization' AS acceptance;
