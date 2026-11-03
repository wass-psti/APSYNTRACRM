-- CP-TT-GPS01 — STAGED, NOT DEPLOYED. Separate approval is required for
-- production attendance function replacement and private projection table.
-- Existing authoritative attendance commits remain the only source of truth.
BEGIN;

DO $gate$
BEGIN
 IF to_regnamespace('private') IS NULL
 OR to_regclass('private.tt_attendance_board_projection') IS NOT NULL
 OR (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='timetracker_attendance_commit_v2')
    IS DISTINCT FROM '93540708e0a99494c5b038f0eeabbcca'
 THEN RAISE EXCEPTION 'CP-TT-GPS01 deployment drift or preexisting projection; abort'
    USING ERRCODE='42501';
 END IF;
END $gate$;

CREATE TABLE private.tt_attendance_board_projection (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 record_id uuid NOT NULL,
 board_item_id uuid NOT NULL UNIQUE REFERENCES public.work_board_items(id) ON DELETE RESTRICT,
 employee_id uuid NOT NULL REFERENCES public.profiles(id),
 source_revision bigint NOT NULL CHECK(source_revision>0),
 clock_in_at timestamptz NOT NULL,
 clock_out_at timestamptz,
 clock_in_geo jsonb NOT NULL CHECK(jsonb_typeof(clock_in_geo)='object'),
 clock_out_geo jsonb CHECK(clock_out_geo IS NULL OR jsonb_typeof(clock_out_geo)='object'),
 clock_in_location text NOT NULL,
 clock_out_location text,
 credited_ms bigint CHECK(credited_ms IS NULL OR credited_ms>=0),
 modified_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(board_id,record_id),
 CHECK (clock_out_at IS NULL OR clock_out_at>=clock_in_at),
 CHECK ((clock_out_at IS NULL)=(clock_out_geo IS NULL))
);
CREATE INDEX tt_board_projection_workspace_idx
 ON private.tt_attendance_board_projection(workspace_id,clock_in_at DESC,record_id);
ALTER TABLE private.tt_attendance_board_projection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tt_attendance_board_projection FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tt_attendance_credited_ms(p_in timestamptz,p_out timestamptz)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $credit$
DECLARE d date; lunch_start timestamptz; lunch_end timestamptz;
 overlap_start timestamptz; overlap_end timestamptz;
 total_ms numeric; break_ms numeric:=0;
BEGIN
 IF p_in IS NULL OR p_out IS NULL OR p_out<=p_in THEN RETURN 0; END IF;
 IF p_out>p_in+INTERVAL '370 days' THEN
  RAISE EXCEPTION 'Attendance duration exceeds supported policy window' USING ERRCODE='22023';
 END IF;
 FOR d IN SELECT (p_in AT TIME ZONE 'Asia/Manila')::date+n
  FROM pg_catalog.generate_series(
   0,(p_out AT TIME ZONE 'Asia/Manila')::date-
     (p_in AT TIME ZONE 'Asia/Manila')::date) n LOOP
  lunch_start:=(d::timestamp+INTERVAL '12 hours') AT TIME ZONE 'Asia/Manila';
  lunch_end:=lunch_start+INTERVAL '1 hour';
  overlap_start:=GREATEST(p_in,lunch_start);
  overlap_end:=LEAST(p_out,lunch_end);
  IF overlap_end>overlap_start THEN
   break_ms:=break_ms+EXTRACT(epoch FROM overlap_end-overlap_start)*1000;
  END IF;
 END LOOP;
 total_ms:=EXTRACT(epoch FROM p_out-p_in)*1000-break_ms;
 RETURN GREATEST(0,pg_catalog.floor(total_ms))::bigint;
