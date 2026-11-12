-- Isolated PostgreSQL-only compatibility fixture. Production storage.objects is unchanged.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.objects (
 id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 bucket_id text NOT NULL,
 name text NOT NULL,
 owner_id text,
 metadata jsonb DEFAULT '{}'::jsonb,
 UNIQUE(bucket_id,name)
);
