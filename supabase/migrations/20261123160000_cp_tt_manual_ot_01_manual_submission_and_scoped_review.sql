-- CP-TT-MANUAL-OT-01: manual historical OT submission and manual-only System Admin review.
-- Existing OT rows, regular employee submission rules and bootstrap review remain compatible.
BEGIN;

ALTER TABLE public.timetracker_ot_requests
 ADD COLUMN IF NOT EXISTS submission_source text NOT NULL DEFAULT 'employee',
 ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id);

-- The constant default classifies legacy rows as employee submissions without
-- rewriting existing records. Legacy submitted_by remains NULL; all new RPC writes
-- record the authenticated actor explicitly.
ALTER TABLE public.timetracker_ot_requests
 ALTER COLUMN submission_source SET DEFAULT 'employee',
 ALTER COLUMN submission_source SET NOT NULL;

ALTER TABLE public.timetracker_ot_requests
 DROP CONSTRAINT IF EXISTS tt_ot_submission_source;
ALTER TABLE public.timetracker_ot_requests
 ADD CONSTRAINT tt_ot_submission_source
 CHECK (submission_source IN ('employee','manual_admin') AND
  (submission_source='employee' OR submitted_by IS NOT NULL));

CREATE INDEX IF NOT EXISTS tt_ot_manual_workspace_day
 ON public.timetracker_ot_requests(workspace_id,ot_date DESC,submitted_at DESC)
 WHERE submission_source='manual_admin';

COMMENT ON COLUMN public.timetracker_ot_requests.submission_source IS
 'employee for normal self-submission; manual_admin for System Admin entry on behalf of an employee.';
COMMENT ON COLUMN public.timetracker_ot_requests.submitted_by IS
 'Signed actor who created the request; differs from owner_id for manual administrator entries.';

CREATE OR REPLACE FUNCTION public.timetracker_ot_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_ws uuid;
 v_bootstrap boolean;
 v_manual_admin boolean;
 v_rows jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=public.apsyntra_role_is_bootstrap();
 v_manual_admin:=public.module_role_for('time-tracker',v_user)='System Admin';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id::text,
  'ownerId','cloud:'||r.owner_id::text,
  'name',coalesce(p.display_name,'Workforce member'),
  'date',r.ot_date::text,
  'start',to_char(r.start_time,'HH24:MI'),
  'end',to_char(r.end_time,'HH24:MI'),
  'durationMinutes',r.duration_minutes,
  'task',r.reason,
  'status',r.status,
  'submissionSource',r.submission_source,
  'isManual',(r.submission_source='manual_admin'),
  'submittedAt',r.submitted_at,
  'submittedBy',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN r.submitted_by::text ELSE NULL END,
  'submittedByName',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN coalesce(submitter.display_name,'TimeTracker administrator') ELSE NULL END,
  'decidedAt',r.decided_at,
  'decidedBy',CASE WHEN v_bootstrap OR
    (v_manual_admin AND r.submission_source='manual_admin')
    THEN r.decided_by::text ELSE NULL END)
  ORDER BY r.ot_date DESC,r.submitted_at DESC),'[]'::jsonb)
 INTO v_rows
 FROM public.timetracker_ot_requests r
 JOIN public.profiles p ON p.id=r.owner_id
 JOIN public.workspace_members wm ON wm.user_id=r.owner_id
  AND wm.workspace_id=v_ws AND wm.active
 LEFT JOIN public.profiles submitter ON submitter.id=r.submitted_by
 WHERE r.workspace_id=v_ws AND (
  v_bootstrap OR r.owner_id=v_user OR r.submission_source='manual_admin'
 );

 RETURN jsonb_build_object(
  'mode','ACTIVE',
  'workspaceId',v_ws::text,
  'actorId',v_user::text,
  'scope',CASE WHEN v_bootstrap THEN 'AUTHORIZED_WORKSPACE_TEAM'
    ELSE 'OWN_OT_ONLY' END,
  'bootstrapApprover',v_bootstrap,
  'manualOtManager',v_manual_admin,
  'rows',v_rows
 );
END
$function$;

