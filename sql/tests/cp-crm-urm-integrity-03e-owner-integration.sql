\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.profiles(id,platform_role,status) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','employee','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
INSERT INTO private.ws02_personal_workspaces(workspace_id,user_id)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
SELECT set_config('test.actor','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('test.workspace','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE usr uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; m text;
BEGIN
 FOREACH m IN ARRAY ARRAY['time-tracker','fund-released-tracker','fueltrack-plus','tradelink'] LOOP
  IF public.module_role_for(m,usr) IS DISTINCT FROM
   private.cp_crm_urm_03d_owner_native_role_candidate(usr,public.current_workspace_id(usr),m)
  OR public.has_module_access(m,usr) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Owner role integration absent: %',m;
  END IF;
 END LOOP;
 IF public.has_module_access('order-intake',usr) THEN RAISE EXCEPTION 'Unexpected access to fifth application'; END IF;
 IF public.module_role_for('time-tracker','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM 'Supervisor' THEN
  RAISE EXCEPTION 'Employee existing scoped role was unexpectedly changed'; END IF;
END;$test$;
-- Explicit disabled scoped assignment is authoritative over the proposal.
INSERT INTO public.apsyntra_workspace_module_roles(workspace_id,user_id,module_id,role,enabled)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','time-tracker','System Admin',false);
DO $test$ BEGIN
 IF public.has_module_access('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 OR public.module_role_for('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS NOT NULL
 THEN RAISE EXCEPTION 'Explicit disabled module role bypassed'; END IF;
END;$test$;
DELETE FROM public.apsyntra_workspace_module_roles WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
-- Existing enabled legacy assignment must retain precedence.
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled)
 VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','time-tracker','Employee',true);
DO $test$ BEGIN
 IF public.module_role_for('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS DISTINCT FROM 'Employee'
 THEN RAISE EXCEPTION 'Legacy role precedence lost'; END IF;
END;$test$;
DELETE FROM public.module_role_assignments WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
-- An explicit CRM ceiling prevents owner fallback.
INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
DO $test$ BEGIN
 IF public.has_module_access('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 THEN RAISE EXCEPTION 'Workspace CRM ceiling bypassed'; END IF;
END;$test$;
DELETE FROM public.apsyntra_crm_platform_roles WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
-- Context switching and inactive membership cannot transport the personal role.
SELECT set_config('test.workspace','22222222-2222-4222-8222-222222222222',true);
DO $test$ BEGIN
 IF public.has_module_access('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 THEN RAISE EXCEPTION 'Foreign selected workspace was granted access'; END IF;
END;$test$;
SELECT set_config('test.workspace','11111111-1111-4111-8111-111111111111',true);
UPDATE public.workspace_members SET active=false WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
DO $test$ BEGIN
 IF public.has_module_access('time-tracker','dddddddd-dddd-4ddd-8ddd-dddddddddddd')
 THEN RAISE EXCEPTION 'Inactive membership was granted access'; END IF;
END;$test$;
ROLLBACK;
SELECT 'CP_CRM_URM_INTEGRITY_03E_DISPOSABLE_OWNER_INTEGRATION_PASS' AS result;
