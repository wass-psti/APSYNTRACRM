-- Test-only prerequisites for fresh, disposable PostgreSQL 17 container.
-- Never apply to production Supabase or a shared local project.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create schema storage;
create table storage.buckets(
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Unique fixture marker checked before any test identity or booking write.
create schema pdl07_acceptance_guard;
create table pdl07_acceptance_guard.disposable_fixture(
  id integer primary key check (id=1),
  created_at timestamptz not null default now()
);
insert into pdl07_acceptance_guard.disposable_fixture(id) values(1);
