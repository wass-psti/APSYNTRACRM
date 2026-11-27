-- CP-TL-OPT-01 disposable-only PostgreSQL prerequisites.
-- Run after the source-aligned TradeLink fixture. Never use against production.
\set ON_ERROR_STOP on

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE auth.users
SET email='qa-manager@example.test',email_confirmed_at=clock_timestamp()
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.profiles
SET display_name='QA TradeLink Manager',email='qa-manager@example.test'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.has_module_access(
 p_module_id text,p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $module_access$
 SELECT p_user_id IS NOT NULL
  AND EXISTS(
   SELECT 1 FROM public.module_role_assignments a
   JOIN public.profiles p ON p.id=a.user_id
   JOIN public.workspace_members wm ON wm.user_id=a.user_id AND wm.active
   WHERE a.user_id=p_user_id AND a.module_id=p_module_id AND a.enabled
    AND p.status='active'
  )
$module_access$;

CREATE OR REPLACE FUNCTION private.tl03_can_view_documents(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $view$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
  OR public.has_module_access('tradelink',actor) IS DISTINCT FROM TRUE
 THEN RETURN false; END IF;
 RETURN EXISTS(
  SELECT 1 FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.work_boards b ON b.id=p_board_id
  JOIN public.workspace_members wm
   ON wm.user_id=actor AND wm.workspace_id=b.workspace_id AND wm.active IS TRUE
  WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
   AND p.status='active'
   AND b.workspace_id=public.current_workspace_id(actor)
   AND b.name='TradeLink' AND b.status='active'
   AND b.archived_at IS NULL AND b.trashed_at IS NULL
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
 );
END
$view$;

-- The repository test creates ordinary manager-owned records. This test-only
-- policy stub supplies the established default value without changing review
-- or approval functions in the production source migrations.
CREATE OR REPLACE FUNCTION private.tl03_revision_approval_policy(
 p_document_id uuid,p_revision bigint
) RETURNS text
LANGUAGE sql STABLE SET search_path=''
AS $policy$
 SELECT 'standard-dual-v1'::text
$policy$;

DO $extension$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pg_trgm' AND n.nspname='extensions'
 ) THEN
  RAISE EXCEPTION 'Disposable pg_trgm extension is not installed in extensions schema';
 END IF;
END
$extension$;
