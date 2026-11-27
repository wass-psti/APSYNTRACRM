-- Disposable synthetic fixture for CP-TT-LOG-LOCATION-01A.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth,public,private TO authenticated,anon;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated,anon;
REVOKE ALL ON auth.sessions FROM PUBLIC,authenticated,anon;

CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text,status text NOT NULL,platform_role text NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),active boolean NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.work_boards(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 name text NOT NULL,status text NOT NULL,archived_at timestamptz,trashed_at timestamptz);
CREATE TABLE public.module_role_assignments(user_id uuid NOT NULL REFERENCES public.profiles(id),
 module_id text NOT NULL,enabled boolean NOT NULL,role text NOT NULL,PRIMARY KEY(user_id,module_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY REFERENCES public.profiles(id));
CREATE TABLE public.module_state_entries(workspace_id uuid NOT NULL,module_id text NOT NULL,state_key text NOT NULL,
 scope text NOT NULL,owner_key text NOT NULL,value text NOT NULL,
 PRIMARY KEY(workspace_id,module_id,state_key,scope,owner_key));

CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT wm.workspace_id FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.user_id=p_user_id AND wm.active AND p.status='active'
 ORDER BY wm.workspace_id LIMIT 1 $$;
CREATE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.module_role_assignments m
 JOIN public.profiles p ON p.id=m.user_id WHERE m.user_id=p_user_id
 AND m.module_id=p_module_id AND m.enabled AND p.status='active')
 AND public.current_workspace_id(p_user_id) IS NOT NULL $$;
CREATE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT m.role FROM public.module_role_assignments m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.module_id=p_module_id AND m.enabled AND p.status='active' $$;
CREATE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities bi
 JOIN public.profiles p ON p.id=bi.user_id WHERE bi.user_id=auth.uid() AND p.status='active') $$;
CREATE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $scope$
DECLARE v_actor uuid:=auth.uid(); v_sid text:=auth.jwt()->>'session_id'; v_ws uuid;
BEGIN
 IF v_actor IS NULL OR v_sid IS NULL OR v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=v_sid::uuid AND s.user_id=v_actor
  AND (s.not_after IS NULL OR s.not_after>clock_timestamp())) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 v_ws:=public.current_workspace_id(v_actor);
 IF v_ws IS NULL OR p_board_id IS DISTINCT FROM '46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
 OR public.has_module_access('time-tracker',v_actor) IS DISTINCT FROM TRUE
 OR public.module_role_for('time-tracker',v_actor) IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id AND b.workspace_id=v_ws
  AND b.name='TimeTracker Attendance' AND b.description LIKE '[APSYNTRA:MODULE:timetracker:v1]%'
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL) THEN
  RAISE EXCEPTION 'Signed TimeTracker application, board or workspace access denied' USING ERRCODE='42501';
 END IF;
 RETURN v_ws;
END;
$scope$;

INSERT INTO public.workspaces(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,display_name,status,platform_role) VALUES
 ('10000000-0000-4000-8000-000000000011','Synthetic Employee','active','employee'),
 ('10000000-0000-4000-8000-000000000012','Synthetic HR','active','hr'),
 ('10000000-0000-4000-8000-000000000013','Synthetic System Admin','active','admin_general_manager'),
 ('10000000-0000-4000-8000-000000000014','Synthetic Supervisor','active','employee'),
 ('10000000-0000-4000-8000-000000000015','Synthetic Bootstrap','active','admin_general_manager'),
 ('10000000-0000-4000-8000-000000000016','Synthetic Ordinary Employee','active','employee'),
 ('20000000-0000-4000-8000-000000000017','Synthetic Foreign Employee','active','employee');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000013',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000014',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000015',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000016',true),
 ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000017',true);
INSERT INTO public.work_boards(id,workspace_id,name,description,status) VALUES
 ('46bf4ee7-368a-4c35-842c-8593ea1f6ac3','10000000-0000-4000-8000-000000000001','TimeTracker Attendance','[APSYNTRA:MODULE:timetracker:v1]','active'),
 ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000002','TimeTracker Attendance','[APSYNTRA:MODULE:timetracker:v1]','active');
INSERT INTO public.module_role_assignments(user_id,module_id,enabled,role) VALUES
 ('10000000-0000-4000-8000-000000000011','time-tracker',true,'Employee'),
 ('10000000-0000-4000-8000-000000000012','time-tracker',true,'HR'),
 ('10000000-0000-4000-8000-000000000013','time-tracker',true,'System Admin'),
 ('10000000-0000-4000-8000-000000000014','time-tracker',true,'Supervisor'),
 ('10000000-0000-4000-8000-000000000015','time-tracker',true,'Employee'),
 ('10000000-0000-4000-8000-000000000016','time-tracker',true,'Employee'),
 ('20000000-0000-4000-8000-000000000017','time-tracker',true,'Employee');
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id) VALUES('10000000-0000-4000-8000-000000000015');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000011',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000012',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000013',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000014',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000015',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000036','10000000-0000-4000-8000-000000000016',now()+interval '2 hours'),
 ('20000000-0000-4000-8000-000000000037','20000000-0000-4000-8000-000000000017',now()+interval '2 hours');

DO $attendance$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_records jsonb;
BEGIN
 v_records:=pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('id','synthetic-gps-record-1',
   'ownerId','cloud:10000000-0000-4000-8000-000000000011',
   'clockIn',pg_catalog.jsonb_build_object('timestamp',to_char((v_now-interval '4 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'location','Office-Base Duty','department','Engineering','geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation','latitude',10.2,'longitude',123.9,'accuracy',14)),
   'clockOut',pg_catalog.jsonb_build_object('timestamp',to_char((v_now-interval '1 hour') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation','latitude',10.3,'longitude',123.8,'accuracy',15))),
  pg_catalog.jsonb_build_object('id','synthetic-gps-record-2',
   'ownerId','cloud:10000000-0000-4000-8000-000000000011',
   'clockIn',pg_catalog.jsonb_build_object('timestamp',to_char((v_now-interval '3 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'location','Offsite (Home)','department','Engineering','geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation','latitude',10.4,'longitude',123.7,'accuracy',16)),
   'clockOut',pg_catalog.jsonb_build_object('timestamp',to_char((v_now-interval '2 hours') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reason','server_auto_clockout','geo',pg_catalog.jsonb_build_object('status','not_captured','source','server-auto-clockout')))
 );
 INSERT INTO public.module_state_entries VALUES(
  '10000000-0000-4000-8000-000000000001','time-tracker','timetracker.attendance.v1','shared','*',
  pg_catalog.jsonb_build_object('version',1,'records',v_records)::text);
END;
$attendance$;
