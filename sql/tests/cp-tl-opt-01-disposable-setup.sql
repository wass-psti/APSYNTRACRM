-- CP-TL-OPT-01 disposable-only PostgreSQL prerequisites.
-- Run after the source-aligned TradeLink fixture. Never use against production.
\set ON_ERROR_STOP on

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Match the current production repository columns and retained sort indexes.
ALTER TABLE public.tradelink_documents ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE public.tradelink_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS tl03_document_created
 ON public.tradelink_documents(board_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS tl03_document_hidden_created
 ON public.tradelink_documents(board_id,created_at DESC,id DESC)
 WHERE hidden_at IS NOT NULL AND deleted_at IS NULL;

UPDATE auth.users
SET email='qa-manager@example.test',email_confirmed_at=clock_timestamp()
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.profiles
SET display_name='QA TradeLink Manager',email='qa-manager@example.test'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- The existing signed save RPC requires two active, confirmed TradeLink
-- reviewer identities. These are disposable fixture accounts only.
UPDATE auth.users
SET email='qa-reviewer-one@example.test',email_confirmed_at=clock_timestamp()
WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE auth.users
SET email='qa-reviewer-two@example.test',email_confirmed_at=clock_timestamp()
WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
UPDATE public.profiles
SET display_name='QA TradeLink Reviewer One',email='qa-reviewer-one@example.test'
WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE public.profiles
SET display_name='QA TradeLink Reviewer Two',email='qa-reviewer-two@example.test'
WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

DO $reviewer_fixture$
BEGIN
 IF (SELECT count(*) FROM auth.users
     WHERE id IN (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
     ) AND email_confirmed_at IS NOT NULL)<>3
  OR public.module_role_for('tradelink','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
     IS NULL
  OR public.module_role_for('tradelink','cccccccc-cccc-4ccc-8ccc-cccccccccccc')
     IS NULL
  OR public.current_workspace_id('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
     IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
  OR public.current_workspace_id('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
     IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Disposable TradeLink manager/reviewer identities are incomplete'; END IF;
END
$reviewer_fixture$;

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

-- The repository query also evaluates the existing creator capability. This
-- disposable helper models the fixture's General Manager path; it does not
-- add or change any production role, grant, or authorization rule.
CREATE OR REPLACE FUNCTION private.tl03_can_create_draft(p_board_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $create$
 SELECT auth.uid() IS NOT NULL
  AND p_board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND public.work_board_access(p_board_id,'manage') IS TRUE
$create$;
REVOKE ALL ON FUNCTION private.tl03_can_create_draft(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_create_draft(uuid) TO authenticated;

-- The current production migration chain retains a nine-argument legacy page
-- RPC. The isolated dual-review baseline starts with its earlier eight-argument
-- form, so provide a disposable compatibility overload for the additive
-- repository migration's preflight. The new repository query does not call it.
CREATE FUNCTION public.tl03_documents_page(
 p_board_id uuid,p_search text,p_document_type text,p_workflow_state text,
 p_archive_mode text,p_visibility_mode text,p_before_at timestamptz,
 p_before_id uuid,p_limit integer
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $page_compat$
 SELECT public.tl03_documents_page(
  p_board_id,p_search,p_document_type,p_workflow_state,p_archive_mode,
  p_before_at,p_before_id,p_limit
 );
$page_compat$;
REVOKE ALL ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

-- The repository test creates ordinary manager-owned records. This test-only
-- policy stub supplies the established default value without changing review
-- or approval functions in the production source migrations. This test-only
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
