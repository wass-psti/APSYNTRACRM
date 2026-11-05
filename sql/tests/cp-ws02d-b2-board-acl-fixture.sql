-- CP-WS-02D/B2 — synthetic copy of deployed board ACL and minimal dependencies.
-- Only the disposable workspace_disposable PG17 database; NEVER production.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NOT NULL
  OR to_regclass('public.work_board_members') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D/B2 baseline fixture collision'
   USING ERRCODE='42501'; END IF;
END $pre$;
-- Prior disposable Auth fixture can already define platform_role.
-- Only supply it when absent; keep existing prior-stage schema intact.
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'employee';
CREATE TABLE public.work_board_members(
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
 PRIMARY KEY(board_id,user_id)
);
-- Production API helpers are mocked only where independent platform security
-- is already asserted by existing tests. The integration candidate must still
-- preserve the entire live board ACL decision flow.
CREATE FUNCTION public.apsyntra_crm_explicit_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $cap$
 SELECT p.platform_role FROM public.profiles p
 JOIN public.workspace_members wm ON wm.user_id=p.id
 WHERE p.id=p_user AND wm.workspace_id=p_workspace
  AND wm.active IS TRUE AND p.status='active';
$cap$;
CREATE FUNCTION public.is_platform_admin(check_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $admin$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=check_user
  AND p.status='active' AND p.platform_role='admin_general_manager');
$admin$;
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner'),
 ('11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','editor'),
 ('11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
-- Exact functional behavior of the production ACL inspected on Nov 5, 2026.
-- This is the PRE-INTEGRATION reference, not a new production permission grant.
CREATE FUNCTION public.work_board_access(
 p_board_id uuid,p_required text DEFAULT 'view'
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE caller uuid:=auth.uid(); member_role text; ws uuid; board_ws uuid; cap text;
BEGIN
 IF caller IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p
               WHERE p.id=caller AND p.status='active') THEN RETURN false; END IF;
 SELECT workspace_id INTO board_ws FROM public.work_boards WHERE id=p_board_id;
 IF board_ws IS NULL THEN RETURN false; END IF;
 ws:=public.current_workspace_id(caller);
 IF ws IS NULL OR ws<>board_ws THEN RETURN false; END IF;
 IF p_required IS NULL OR p_required NOT IN ('view','edit','manage') THEN RETURN false; END IF;
 cap:=public.apsyntra_crm_explicit_role(caller,ws);
 IF cap='viewer' AND p_required IN ('edit','manage') THEN RETURN false; END IF;
 IF cap IN ('employee','supervisor') AND p_required='manage' THEN RETURN false; END IF;
 IF public.is_platform_admin(caller) THEN RETURN true; END IF;
 SELECT role INTO member_role FROM public.work_board_members
  WHERE board_id=p_board_id AND user_id=caller;
 IF p_required='manage' THEN RETURN coalesce(member_role='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(member_role IN ('owner','editor'),false); END IF;
 RETURN coalesce(member_role IN ('owner','editor','viewer'),false);
END;
$function$;
REVOKE ALL ON FUNCTION public.work_board_access(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.work_board_access(uuid,text) TO authenticated;
