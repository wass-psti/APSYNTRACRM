\set ON_ERROR_STOP on
BEGIN;
-- New synthetic personal Main Workspace owner; no production account changes.
INSERT INTO auth.users(id) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.profiles(id,platform_role,status)
 VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','employee','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
INSERT INTO private.ws02_personal_workspaces(workspace_id,user_id)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
SELECT set_config('test.actor','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('test.workspace','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE usr uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 ws uuid:='11111111-1111-4111-8111-111111111111';
 m text;r text;
BEGIN
 IF public.apsyntra_crm_effective_role(usr,ws)<>'admin' THEN RAISE EXCEPTION 'Fixture owner is not effective CRM Admin'; END IF;
 FOREACH m IN ARRAY ARRAY['time-tracker','fund-released-tracker','fueltrack-plus','tradelink'] LOOP
   r:=private.cp_crm_urm_03d_owner_native_role_candidate(usr,ws,m);
   IF r IS NULL THEN RAISE EXCEPTION 'Expected candidate role absent for %',m; END IF;
 END LOOP;
 IF private.cp_crm_urm_03d_owner_native_role_candidate(usr,ws,'order-intake') IS NOT NULL
 THEN RAISE EXCEPTION 'Candidate changed one of eight non-native modules'; END IF;
 IF private.cp_crm_urm_03d_owner_native_role_candidate('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ws,'time-tracker') IS NOT NULL
 THEN RAISE EXCEPTION 'Nonowner employee qualified for owner role'; END IF;
 IF public.has_module_access('time-tracker',usr) THEN RAISE EXCEPTION 'Candidate accidentally changed live module access'; END IF;
 IF public.module_role_for('time-tracker',usr) IS NOT NULL THEN RAISE EXCEPTION 'Candidate accidentally changed actual module role'; END IF;
END;
$test$;
-- Selecting an unrelated workspace cannot transport personal owner role.
SELECT set_config('test.workspace','22222222-2222-4222-8222-222222222222',true);
DO $test$
BEGIN
 IF private.cp_crm_urm_03d_owner_native_role_candidate(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '11111111-1111-4111-8111-111111111111','time-tracker') IS NOT NULL
 THEN RAISE EXCEPTION 'Owner native role leaked across selected workspaces'; END IF;
END;
$test$;
SELECT set_config('test.workspace','11111111-1111-4111-8111-111111111111',true);
-- Respect explicit CRM overrides; no bypass of existing platform ceilings.
INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role)
 VALUES('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
DO $test$ BEGIN
 IF private.cp_crm_urm_03d_owner_native_role_candidate(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '11111111-1111-4111-8111-111111111111','time-tracker') IS NOT NULL
 THEN RAISE EXCEPTION 'Owner candidate bypassed explicit CRM ceiling'; END IF;
END;$test$;
DELETE FROM public.apsyntra_crm_platform_roles WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
UPDATE public.workspace_members SET active=false WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
DO $test$ BEGIN
 IF private.cp_crm_urm_03d_owner_native_role_candidate(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '11111111-1111-4111-8111-111111111111','time-tracker') IS NOT NULL
 THEN RAISE EXCEPTION 'Inactive owner membership received native role'; END IF;
END;$test$;
UPDATE public.workspace_members SET active=true WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
UPDATE public.profiles SET status='inactive' WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
DO $test$ BEGIN
 IF private.cp_crm_urm_03d_owner_native_role_candidate(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '11111111-1111-4111-8111-111111111111','time-tracker') IS NOT NULL
 THEN RAISE EXCEPTION 'Inactive owner profile received native role'; END IF;
END;$test$;
ROLLBACK;
SELECT 'CP_CRM_URM_INTEGRITY_03D_OWNER_POLICY_CANDIDATE_PASS' AS result;
