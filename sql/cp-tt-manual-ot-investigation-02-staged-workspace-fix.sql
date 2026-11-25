-- CP-TT-MANUAL-OT-INVESTIGATION-02: staged repair; not a deployed migration.
-- Requires reviewed migration registration and explicit production approval.
BEGIN;
DO $preflight$
BEGIN
 IF md5(pg_get_functiondef('public.timetracker_ot_submit_manual(uuid,uuid,date,time,time,text)'::regprocedure)) IS DISTINCT FROM 'b43acb050b4d05f7a63694f87a61491b' THEN
  RAISE EXCEPTION 'Manual OT function drift: review before applying';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.timetracker_ot_submit_manual(p_board_id uuid, p_owner_id uuid, p_date date, p_start time without time zone, p_end time without time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_local_now timestamp without time zone;
 v_today date;
 v_mins integer;
 v_reason text:=trim(coalesce(p_reason,''));
 v_id uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);

 IF public.module_role_for('time-tracker',v_actor) IS DISTINCT FROM 'System Admin' THEN
  RAISE EXCEPTION 'System Admin manual OT submission required' USING ERRCODE='42501';
 END IF;

 IF p_owner_id IS NULL OR NOT EXISTS(
  SELECT 1
  FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id
   AND wm.workspace_id=v_ws AND wm.active
  WHERE p.id=p_owner_id AND p.status='active'
   AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Select an active TimeTracker employee in this workspace' USING ERRCODE='22023';
 END IF;

 v_local_now:=clock_timestamp() AT TIME ZONE 'Asia/Manila';
 v_today:=v_local_now::date;

 IF p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR
    p_date>v_today OR (p_date=v_today AND p_end>v_local_now::time) OR
    p_end<=p_start OR
    length(v_reason) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Manual OT must contain an elapsed date and valid time range' USING ERRCODE='22023';
 END IF;

 v_mins:=(extract(epoch FROM p_end-p_start)/60)::integer;
 IF v_mins NOT BETWEEN 30 AND 360 THEN
  RAISE EXCEPTION 'OT interval must be 30 to 360 minutes' USING ERRCODE='22023';
 END IF;

 -- Serialize with regular employee OT submissions and approval decisions for this owner.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
   v_ws::text||':time-tracker:attendance:'||p_owner_id::text,0));

 IF EXISTS(
  SELECT 1 FROM public.timetracker_ot_requests r
  WHERE r.workspace_id=v_ws AND r.owner_id=p_owner_id
   AND r.ot_date=p_date AND r.start_time=p_start AND r.end_time=p_end
   AND r.status IN ('Submitted','Approved')
 ) THEN
  RAISE EXCEPTION 'This overtime interval already exists' USING ERRCODE='23505';
 END IF;

 INSERT INTO public.timetracker_ot_requests
  (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,
   submitted_by,submission_source)
 VALUES(v_ws,p_owner_id,p_date,p_start,p_end,v_mins,v_reason,
  v_actor,'manual_admin')
 RETURNING id INTO v_id;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,v_id,v_actor,'submitted',
  jsonb_build_object(
   'submissionSource','manual_admin',
   'ownerId',p_owner_id::text,
   'otDate',p_date::text,
   'startTime',p_start::text,
   'endTime',p_end::text,
   'durationMinutes',v_mins
  ));

 RETURN jsonb_build_object(
  'id',v_id::text,
  'workspaceId',v_ws::text,
  'ownerId','cloud:'||p_owner_id::text,
  'submittedBy',v_actor::text,
  'submissionSource','manual_admin',
  'status','Submitted'
 );
END
$function$;
COMMIT;
