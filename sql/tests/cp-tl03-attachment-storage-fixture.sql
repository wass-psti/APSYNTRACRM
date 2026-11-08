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
