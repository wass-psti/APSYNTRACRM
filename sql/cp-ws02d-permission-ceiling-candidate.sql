-- CP-WS-02D/B: additive workspace role ceiling predicate.
-- Dormant/private. This is a MAXIMUM permission guard, NOT a grant.
-- Board/application resource ACLs must additionally authorize each action.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('private.ws02d_member_access') IS NULL
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D/B role ceiling prerequisite missing/collision'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE FUNCTION private.ws02d_workspace_ceiling(
 p_workspace uuid,p_actor uuid,p_action text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $ceiling$
 SELECT CASE
  WHEN p_workspace IS NULL OR p_actor IS NULL OR
   p_action NOT IN('view','edit','manage') OR p_action IS NULL
   THEN false
  WHEN auth.uid() IS DISTINCT FROM p_actor
   OR NOT private.wm_board_config_session_active()
   THEN false
  WHEN public.current_workspace_id(p_actor) IS DISTINCT FROM p_workspace
   OR NOT EXISTS(SELECT 1 FROM public.profiles p
     WHERE p.id=p_actor AND p.status='active')
   OR NOT EXISTS(SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id=p_workspace AND m.user_id=p_actor AND m.active)
   THEN false
  -- Workspace owner is not a platform admin; it is only an upper bound.
  WHEN EXISTS(SELECT 1 FROM private.ws01_member_roles r
    WHERE r.workspace_id=p_workspace AND r.user_id=p_actor
     AND r.relation='owner')
   THEN true
  WHEN EXISTS(SELECT 1 FROM private.ws02d_member_access a
    WHERE a.workspace_id=p_workspace AND a.user_id=p_actor)
   THEN (
    SELECT CASE
     WHEN a.role='member' THEN p_action IN ('view','edit')
     WHEN a.role IN ('admin','viewer') AND
      EXISTS(SELECT 1 FROM private.ws02d_invitation_flags f
       WHERE f.id IS TRUE AND f.advanced_roles_enabled IS TRUE)
      THEN CASE WHEN a.role='viewer' THEN p_action='view'
       ELSE true END
     ELSE false
     END
    FROM private.ws02d_member_access a
    WHERE a.workspace_id=p_workspace AND a.user_id=p_actor
   )
  -- Historical membership uses existing board/resource ACLs unchanged.
  ELSE true END;
$ceiling$;
REVOKE ALL ON FUNCTION private.ws02d_workspace_ceiling(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
-- This helper must be composed with the existing board/API permission guards
-- before advanced role activation. No board functions are modified here.
COMMIT;
