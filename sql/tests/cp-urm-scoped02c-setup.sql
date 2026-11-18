\set ON_ERROR_STOP on
-- Extends cp-urm-scoped02b-setup.sql
CREATE TABLE public.charter_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid,owner_id uuid,
 data jsonb NOT NULL DEFAULT '{}'::jsonb,version integer DEFAULT 1,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 archived_at timestamptz);
CREATE TABLE public.charter_storage(
 workspace_id uuid NOT NULL,key text NOT NULL,value jsonb,version integer,
 updated_by uuid,updated_at timestamptz,PRIMARY KEY(workspace_id,key));
CREATE TABLE public.charter_updates(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 workspace_id uuid,item_id uuid,actor_id uuid,body text,created_at timestamptz DEFAULT now());
CREATE TABLE public.charter_notifications(
 id uuid DEFAULT gen_random_uuid() PRIMARY KEY,workspace_id uuid,item_id uuid,actor_id uuid,
 recipient_id uuid,message text,created_at timestamptz DEFAULT now(),delivery text);
CREATE TABLE public.charter_audit(
 id uuid DEFAULT gen_random_uuid() PRIMARY KEY,workspace_id uuid,actor_id uuid,
 action text,record_id uuid,event_at timestamptz DEFAULT now());
CREATE FUNCTION private.charter_match(jsonb,jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE FUNCTION public.apsyntra_role_require_bootstrap_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF auth.uid() IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 OR p_workspace_id IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 THEN RAISE EXCEPTION 'Signed team scope denied' USING ERRCODE='42501';END IF;
END$$;
-- Two legacy charter assignments model the true current domain vocabulary.
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','charter-navigator','user',true),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','charter-navigator','Employee',true);
-- Supervisor ceiling (rank 3) permits a Charter admin operational role (rank 3).
UPDATE public.profiles SET platform_role='supervisor' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.profiles SET display_name='Member',email='member@example.invalid'
WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.profiles SET display_name='Protected',email='bootstrap@example.invalid'
WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