END $credit$;
REVOKE ALL ON FUNCTION private.tt_attendance_credited_ms(timestamptz,timestamptz)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tt_board_projection_upsert(
 p_board_id uuid,p_workspace_id uuid,p_employee_id uuid,p_record jsonb,
 p_revision bigint,p_action text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $sync$
DECLARE v_record_id uuid; v_existing private.tt_attendance_board_projection%ROWTYPE;
 v_item uuid; v_group uuid; v_creator uuid; v_clock_in timestamptz; v_clock_out timestamptz;
 v_in_geo jsonb; v_out_geo jsonb; v_hours numeric; v_credited bigint;
 v_status text; v_column record; v_value jsonb; v_label text; v_safe_name text;
 v_col_count integer;
BEGIN
 IF p_action NOT IN ('clock-in','clock-out') OR p_revision<=0 OR
    p_record IS NULL OR pg_catalog.jsonb_typeof(p_record)<>'object' OR
    p_record->>'ownerId' IS DISTINCT FROM 'cloud:'||p_employee_id::text OR
    coalesce(p_record->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'Attendance projection source identity invalid' USING ERRCODE='22023'; END IF;
 v_record_id:=(p_record->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
  AND b.workspace_id=p_workspace_id AND b.name='TimeTracker Attendance'
  AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL)
 THEN RAISE EXCEPTION 'Attendance projection board mismatch' USING ERRCODE='42501'; END IF;
 IF pg_catalog.jsonb_typeof(p_record->'clockIn')<>'object' OR
    pg_catalog.jsonb_typeof(p_record#>'{clockIn,geo}')<>'object' OR
    p_record#>>'{clockIn,geo,status}'<>'captured' THEN
  RAISE EXCEPTION 'Clock-in GPS evidence missing in authoritative record'
   USING ERRCODE='22023';
 END IF;
 v_clock_in:=(p_record#>>'{clockIn,timestamp}')::timestamptz;
 v_in_geo:=p_record#>'{clockIn,geo}';
 IF v_clock_in IS NULL OR v_in_geo->>'latitude' IS NULL OR
    v_in_geo->>'longitude' IS NULL OR v_in_geo->>'accuracy' IS NULL THEN
  RAISE EXCEPTION 'Clock-in GPS fix incomplete' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p_record->'clockOut')='object' THEN
  v_clock_out:=(p_record#>>'{clockOut,timestamp}')::timestamptz;
  v_out_geo:=p_record#>'{clockOut,geo}';
  IF v_clock_out IS NULL OR pg_catalog.jsonb_typeof(v_out_geo)<>'object'
   OR v_out_geo->>'status'<>'captured' OR v_out_geo->>'latitude' IS NULL
   OR v_out_geo->>'longitude' IS NULL OR v_out_geo->>'accuracy' IS NULL THEN
   RAISE EXCEPTION 'Clock-out GPS fix incomplete' USING ERRCODE='22023';
  END IF;
 END IF;
 IF (p_action='clock-in' AND v_clock_out IS NOT NULL) OR
    (p_action='clock-out' AND v_clock_out IS NULL) OR
    (v_clock_out IS NOT NULL AND v_clock_out<v_clock_in) THEN
  RAISE EXCEPTION 'Attendance lifecycle projection mismatch' USING ERRCODE='22023'; END IF;
 v_credited:=CASE WHEN v_clock_out IS NOT NULL
  THEN private.tt_attendance_credited_ms(v_clock_in,v_clock_out) END;
 v_hours:=CASE WHEN v_credited IS NULL THEN NULL
  ELSE pg_catalog.round(v_credited::numeric/3600000,2) END;
 v_status:=CASE WHEN v_clock_out IS NULL THEN 'in_progress' ELSE 'done' END;

 SELECT * INTO v_existing FROM private.tt_attendance_board_projection
  WHERE board_id=p_board_id AND record_id=v_record_id FOR UPDATE;
 IF FOUND THEN
  IF v_existing.workspace_id<>p_workspace_id OR v_existing.employee_id<>p_employee_id
   OR v_existing.clock_in_at IS DISTINCT FROM v_clock_in
   OR v_existing.clock_in_geo IS DISTINCT FROM v_in_geo THEN
   RAISE EXCEPTION 'Attendance projection lineage mismatch' USING ERRCODE='23514'; END IF;
  IF v_existing.clock_out_at IS NOT NULL
   AND (v_clock_out IS NULL OR v_existing.clock_out_at IS DISTINCT FROM v_clock_out
     OR v_existing.clock_out_geo IS DISTINCT FROM v_out_geo) THEN
   RAISE EXCEPTION 'Completed clock-out GPS cannot be replaced'
     USING ERRCODE='23514'; END IF;
  IF p_revision<v_existing.source_revision THEN
   RAISE EXCEPTION 'Stale attendance projection revision' USING ERRCODE='40001'; END IF;
  IF p_revision=v_existing.source_revision THEN
   IF v_existing.clock_out_at IS DISTINCT FROM v_clock_out
     OR v_existing.clock_out_geo IS DISTINCT FROM v_out_geo THEN
    RAISE EXCEPTION 'Conflicting attendance projection replay' USING ERRCODE='40001'; END IF;
   RETURN v_existing.board_item_id; -- Idempotent replay.
  END IF;
  v_item:=v_existing.board_item_id;
 ELSE
  SELECT g.id INTO v_group FROM public.work_board_groups g
   WHERE g.board_id=p_board_id ORDER BY g.position,g.id LIMIT 1;
  SELECT b.created_by INTO v_creator FROM public.work_boards b WHERE b.id=p_board_id;
  IF v_group IS NULL OR v_creator IS NULL THEN
   RAISE EXCEPTION 'Attendance board group or technical owner missing'
    USING ERRCODE='23503'; END IF;
  INSERT INTO public.work_board_items(
    board_id,group_id,title,status,position,created_by,updated_by)
  VALUES(p_board_id,v_group,'Attendance '||pg_catalog.left(v_record_id::text,8),
    v_status,(SELECT coalesce(max(position),-1)+1 FROM public.work_board_items
      WHERE board_id=p_board_id AND group_id=v_group),v_creator,v_creator)
  RETURNING id INTO v_item;
 END IF;

 -- GPS and employee identity are NEVER written to general board item/value tables.
 -- Only the private one-to-one extension contains location records.
 IF v_existing.board_item_id IS NULL THEN
  INSERT INTO private.tt_attendance_board_projection(
   workspace_id,board_id,record_id,board_item_id,employee_id,source_revision,
   clock_in_at,clock_out_at,clock_in_geo,clock_out_geo,clock_in_location,
   clock_out_location,credited_ms)
  VALUES(p_workspace_id,p_board_id,v_record_id,v_item,p_employee_id,p_revision,
   v_clock_in,v_clock_out,v_in_geo,v_out_geo,
   pg_catalog.left(coalesce(p_record#>>'{clockIn,location}',''),100),
   pg_catalog.left(coalesce(p_record#>>'{clockOut,location}',''),100),
   v_credited);
 ELSE
  UPDATE private.tt_attendance_board_projection SET
   source_revision=p_revision,clock_out_at=v_clock_out,clock_out_geo=v_out_geo,
   clock_out_location=pg_catalog.left(coalesce(p_record#>>'{clockOut,location}',''),100),
   credited_ms=v_credited,modified_at=pg_catalog.clock_timestamp()
  WHERE board_id=p_board_id AND record_id=v_record_id;
  UPDATE public.work_board_items SET status=v_status,updated_by=
   (SELECT created_by FROM public.work_boards WHERE id=p_board_id),
   updated_at=pg_catalog.clock_timestamp()
   WHERE id=v_item AND board_id=p_board_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projected item missing or removed' USING ERRCODE='23503'; END IF;
 END IF;

 SELECT count(*) INTO v_col_count FROM public.work_board_columns c WHERE c.board_id=p_board_id
  AND c.name IN ('Source Record ID','Source Revision','Sync State','Attendance Ref',
                 'Attendance Date','Hours Total','Attendance Status','Shift Ref');
 IF v_col_count<>8 THEN
  RAISE EXCEPTION 'Attendance board typed column contract drift' USING ERRCODE='23503';
 END IF;
 FOR v_column IN SELECT id,name,config FROM public.work_board_columns
  WHERE board_id=p_board_id AND name IN ('Source Record ID','Source Revision','Sync State',
   'Attendance Ref','Attendance Date','Hours Total','Attendance Status','Shift Ref') LOOP
  v_value:=NULL;
  CASE v_column.name
   WHEN 'Source Record ID' THEN v_value:=pg_catalog.to_jsonb(v_record_id::text);
   WHEN 'Source Revision' THEN v_value:=pg_catalog.to_jsonb(p_revision);
   WHEN 'Attendance Ref' THEN v_value:=pg_catalog.to_jsonb(v_record_id::text);
   WHEN 'Attendance Date' THEN v_value:=pg_catalog.to_jsonb((v_clock_in AT TIME ZONE 'Asia/Manila')::date::text);
   WHEN 'Hours Total' THEN IF v_hours IS NOT NULL THEN v_value:=pg_catalog.to_jsonb(v_hours); END IF;
   WHEN 'Sync State' THEN v_label:='Synchronized';
   WHEN 'Attendance Status' THEN v_label:=CASE WHEN v_clock_out IS NULL
    THEN 'In progress' ELSE 'Done' END;
   ELSE v_label:=NULL; -- No invented shift reference.
  END CASE;
  IF v_label IS NOT NULL THEN
   SELECT e->>'id' INTO v_safe_name FROM pg_catalog.jsonb_array_elements(v_column.config->'labels') e
    WHERE e->>'name'=v_label LIMIT 1;
   IF v_safe_name IS NULL THEN
    RAISE EXCEPTION 'Attendance board label contract drift' USING ERRCODE='23503'; END IF;
   v_value:=pg_catalog.to_jsonb(v_safe_name);
  END IF;
  IF v_value IS NOT NULL THEN
   INSERT INTO public.work_board_item_values(item_id,column_id,value,updated_by)
    VALUES(v_item,v_column.id,v_value,(SELECT created_by FROM public.work_boards WHERE id=p_board_id))
    ON CONFLICT(item_id,column_id) DO UPDATE SET
     value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,
     updated_at=pg_catalog.clock_timestamp();
  END IF;
  v_label:=NULL;v_safe_name:=NULL;
 END LOOP;
 RETURN v_item;
END $sync$;
REVOKE ALL ON FUNCTION private.tt_board_projection_upsert(uuid,uuid,uuid,jsonb,bigint,text)
 FROM PUBLIC,anon,authenticated;

-- Sensitive GPS is available only through this separately authorized endpoint,
-- not the broad wm_get_board RPC (which serves normal board members).
CREATE FUNCTION public.timetracker_board_private_snapshot(
 p_board_id uuid,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE v_ws uuid;v_actor uuid:=auth.uid();v_limit integer:=p_limit;
 v_rows jsonb;v_has_more boolean;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT (public.apsyntra_role_is_bootstrap() OR
   public.module_role_for('time-tracker',v_actor)='Supervisor') THEN
  RAISE EXCEPTION 'Restricted attendance GPS board access denied' USING ERRCODE='42501';
 END IF;
 IF v_limit IS NULL OR v_limit<1 OR v_limit>100 THEN
  RAISE EXCEPTION 'Attendance board page limit invalid' USING ERRCODE='22023';
 END IF;
 WITH latest AS (
  SELECT p.*,coalesce(nullif(e.display_name,''),'Workforce member') AS employee_name
  FROM private.tt_attendance_board_projection p
  JOIN public.profiles e ON e.id=p.employee_id
  WHERE p.workspace_id=v_ws AND p.board_id=p_board_id
  ORDER BY p.clock_in_at DESC,p.record_id DESC LIMIT (v_limit+1)
 ), visible AS (SELECT * FROM latest ORDER BY clock_in_at DESC,record_id DESC LIMIT v_limit)
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'recordId',record_id::text,'itemId',board_item_id::text,'employeeName',pg_catalog.left(employee_name,100),
  'clockInAt',clock_in_at,'clockOutAt',clock_out_at,
  'clockInGps',pg_catalog.jsonb_build_object(
    'latitude',clock_in_geo->'latitude','longitude',clock_in_geo->'longitude',
    'accuracyM',clock_in_geo->'accuracy','capturedAt',clock_in_geo->'capturedAt',
    'status',clock_in_geo->>'status'),
  'clockOutGps',CASE WHEN clock_out_geo IS NOT NULL THEN pg_catalog.jsonb_build_object(
    'latitude',clock_out_geo->'latitude','longitude',clock_out_geo->'longitude',
    'accuracyM',clock_out_geo->'accuracy','capturedAt',clock_out_geo->'capturedAt',
    'status',clock_out_geo->>'status') END,
  'status',CASE WHEN clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END,
  'creditedMs',credited_ms) ORDER BY clock_in_at DESC,record_id DESC),'[]'::jsonb)
 INTO v_rows FROM visible;
 SELECT count(*)>v_limit INTO v_has_more FROM (
  SELECT 1 FROM private.tt_attendance_board_projection
  WHERE workspace_id=v_ws AND board_id=p_board_id
  ORDER BY clock_in_at DESC,record_id DESC LIMIT v_limit+1) extra;
 RETURN pg_catalog.jsonb_build_object('scope','AUTHORIZED_ATTENDANCE_BOARD',
  'boardId',p_board_id::text,'workspaceId',v_ws::text,'actorId',v_actor::text,
  'rows',v_rows,'hasMore',v_has_more);
END $read$;
REVOKE ALL ON FUNCTION public.timetracker_board_private_snapshot(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_board_private_snapshot(uuid,integer) TO authenticated;

-- Preserve the original authoritative attendance write and audit logic.
-- The only changed behavior is an atomic, fail-closed projection step before the receipt.
CREATE OR REPLACE FUNCTION public.timetracker_attendance_commit_v2(p_board_id uuid, p_action text, p_record_id text, p_location text, p_department text, p_geo jsonb, p_work_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_ws uuid;
  v_role text;
  v_note text:=NULLIF(pg_catalog.btrim(p_work_note),'');
  v_fix_time timestamptz;
  v_receipt jsonb;
  v_record_id text;
  v_revision bigint;
  v_stamp timestamptz;
BEGIN
  v_ws:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_user);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Current TimeTracker role required' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('clock-in','clock-out') OR p_action IS NULL THEN
    RAISE EXCEPTION 'Unsupported attendance action' USING ERRCODE='22023';
  END IF;
  IF p_location IS NULL OR p_location NOT IN (
    'Office-Base Duty','Offsite (Home)','Local Field Works',
    'Out of Town Assignment','International Field Assignments') OR
    p_department IS NULL OR p_department NOT IN (
    'HR','Materials and Logistics','Engineering','Finance and Accounting',
    'Sales and Marketing','Information Technology') THEN
    RAISE EXCEPTION 'Attendance work location or department invalid' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.length(COALESCE(v_note,''))>500 THEN
    RAISE EXCEPTION 'Work note exceeds 500 characters' USING ERRCODE='22023';
  END IF;
  IF p_location='Offsite (Home)' AND v_role<>'System Admin' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Offsite Work Note is mandatory' USING ERRCODE='22023';
  END IF;
  IF p_action='clock-out' AND
    (p_record_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_record_id)) NOT BETWEEN 1 AND 150) THEN
    RAISE EXCEPTION 'Active attendance record id required' USING ERRCODE='22023';
  END IF;

  IF p_geo IS NULL OR pg_catalog.jsonb_typeof(p_geo)<>'object' OR
    p_geo->>'status'<>'captured' OR p_geo->>'source'<>'browser-geolocation' OR
    COALESCE(p_geo->>'latitude','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'longitude','') !~ '^-?[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'accuracy','') !~ '^[0-9]+(\.[0-9]+)?$' OR
    COALESCE(p_geo->>'capturedAt','') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RAISE EXCEPTION 'Fresh browser GPS evidence required' USING ERRCODE='22023';
  END IF;
  IF (p_geo->>'latitude')::numeric NOT BETWEEN -90 AND 90 OR
    (p_geo->>'longitude')::numeric NOT BETWEEN -180 AND 180 OR
    (p_geo->>'accuracy')::numeric NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'GPS coordinates or accuracy invalid' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_fix_time:=(p_geo->>'capturedAt')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'GPS capture time invalid' USING ERRCODE='22023';
  END;
  IF v_fix_time IS NULL OR
    v_fix_time < pg_catalog.clock_timestamp() - INTERVAL '10 minutes' OR
    v_fix_time > pg_catalog.clock_timestamp() + INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'GPS fix is expired or in the future' USING ERRCODE='22023';
  END IF;

  -- Existing raw engine owns serialized, per-actor mutations, state integrity,
  -- revision increments and recovery copy. Audit insert is in that SAME transaction.
  v_receipt:=public.timetracker_commit_attendance_raw_gps03(
    p_action,p_record_id,p_location,p_department,p_geo,v_note,
    pg_catalog.jsonb_build_object('version','1.0',
      'standardClockInMinutes',480,'unpaidBreakStartMinutes',720,
      'unpaidBreakEndMinutes',780,'requiredWorkMs',32400000)
  );
  IF pg_catalog.jsonb_typeof(v_receipt)<>'object' OR
     v_receipt->>'state_key'<>'timetracker.attendance.v1' OR
     v_receipt->>'action'<>p_action OR
     pg_catalog.jsonb_typeof(v_receipt->'record')<>'object' OR
     v_receipt #>> '{record,ownerId}'<>'cloud:'||v_user::text OR
     (v_receipt->>'revision') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Attendance write receipt contract invalid' USING ERRCODE='22023';
  END IF;
  v_revision:=(v_receipt->>'revision')::bigint;
  v_record_id:=v_receipt #>> '{record,id}';
  v_stamp:=(v_receipt->>'committed_at')::timestamptz;
  IF v_record_id IS NULL OR pg_catalog.length(v_record_id) NOT BETWEEN 1 AND 150
     OR v_stamp IS NULL THEN
    RAISE EXCEPTION 'Attendance write receipt identity invalid' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.timetracker_attendance_mutation_audit(
    workspace_id,board_id,actor_id,record_id,action,revision,
    committed_at,offsite_note_supplied)
  VALUES(v_ws,p_board_id,v_user,v_record_id,p_action,v_revision,
    v_stamp,(p_location='Offsite (Home)' AND v_note IS NOT NULL));

  -- CP-TT-GPS01: projection and attendance source commit share this SQL transaction.
  -- Any failure here rolls back module state, recovery copy, attendance audit and board projection.
  PERFORM private.tt_board_projection_upsert(
    p_board_id,v_ws,v_user,v_receipt->'record',v_revision,p_action);
  
  -- An allowlisted return, not the raw serialized attendance state or GPS fix.
  RETURN pg_catalog.jsonb_build_object(
    'mode','COMMITTED','contract','tt-attendance-1',
    'actorId',v_user::text,'workspaceId',v_ws::text,'boardId',p_board_id::text,
    'action',p_action,'recordId',v_record_id,
    'revision',v_revision,'committedAt',v_stamp);
END;
$function$


REVOKE ALL ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_commit_v2(
 uuid,text,text,text,text,jsonb,text) TO authenticated;

COMMIT;
