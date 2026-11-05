-- CP-WS-02D/B3 TimeTracker positive authorization: disposable fixture only.
-- Augment synthetic module access and visible-value helpers, NEVER production.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('public.timetracker_commit_attendance_raw_gps03(text,text,text,text,jsonb,text,jsonb)') IS NULL
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.module_state_visible_value(text,text,text,uuid)') IS NOT NULL
 OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'TimeTracker fixture not isolated, complete, default-off'
 USING ERRCODE='42501'; END IF;
END $guard$;
-- Existing fixture has separate module access checks for FuelTrack and
-- TradeLink. Extend ONLY the disposable test double with TimeTracker.
CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $m$
 SELECT p_module_id IN ('fueltrack-plus','tradelink','time-tracker')
 AND p_actor IS NOT NULL AND p_actor=auth.uid()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active')
 AND EXISTS(SELECT 1 FROM public.workspace_members m
   WHERE m.user_id=p_actor AND m.active
    AND m.workspace_id=public.current_workspace_id(p_actor));
$m$;
-- Production visibility applies additional record masking. This synthetic
-- double is restricted to the caller's active workspace and tests only
-- that committed state and independent GPS fields are preserved.
CREATE FUNCTION public.module_state_visible_value(
 p_module_id text,p_state_key text,p_state_value text,p_actor uuid
) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $visible$
 SELECT p_state_value WHERE p_module_id='time-tracker'
  AND p_state_key='timetracker.attendance.v1' AND p_actor=auth.uid()
  AND public.current_workspace_id(p_actor) IS NOT NULL
  AND public.has_module_access(p_module_id,p_actor);
$visible$;
REVOKE ALL ON FUNCTION public.module_state_visible_value(text,text,text,uuid)
 FROM PUBLIC,anon,authenticated;
