-- CP-APP-LOAD-02 isolated PostgreSQL 17 fixture. Never run on production.
\set ON_ERROR_STOP on

DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
END
$roles$;

CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE
AS $jwt$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$jwt$;
CREATE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $uid$
 SELECT nullif(auth.jwt()->>'sub','')::uuid
$uid$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated,anon;

CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz
);
CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,status text NOT NULL
);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.work_boards(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 name text NOT NULL,description text NOT NULL,status text NOT NULL,
 archived_at timestamptz,trashed_at timestamptz
);
CREATE TABLE public.module_role_assignments(
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 module_id text NOT NULL,enabled boolean NOT NULL,role text NOT NULL,
 PRIMARY KEY(user_id,module_id)
);
CREATE TABLE public.module_state_entries(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL,state_key text NOT NULL,scope text NOT NULL,
 owner_key text NOT NULL,value text NOT NULL,revision bigint NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(workspace_id,module_id,state_key,scope,owner_key)
);

CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $workspace$
 SELECT wm.workspace_id
 FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.user_id=p_user_id AND wm.active AND p.status='active'
 ORDER BY wm.workspace_id LIMIT 1
$workspace$;

CREATE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $module$
 SELECT EXISTS(
  SELECT 1 FROM public.module_role_assignments m
  JOIN public.profiles p ON p.id=m.user_id
  WHERE m.user_id=p_user_id AND m.module_id=p_module_id
   AND m.enabled AND p.status='active'
 ) AND public.current_workspace_id(p_user_id) IS NOT NULL
$module$;

CREATE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT m.role FROM public.module_role_assignments m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.module_id=p_module_id
  AND m.enabled AND p.status='active'
$role$;

CREATE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $scope$
DECLARE
 v_actor uuid:=auth.uid();
 v_session text:=auth.jwt()->>'session_id';
 v_workspace uuid;
BEGIN
 IF v_actor IS NULL OR v_session IS NULL OR
    v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    NOT EXISTS(SELECT 1 FROM auth.sessions s
      WHERE s.id=v_session::uuid AND s.user_id=v_actor
       AND (s.not_after IS NULL OR s.not_after>pg_catalog.clock_timestamp())) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 v_workspace:=public.current_workspace_id(v_actor);
 IF v_workspace IS NULL OR
    public.has_module_access('time-tracker',v_actor) IS DISTINCT FROM TRUE OR
    public.module_role_for('time-tracker',v_actor) IS NULL OR
    NOT EXISTS(SELECT 1 FROM public.work_boards b
      WHERE b.id=p_board_id AND b.workspace_id=v_workspace
       AND b.name='TimeTracker Attendance'
       AND b.description LIKE '[APSYNTRA:MODULE:timetracker:v1]%'
       AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL) THEN
  RAISE EXCEPTION 'Signed TimeTracker application, board or workspace access denied'
   USING ERRCODE='42501';
 END IF;
 RETURN v_workspace;
END
$scope$;

CREATE FUNCTION public.module_state_visible_value(
 p_module_id text,p_state_key text,p_state_value text,p_actor uuid
) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $visible$
 SELECT p_state_value
 WHERE p_module_id='time-tracker'
  AND p_state_key='timetracker.attendance.v1'
  AND p_actor=auth.uid()
  AND public.has_module_access(p_module_id,p_actor)
$visible$;

INSERT INTO public.workspaces(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,status) VALUES
 ('10000000-0000-4000-8000-000000000011','active'),
 ('10000000-0000-4000-8000-000000000012','active'),
 ('10000000-0000-4000-8000-000000000013','active'),
 ('20000000-0000-4000-8000-000000000015','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000013',true),
 ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000015',true);
INSERT INTO public.work_boards(id,workspace_id,name,description,status) VALUES
 ('10000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000001','TimeTracker Attendance',
  '[APSYNTRA:MODULE:timetracker:v1] disposable fixture','active');
INSERT INTO public.module_role_assignments(user_id,module_id,enabled,role) VALUES
 ('10000000-0000-4000-8000-000000000011','time-tracker',true,'Employee'),
 ('10000000-0000-4000-8000-000000000012','time-tracker',true,'Employee'),
 ('20000000-0000-4000-8000-000000000015','time-tracker',true,'Employee');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('10000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000011',pg_catalog.clock_timestamp()+INTERVAL '2 hours'),
 ('10000000-0000-4000-8000-000000000032',
  '10000000-0000-4000-8000-000000000012',pg_catalog.clock_timestamp()+INTERVAL '2 hours'),
 ('10000000-0000-4000-8000-000000000033',
  '10000000-0000-4000-8000-000000000013',pg_catalog.clock_timestamp()+INTERVAL '2 hours'),
 ('20000000-0000-4000-8000-000000000035',
  '20000000-0000-4000-8000-000000000015',pg_catalog.clock_timestamp()+INTERVAL '2 hours');

-- A realistic large shared attendance document: 20 records for Employee A,
-- 980 for Employee B, GPS on closed records and one active Employee A session.
WITH generated AS (
 SELECT g,
  pg_catalog.jsonb_build_object(
   'id','session-'||g::text,
   'ownerId',CASE WHEN g%50=0
    THEN 'cloud:10000000-0000-4000-8000-000000000011'
    ELSE 'cloud:10000000-0000-4000-8000-000000000012' END,
   'clockIn',pg_catalog.jsonb_build_object(
    'timestamp','2026-11-24T08:00:00.000Z','location','Office-Base Duty',
    'department','HR','geo',pg_catalog.jsonb_build_object(
     'status','captured','latitude',10.2,'longitude',123.9,'accuracy',14)),
   'clockOut',CASE WHEN g=50 THEN NULL ELSE pg_catalog.jsonb_build_object(
    'timestamp','2026-11-24T17:00:00.000Z','geo',pg_catalog.jsonb_build_object(
     'status','captured','latitude',10.3,'longitude',124.0,'accuracy',15)) END
  ) AS record
 FROM pg_catalog.generate_series(1,1000) g
)
INSERT INTO public.module_state_entries(
 workspace_id,module_id,state_key,scope,owner_key,value,revision
)
SELECT '10000000-0000-4000-8000-000000000001','time-tracker',
 'timetracker.attendance.v1','shared','*',
 pg_catalog.jsonb_build_object('version',1,
  'records',pg_catalog.jsonb_agg(record ORDER BY g))::text,42
FROM generated;

-- Unrelated state rows must not appear in the Clock projection.
INSERT INTO public.module_state_entries(
 workspace_id,module_id,state_key,scope,owner_key,value,revision
) VALUES
 ('10000000-0000-4000-8000-000000000001','time-tracker',
  'timetracker.attendance.v1.backup','shared','*',
  pg_catalog.jsonb_build_object('version',1,'records',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('privateBackupPayload',pg_catalog.repeat('x',8000))))::text,3),
 ('10000000-0000-4000-8000-000000000001','time-tracker',
  'timetracker.ot.v1','shared','*',
  pg_catalog.jsonb_build_object('version',1,'requests',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('task',pg_catalog.repeat('o',8000))))::text,4);
