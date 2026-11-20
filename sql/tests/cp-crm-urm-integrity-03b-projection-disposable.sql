\set ON_ERROR_STOP on
-- Runs only against the synthetic CP-URM-SCOPED-02B/02C fixture.
INSERT INTO auth.users(id) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.profiles(id,platform_role,status) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','employee','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
INSERT INTO private.ws02_personal_workspaces(workspace_id,user_id) VALUES
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
SELECT set_config('test.actor','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('test.workspace','11111111-1111-4111-8111-111111111111',false);
DO $before$
DECLARE projection jsonb;
BEGIN
 projection:=public.apsyntra_crm_my_effective_access();
 IF projection->>'effectivePlatformRole'<>'admin' THEN RAISE EXCEPTION 'Fixture is not a workspace-effective owner'; END IF;
 IF public.has_module_access('time-tracker') OR public.module_role_for('time-tracker') IS NOT NULL THEN
  RAISE EXCEPTION 'Fixture unexpectedly has an assigned native module'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(projection->'modules') m
  WHERE m->>'moduleId'='time-tracker' AND m->>'allowed'='true') THEN
  RAISE EXCEPTION 'Expected baseline projection/native inconsistency was not reproduced'; END IF;
 RAISE NOTICE 'REPRODUCED: owner projection allowed, native module access denied';
END;
$before$;
\ir ../cp-crm-urm-integrity-03b-projection-candidate.sql
DO $after$
DECLARE projection jsonb;
BEGIN
 projection:=public.apsyntra_crm_my_effective_access();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(projection->'modules') m
  WHERE m->>'moduleId' IN ('time-tracker','fund-released-tracker','fueltrack-plus','tradelink')
   AND (m->>'allowed')::boolean IS DISTINCT FROM (public.has_module_access(m->>'moduleId') AND public.module_role_for(m->>'moduleId') IS NOT NULL))
 THEN RAISE EXCEPTION 'Native four projection still differs from existing signed role authority'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(projection->'modules') m
  WHERE m->>'moduleId'='time-tracker' AND (m->>'allowed')::boolean) THEN
  RAISE EXCEPTION 'Unassigned owner still shown authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(projection->'modules') m
  WHERE m->>'moduleId'='order-intake' AND (m->>'allowed')::boolean) THEN
  RAISE EXCEPTION 'Unrelated board-linked module behavior changed'; END IF;
END;
$after$;
-- No runtime authority changed: synthetic scoped role assignment becomes visible
-- only when existing has_module_access and module_role_for agree.
INSERT INTO public.apsyntra_workspace_module_roles(workspace_id,user_id,module_id,role,enabled)
VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','time-tracker','Employee',true);
DO $assigned$
DECLARE m jsonb;
BEGIN
 IF NOT public.has_module_access('time-tracker') THEN RAISE EXCEPTION 'Authoritative module assignment remains denied'; END IF;
 SELECT v INTO m FROM jsonb_array_elements(public.apsyntra_crm_my_effective_access()->'modules') v WHERE v->>'moduleId'='time-tracker';
 IF m->>'role' IS DISTINCT FROM public.module_role_for('time-tracker') OR m->>'allowed'<>'true' THEN
  RAISE EXCEPTION 'Assigned native role projection did not follow authoritative runtime'; END IF;
END;
$assigned$;
SELECT 'CP_CRM_URM_INTEGRITY_03B_PROJECTION_PARITY_PASS' AS result;
