-- CP-CRM-WORKSPACE-INVITE-01C: isolated Supabase staging branch ONLY.
-- Recreate the exact essential workspace membership and session contracts from
-- the existing CP-WS01B disposable fixture; NO production data import.
-- Leaves every invitation, creation and selection flag disabled by default.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $pre$
BEGIN
 IF current_database()<>'postgres'
    OR (SELECT count(*) FROM auth.users)<>0
    OR to_regnamespace('private') IS NOT NULL
    OR to_regclass('public.profiles') IS NOT NULL
    OR to_regclass('public.workspaces') IS NOT NULL
    OR to_regclass('public.workspace_members') IS NOT NULL
    OR to_regprocedure('auth.uid()') IS NULL
    OR to_regclass('auth.sessions') IS NULL
    OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
 THEN RAISE EXCEPTION 'Existing nonempty/partially-installed staging schema: inspect before continuing'; END IF;
END $pre$;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 email text NOT NULL DEFAULT '', display_name text,
 email_verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled'))
);
CREATE TABLE public.workspaces(
 id uuid PRIMARY KEY, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
);
-- No public table grants; signed functions own the existing trust boundary.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles,public.workspaces,public.workspace_members FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $find$
 SELECT m.workspace_id FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active AND p.status='active'
 ORDER BY m.created_at,m.workspace_id LIMIT 1;
$find$;
REVOKE ALL ON FUNCTION public.current_workspace_id(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.wm_board_config_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $session$
DECLARE actor uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id';
BEGIN
 IF actor IS NULL OR sid IS NULL OR sid !~*
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid
  AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now()));
END $session$;
REVOKE ALL ON FUNCTION private.wm_board_config_session_active() FROM PUBLIC,anon,authenticated;
COMMIT;
