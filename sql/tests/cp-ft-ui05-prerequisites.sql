-- CP-FT-UI-05: Minimal disposable host prerequisites for the ORIGINAL FuelTrans migration.
-- Runs only in the short-lived, network-isolated test container. NEVER production.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.workspaces (
 id uuid primary key
);
create table public.profiles (
 id uuid primary key,
 display_name text,
 email text,
 platform_role text not null default 'user',
 status text not null default 'active'
);
create schema storage;
create table storage.buckets (
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null references storage.buckets(id),
 name text not null
);
create or replace function storage.foldername(name text) returns text[] language sql stable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
grant usage on schema storage to authenticated;
