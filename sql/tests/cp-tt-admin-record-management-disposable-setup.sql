-- CP-TT-FM1-ARM-01: disposable PostgreSQL 17 only.
-- Run after the existing CP-TT-GPS01 fixture and projection migration.
\set ON_ERROR_STOP on

CREATE TABLE public.module_state_entries (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  module_id text NOT NULL,
  state_key text NOT NULL,
  scope text NOT NULL,
  owner_key text NOT NULL,
  value text NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_state_entries_pkey PRIMARY KEY (workspace_id,module_id,state_key,scope,owner_key)
);

CREATE OR REPLACE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT p_module_id='time-tracker' AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.profiles p ON p.id=wm.user_id
    WHERE wm.user_id=p_user_id AND wm.active=true AND p.status='active'
  );
$function$;

-- The role override is transaction-local test input. Existing GPS fixture tests
-- retain their Supervisor default when the override is unset.
CREATE OR REPLACE FUNCTION public.module_role_for(p_module_id text,p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_module_id<>'time-tracker' OR p_user_id IS NULL THEN NULL
    WHEN NULLIF(current_setting('app.tt_admin_test_role',true),'') IS NOT NULL
      THEN current_setting('app.tt_admin_test_role',true)
    WHEN p_user_id='20000000-0000-4000-8000-000000000001'::uuid THEN 'Supervisor'
    ELSE 'Employee'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.module_state_invariants_valid(
  p_module_id text,p_state_key text,p_value text
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
DECLARE
  j jsonb;
  total_count integer;
  distinct_count integer;
  invalid_count integer;
  active_duplicate_count integer;
BEGIN
  BEGIN j:=p_value::jsonb; EXCEPTION WHEN OTHERS THEN RETURN false; END;
  IF p_module_id='time-tracker' AND p_state_key IN (
    'timetracker.attendance.v1','timetracker.attendance.v1.backup'
  ) THEN
    IF pg_catalog.jsonb_typeof(j)<>'object'
      OR pg_catalog.jsonb_typeof(COALESCE(j->'records','[]'::jsonb))<>'array' THEN
      RETURN false;
    END IF;
    SELECT count(*),count(DISTINCT x->>'id'),
      count(*) FILTER (WHERE NULLIF(pg_catalog.btrim(COALESCE(x->>'id','')),'') IS NULL
        OR NULLIF(pg_catalog.btrim(COALESCE(x->>'ownerId','')),'') IS NULL)
    INTO total_count,distinct_count,invalid_count
    FROM pg_catalog.jsonb_array_elements(COALESCE(j->'records','[]'::jsonb)) x;
    IF total_count<>distinct_count OR invalid_count>0 THEN RETURN false; END IF;
    SELECT count(*) INTO active_duplicate_count FROM (
      SELECT x->>'ownerId' owner_id
      FROM pg_catalog.jsonb_array_elements(COALESCE(j->'records','[]'::jsonb)) x
      WHERE x->'clockOut' IS NULL OR x->'clockOut'='null'::jsonb
      GROUP BY x->>'ownerId' HAVING count(*)>1
    ) duplicates;
    RETURN active_duplicate_count=0;
  END IF;
  RETURN true;
END;
$function$;

INSERT INTO public.module_state_entries(
  workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by
) VALUES (
  '10000000-0000-4000-8000-000000000001','time-tracker',
  'timetracker.attendance.v1','shared','*',
  pg_catalog.jsonb_build_object('version',1,'selection',pg_catalog.jsonb_build_object(
    'location','','department',''),'records',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id','50000000-0000-4000-8000-000000000001',
        'ownerId','cloud:20000000-0000-4000-8000-000000000002',
        'ownerName','Test Employee',
        'clockIn',pg_catalog.jsonb_build_object(
          'location','Office-Base Duty','department','Information Technology',
          'timestamp','2026-11-14T00:00:00Z',
          'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation',
            'latitude',10.30,'longitude',123.90,'accuracy',15,'capturedAt','2026-11-14T00:00:00Z')),
        'clockOut','null'::jsonb),
      pg_catalog.jsonb_build_object(
        'id','50000000-0000-4000-8000-000000000002',
        'ownerId','cloud:20000000-0000-4000-8000-000000000002',
        'ownerName','Test Employee',
        'clockIn',pg_catalog.jsonb_build_object(
          'location','Office-Base Duty','department','Information Technology',
          'timestamp','2026-11-13T00:00:00Z',
          'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation',
            'latitude',10.30,'longitude',123.90,'accuracy',15,'capturedAt','2026-11-13T00:00:00Z')),
        'clockOut',pg_catalog.jsonb_build_object(
          'location','Office-Base Duty','department','Information Technology',
          'timestamp','2026-11-13T09:00:00Z',
          'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation',
            'latitude',10.31,'longitude',123.91,'accuracy',16,'capturedAt','2026-11-13T09:00:00Z'))),
      pg_catalog.jsonb_build_object(
        'id','50000000-0000-4000-8000-000000000003',
        'ownerId','cloud:20000000-0000-4000-8000-000000000002',
        'ownerName','Test Employee',
        'clockIn',pg_catalog.jsonb_build_object(
          'location','Office-Base Duty','department','Information Technology',
          'timestamp','2026-11-12T00:00:00Z',
          'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation',
            'latitude',10.30,'longitude',123.90,'accuracy',15,'capturedAt','2026-11-12T00:00:00Z')),
        'clockOut',pg_catalog.jsonb_build_object(
          'location','Office-Base Duty','department','Information Technology',
          'timestamp','2026-11-12T09:00:00Z',
          'geo',pg_catalog.jsonb_build_object('status','captured','source','browser-geolocation',
            'latitude',10.31,'longitude',123.91,'accuracy',16,'capturedAt','2026-11-12T09:00:00Z')))
    ))::text,1,'20000000-0000-4000-8000-000000000001'
);

INSERT INTO public.work_board_items(
  id,board_id,group_id,title,status,position,created_by,updated_by
) VALUES
 ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001','Attendance test 001','in_progress',10,
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001','Attendance test 002','done',11,
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001','Attendance test 003','done',12,
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');

INSERT INTO private.tt_attendance_board_projection(
  workspace_id,board_id,record_id,board_item_id,employee_id,source_revision,
  clock_in_at,clock_out_at,clock_in_geo,clock_out_geo,
  clock_in_location,clock_out_location,credited_ms
) VALUES
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',1,'2026-11-14T00:00:00Z',NULL,
  '{"status":"captured","source":"browser-geolocation","latitude":10.30,"longitude":123.90,"accuracy":15}'::jsonb,
  NULL,'Office-Base Duty',NULL,NULL),
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',1,'2026-11-13T00:00:00Z','2026-11-13T09:00:00Z',
  '{"status":"captured","source":"browser-geolocation","latitude":10.30,"longitude":123.90,"accuracy":15}'::jsonb,
  '{"status":"captured","source":"browser-geolocation","latitude":10.31,"longitude":123.91,"accuracy":16}'::jsonb,
  'Office-Base Duty','Office-Base Duty',28800000),
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000002',1,'2026-11-12T00:00:00Z','2026-11-12T09:00:00Z',
  '{"status":"captured","source":"browser-geolocation","latitude":10.30,"longitude":123.90,"accuracy":15}'::jsonb,
  '{"status":"captured","source":"browser-geolocation","latitude":10.31,"longitude":123.91,"accuracy":16}'::jsonb,
  'Office-Base Duty','Office-Base Duty',28800000);

\echo 'CP-TT-ARM-01 disposable setup ready: 3 synthetic attendance records and linked projections.'
