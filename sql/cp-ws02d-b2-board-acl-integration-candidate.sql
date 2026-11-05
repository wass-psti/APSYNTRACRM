-- CP-WS-02D/B2 — dormant, reversible board ACL role-ceiling integration.
-- NOT PRODUCTION AUTHORIZED. The original live function fingerprint is
-- 6a7c23c439e8c59d7883bc8f59d66d08 (2026-11-05).
-- A separate read-only production fingerprint gate must run immediately
-- before an independently approved production migration.
BEGIN;
DO $pre$
DECLARE old_definition text;
BEGIN
 IF to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
  OR to_regclass('private.ws02d_member_access') IS NULL
 THEN RAISE EXCEPTION 'WS02D/B2 ACL dependencies missing'
  USING ERRCODE='42501'; END IF;
 SELECT pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure)
 INTO old_definition;
 IF old_definition NOT LIKE '%IF public.is_platform_admin(caller) THEN RETURN true; END IF;%'
  OR old_definition LIKE '%private.ws02d_workspace_ceiling%'
  OR old_definition NOT LIKE '%public.apsyntra_crm_explicit_role%'
 THEN RAISE EXCEPTION 'WS02D/B2 board ACL drift; stop before replacement'
  USING ERRCODE='42501'; END IF;
END $pre$;
-- Retain the existing API signature, SECURITY DEFINER, search path,
-- platform-ceiling checks and existing board-membership semantics exactly.
-- NEW restriction: require live actor/session/workspace ceiling as an AND
-- BEFORE the global platform-admin fast path.
CREATE OR REPLACE FUNCTION public.work_board_access(
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
 IF NOT private.ws02d_workspace_ceiling(ws,caller,p_required) THEN RETURN false; END IF;
 IF public.is_platform_admin(caller) THEN RETURN true; END IF;
 SELECT role INTO member_role FROM public.work_board_members
  WHERE board_id=p_board_id AND user_id=caller;
 IF p_required='manage' THEN RETURN coalesce(member_role='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(member_role IN ('owner','editor'),false); END IF;
 RETURN coalesce(member_role IN ('owner','editor','viewer'),false);
END;
$function$;
-- CREATE OR REPLACE preserves existing function OID and EXECUTE grants.
-- Do not add authorization grants, change public role assignments,
-- enable the invitation flag, or alter any production board data.
COMMIT;
