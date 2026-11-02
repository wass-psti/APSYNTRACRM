-- CP-TT-GPS-04 — Fix CTE lifetime in signed, privileged GPS evidence RPC.
-- Production change requires controlled review; installs no new grants,
-- no tracking, no employee record modifications; preserves signed-role checks.
-- Previously 'bounded' was referenced from RETURN outside its WITH statement.
-- Run only once with authorized migration tracking; inspect preflight first.
BEGIN;
CREATE OR REPLACE FUNCTION public.timetracker_gps_snapshot(
 p_board_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_actor uuid:=auth.uid();
 v_ws uuid;
 v_role text;
 v_state jsonb;
 v_count integer;
 v_events jsonb;
 v_truncated boolean:=false;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_role:=public.module_role_for('time-tracker',v_actor);
 IF NOT (public.apsyntra_role_is_bootstrap() OR v_role='Supervisor') THEN
  RAISE EXCEPTION 'Privileged GPS evidence access denied' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR
    p_to-p_from>30 OR p_to>(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date THEN
  RAISE EXCEPTION 'Invalid GPS evidence date window (31 days maximum)' USING ERRCODE='22023';
 END IF;
 IF p_user_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id
   WHERE w.user_id=p_user_id AND w.workspace_id=v_ws AND w.active=true
     AND p.status='active'
 ) THEN
  RAISE EXCEPTION 'GPS filter user outside active workspace' USING ERRCODE='42501';
 END IF;
 SELECT e.value::jsonb INTO v_state FROM public.module_state_entries e
 WHERE e.workspace_id=v_ws AND e.module_id='time-tracker'
   AND e.state_key='timetracker.attendance.v1' AND e.scope='shared' AND e.owner_key='*';
 IF v_state IS NULL THEN
  v_state:=pg_catalog.jsonb_build_object('version',1,'records','[]'::jsonb);
 END IF;
 IF v_state->>'version'<>'1' OR pg_catalog.jsonb_typeof(v_state->'records')<>'array' OR
    pg_catalog.jsonb_array_length(v_state->'records')>25000 THEN
  RAISE EXCEPTION 'GPS evidence state contract invalid' USING ERRCODE='22023';
 END IF;
 WITH active_members AS (
  SELECT w.user_id,COALESCE(NULLIF(p.display_name,''),'Workforce member') AS display_name
  FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id
  WHERE w.workspace_id=v_ws AND w.active=true AND p.status='active'
    AND (p_user_id IS NULL OR w.user_id=p_user_id)
 ), valid_events AS (
  SELECT r.value->>'id' AS record_id,
   am.user_id,am.display_name,
   e.kind,e.fix,
   r.value->'clockIn'->>'location' AS work_location,
   r.value->'clockIn'->>'department' AS department
  FROM pg_catalog.jsonb_array_elements(v_state->'records') r(value)
  JOIN active_members am ON r.value->>'ownerId'='cloud:'||am.user_id::text
  CROSS JOIN LATERAL (
   VALUES ('in'::text,r.value->'clockIn'),
          ('out'::text,r.value->'clockOut')
  ) e(kind,fix)
  WHERE pg_catalog.jsonb_typeof(r.value)='object'
    AND pg_catalog.jsonb_typeof(e.fix)='object'
    AND pg_catalog.jsonb_typeof(e.fix->'geo')='object'
    AND e.fix->'geo'->>'status'='captured'
    AND e.fix->>'timestamp' IS NOT NULL
    AND (e.fix->>'timestamp') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    AND (e.fix->'geo'->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (e.fix->'geo'->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND (e.fix->'geo'->>'accuracy') ~ '^[0-9]+(\.[0-9]+)?$'
 ), sanitized AS (
  SELECT record_id,user_id,display_name,kind,work_location,department,
    (fix->>'timestamp')::timestamptz AS event_at,
    (fix->'geo'->>'latitude')::double precision AS lat,
    (fix->'geo'->>'longitude')::double precision AS lon,
    (fix->'geo'->>'accuracy')::double precision AS accuracy_m,
    fix->'geo'->>'source' AS source
  FROM valid_events
 ), bounded AS (
  SELECT * FROM sanitized
  WHERE (event_at AT TIME ZONE 'Asia/Manila')::date BETWEEN p_from AND p_to
    AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
    AND accuracy_m BETWEEN 0 AND 100000
  ORDER BY event_at DESC,record_id,kind LIMIT 501
 ), first_five_hundred AS (
  SELECT * FROM bounded ORDER BY event_at DESC,record_id,kind LIMIT 500
 )
 SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'recordId',LEFT(record_id,150),'userId',user_id::text,
   'name',LEFT(display_name,100),'kind',kind,'timestamp',event_at,
   'latitude',lat,'longitude',lon,'accuracyM',accuracy_m,
   'source',CASE WHEN source='browser-geolocation' THEN 'Browser GPS' ELSE 'Reported GPS' END,
   'department',LEFT(COALESCE(department,''),80),
   'location',LEFT(COALESCE(work_location,''),100)
 ) ORDER BY event_at DESC),COUNT(*),
  (SELECT COUNT(*)=501 FROM bounded)
 INTO v_events,v_count,v_truncated FROM first_five_hundred;
 -- Count only authorized, sanitized GPS fixes (no device signature or raw notes).
 RETURN pg_catalog.jsonb_build_object(
  'scope','AUTHORIZED_WORKSPACE_GPS','actorId',v_actor::text,
  'workspaceId',v_ws::text,'boardId',p_board_id::text,
  'from',p_from,'to',p_to,'events',COALESCE(v_events,'[]'::jsonb),
  'truncated',COALESCE(v_truncated,false)
 );
END;
$$;
REVOKE ALL ON FUNCTION public.timetracker_gps_snapshot(uuid,date,date,uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_gps_snapshot(uuid,date,date,uuid)
 TO authenticated;
COMMIT;
