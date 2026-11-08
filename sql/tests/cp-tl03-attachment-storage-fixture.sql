-- DISPOSABLE PostgreSQL 17 ONLY: storage schema shape sufficient to exercise
-- RLS and transactional metadata. Not the real Supabase Storage binary API.
\set ON_ERROR_STOP on
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(
 id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,
 file_size_limit bigint,allowed_mime_types text[]
);
CREATE TABLE storage.objects(
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 bucket_id text NOT NULL REFERENCES storage.buckets(id),
 name text NOT NULL,owner_id text,metadata jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bucket_id,name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Match the project's verified Supabase Storage helper contract. These are
-- QA-only doubles; production uses the actual storage.operation() helper.
CREATE FUNCTION storage.operation() RETURNS text LANGUAGE plpgsql STABLE
AS $operation$
BEGIN
 RETURN current_setting('storage.operation',true);
END $operation$;
CREATE FUNCTION storage.allow_only_operation(expected_operation text)
RETURNS boolean LANGUAGE sql STABLE AS $allow$
 WITH current_operation AS (
  SELECT storage.operation() AS raw_operation
 ),normalized AS (
  SELECT CASE WHEN raw_operation LIKE 'storage.%'
   THEN substr(raw_operation,9) ELSE raw_operation END AS current_operation,
   CASE WHEN expected_operation LIKE 'storage.%'
    THEN substr(expected_operation,9) ELSE expected_operation END AS requested_operation
  FROM current_operation
 )
 SELECT CASE WHEN requested_operation IS NULL OR requested_operation=''
  THEN FALSE ELSE COALESCE(current_operation=requested_operation,FALSE) END
 FROM normalized;
$allow$;
CREATE FUNCTION storage.allow_any_operation(expected_operations text[])
RETURNS boolean LANGUAGE sql STABLE AS $allow_any$
 WITH current_operation AS (
  SELECT storage.operation() AS raw_operation
 ),normalized AS (
  SELECT CASE WHEN raw_operation LIKE 'storage.%'
   THEN substr(raw_operation,9) ELSE raw_operation END AS current_operation
  FROM current_operation
 )
 SELECT EXISTS (
  SELECT 1 FROM normalized n
   CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
  WHERE expected_operation IS NOT NULL AND expected_operation<>''
   AND n.current_operation=CASE WHEN expected_operation LIKE 'storage.%'
     THEN substr(expected_operation,9) ELSE expected_operation END
 );
$allow_any$;
GRANT EXECUTE ON FUNCTION storage.operation(),
 storage.allow_only_operation(text),storage.allow_any_operation(text[])
 TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('tradelink-attachments','tradelink-attachments',false,20971520,ARRAY[
 'application/pdf','image/png','image/jpeg','image/webp','text/plain',
 'text/csv','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
