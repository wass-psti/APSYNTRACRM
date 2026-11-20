\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 only: synthetic Auth rows and mock role routines.
-- True GoTrue verification is a separate staging acceptance gate.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,email text NOT NULL UNIQUE,
 email_confirmed_at timestamptz,is_anonymous boolean NOT NULL DEFAULT false);
CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 not_after timestamptz);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id),email text NOT NULL,
 email_verified_at timestamptz,status text NOT NULL);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),active boolean NOT NULL,
 created_at timestamptz DEFAULT now(),PRIMARY KEY(workspace_id,user_id));
CREATE TABLE private.ws01_member_roles(
 workspace_id uuid,user_id uuid,relation text NOT NULL,
 PRIMARY KEY(workspace_id,user_id),FOREIGN KEY(workspace_id,user_id)
 REFERENCES public.workspace_members(workspace_id,user_id));
CREATE TABLE private.ws01_workspace_policy(
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id),
 privacy text NOT NULL,created_by uuid NOT NULL REFERENCES public.profiles(id));
CREATE TABLE private.ws01_lifecycle_flags(
 id boolean PRIMARY KEY,creation_enabled boolean NOT NULL,
 selection_enabled boolean NOT NULL);
INSERT INTO private.ws01_lifecycle_flags VALUES(true,false,false);
CREATE TABLE private.ws02d_invitation_flags(
 id boolean PRIMARY KEY,enabled boolean NOT NULL);
INSERT INTO private.ws02d_invitation_flags VALUES(true,false);
CREATE TABLE private.ws02d_invitations(id uuid PRIMARY KEY);
CREATE FUNCTION private.ws02d_issue(uuid,text,text,uuid)
 RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.current_workspace_id(p_user_id uuid)
 RETURNS uuid LANGUAGE sql STABLE AS $lookup$
 SELECT m.workspace_id FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active AND p.status='active'
 ORDER BY m.created_at,m.workspace_id LIMIT 1;
$lookup$;
INSERT INTO auth.users VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner@staging.example.invalid',now(),false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@staging.example.invalid',now(),false);
INSERT INTO auth.sessions VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL);