-- Preserve the existing employee-facing date window and create actor provenance
-- without changing the request owner or existing submission behavior.
CREATE OR REPLACE FUNCTION public.timetracker_ot_submit(
 p_board_id uuid,
 p_date date,
 p_start time WITHOUT TIME ZONE,
 p_end time WITHOUT TIME ZONE,
 p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_today date;
 v_mins integer;
 v_reason text:=trim(coalesce(p_reason,''));
 v_id uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
   v_ws::text||':time-tracker:attendance:'||v_actor::text,0));
 v_today:=(clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;

 IF p_date IS NULL OR p_date<v_today-30 OR p_date>v_today+7 OR
    p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR
    length(v_reason) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Invalid OT date, interval or reason' USING ERRCODE='22023';
 END IF;

 v_mins:=(extract(epoch FROM p_end-p_start)/60)::integer;
 IF v_mins NOT BETWEEN 30 AND 360 THEN
  RAISE EXCEPTION 'OT interval must be 30 to 360 minutes' USING ERRCODE='22023';
 END IF;

 INSERT INTO public.timetracker_ot_requests
  (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,
   submitted_by,submission_source)
 VALUES(v_ws,v_actor,p_date,p_start,p_end,v_mins,v_reason,v_actor,'employee')
 RETURNING id INTO v_id;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,v_id,v_actor,'submitted',
  jsonb_build_object('submissionSource','employee','ownerId',v_actor::text));

 RETURN jsonb_build_object('id',v_id::text,'workspaceId',v_ws::text,
  'ownerId','cloud:'||v_actor::text,'submittedBy',v_actor::text,
  'submissionSource','employee','status','Submitted');
END
$function$;

CREATE OR REPLACE FUNCTION public.timetracker_ot_submit_manual(
 p_board_id uuid,
 p_owner_id uuid,
 p_date date,
 p_start time WITHOUT TIME ZONE,
 p_end time WITHOUT TIME ZONE,
 p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
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
   AND public.has_module_access('time-tracker',p.id)
   AND public.module_role_for('time-tracker',p.id) IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.timetracker_ot_decide(
 p_board_id uuid,
 p_request_id uuid,
 p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_owner uuid;
 v_source text;
 v_status text;
 v_bootstrap boolean;
 v_manual_admin boolean;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=public.apsyntra_role_is_bootstrap();
 v_manual_admin:=public.module_role_for('time-tracker',v_actor)='System Admin';

 IF p_decision NOT IN ('Approved','Rejected') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid OT decision' USING ERRCODE='22023';
 END IF;
 IF NOT v_bootstrap AND NOT v_manual_admin THEN
  RAISE EXCEPTION 'Bootstrap administrator OT approval required' USING ERRCODE='42501';
 END IF;

 -- Lock the same per-employee key as submission before locking the request row.
 SELECT owner_id,submission_source INTO v_owner,v_source
 FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted';
 IF NOT FOUND THEN
  RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
   v_ws::text||':time-tracker:attendance:'||v_owner::text,0));

 SELECT owner_id,submission_source INTO v_owner,v_source
 FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409';
 END IF;

 IF v_owner=v_actor THEN
  RAISE EXCEPTION 'Self-approval is not permitted' USING ERRCODE='42501';
 END IF;

 IF v_source='manual_admin' THEN
  IF NOT v_bootstrap AND NOT v_manual_admin THEN
   RAISE EXCEPTION 'System Admin manual OT review required' USING ERRCODE='42501';
  END IF;
 ELSE
  IF NOT v_bootstrap THEN
   RAISE EXCEPTION 'Bootstrap administrator OT approval required' USING ERRCODE='42501';
  END IF;
 END IF;

 UPDATE public.timetracker_ot_requests SET status=p_decision,
  decided_by=v_actor,decided_at=clock_timestamp()
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 RETURNING status INTO v_status;
 IF v_status IS NULL THEN
  RAISE EXCEPTION 'Concurrent OT decision conflict' USING ERRCODE='PT409';
 END IF;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,lower(p_decision),
  jsonb_build_object('submissionSource',v_source));

 RETURN jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status',v_status,'decidedBy',v_actor::text,'submissionSource',v_source);
END
$function$;

REVOKE ALL ON FUNCTION public.timetracker_ot_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit(uuid,date,time without time zone,time without time zone,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit_manual(
 uuid,uuid,date,time without time zone,time without time zone,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.timetracker_ot_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit(
 uuid,date,time without time zone,time without time zone,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit_manual(
 uuid,uuid,date,time without time zone,time without time zone,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text) TO authenticated;

COMMENT ON FUNCTION public.timetracker_ot_submit_manual(
 uuid,uuid,date,time without time zone,time without time zone,text) IS
 'Creates an elapsed historical TimeTracker OT request on behalf of an active workspace employee; actor and owner are recorded separately.';

COMMIT;
