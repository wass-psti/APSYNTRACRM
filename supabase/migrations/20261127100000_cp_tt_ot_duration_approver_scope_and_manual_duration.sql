-- CP-TT-OT-APPROVER-SCOPE-02: shared OT approval authority and hours-only manual entries.
-- Employee requests remain duration-v1 and continue to extend the 9-hour cutoff only
-- through the existing exact attendance-record worker. Administrative history uses
-- manual-duration-v1 and never fabricates clock times or extends automatic clock-out.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

DO $preflight$
BEGIN
 IF pg_catalog.to_regprocedure('private.tt_role_in_workspace(uuid,uuid)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_snapshot(uuid)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_decide(uuid,uuid,text)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_decide_duration(uuid,uuid,text)') IS NULL
  OR pg_catalog.to_regprocedure('public.list_module_directory(text)') IS NULL
  OR pg_catalog.to_regclass('public.timetracker_ot_requests') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='public.timetracker_ot_requests'::regclass
    AND conname='tt_ot_policy_shape') THEN
  RAISE EXCEPTION 'OT approver-scope prerequisites missing' USING ERRCODE='55000';
 END IF;
 IF pg_catalog.to_regprocedure('public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)') IS NOT NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_decide_manual_duration(uuid,uuid,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Manual duration OT RPC already exists; review before applying' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- The legacy-range policy remains readable for existing records. New administrative
-- historical entries are duration-only and are deliberately excluded from the OT worker.
ALTER TABLE public.timetracker_ot_requests
 DROP CONSTRAINT tt_ot_policy_shape,
 ADD CONSTRAINT tt_ot_policy_shape CHECK (
  (ot_policy='legacy-range' AND start_time IS NOT NULL AND end_time IS NOT NULL
   AND end_time>start_time
   AND duration_minutes=(extract(epoch FROM end_time-start_time)/60)::integer
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
  OR (ot_policy='duration-v1' AND submission_source='employee'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND submitted_by=owner_id
   AND ((attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
    OR (attendance_record_id IS NOT NULL AND attendance_clock_in_at IS NOT NULL
     AND status='Approved' AND (attendance_clock_in_at AT TIME ZONE 'Asia/Manila')::date=ot_date)))
  OR (ot_policy='manual-duration-v1' AND submission_source='manual_admin'
   AND start_time IS NULL AND end_time IS NULL AND submitted_by IS NOT NULL
   AND attendance_record_id IS NULL AND attendance_clock_in_at IS NULL)
 );

CREATE UNIQUE INDEX tt_ot_manual_duration_live_day
 ON public.timetracker_ot_requests(workspace_id,owner_id,ot_date)
 WHERE ot_policy='manual-duration-v1' AND status IN ('Submitted','Approved');

-- Historical administrative filing accepts only a past date and a duration.
-- It uses the existing employee lock and audit ledger; no start/end times are stored.
CREATE FUNCTION public.timetracker_ot_submit_manual_duration(
 p_board_id uuid,p_owner_id uuid,p_date date,p_duration_minutes integer,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $f$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_today date;
 v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
 v_id uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT (
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws)='System Admin',false)
  OR COALESCE(public.is_platform_admin(v_actor),false)
 ) THEN
  RAISE EXCEPTION 'System Admin or platform Admin manual OT submission required' USING ERRCODE='42501';
 END IF;

 IF p_owner_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id
   AND wm.workspace_id=v_ws AND wm.active
  WHERE p.id=p_owner_id AND p.status='active'
   AND private.tt_role_in_workspace(p.id,v_ws) IS NOT NULL
 ) THEN
  RAISE EXCEPTION 'Select an active TimeTracker employee in this workspace' USING ERRCODE='22023';
 END IF;

 v_today:=(pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date;
 IF p_date IS NULL OR p_date>=v_today
  OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 30 AND 360
  OR pg_catalog.length(v_reason) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'Manual duration OT requires a past date, 30–360 minutes and a valid reason'
   USING ERRCODE='22023';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||p_owner_id::text,0));

 IF EXISTS(
  SELECT 1 FROM public.timetracker_ot_requests r
  WHERE r.workspace_id=v_ws AND r.owner_id=p_owner_id
   AND r.ot_date=p_date AND r.status IN ('Submitted','Approved')
 ) THEN
  RAISE EXCEPTION 'An active OT request already exists for this employee and date'
   USING ERRCODE='23505';
 END IF;

 INSERT INTO public.timetracker_ot_requests
  (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason,
   submitted_by,submission_source,ot_policy)
 VALUES(v_ws,p_owner_id,p_date,NULL,NULL,p_duration_minutes,v_reason,
  v_actor,'manual_admin','manual-duration-v1')
 RETURNING id INTO v_id;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,v_id,v_actor,'submitted',
  pg_catalog.jsonb_build_object(
   'submissionSource','manual_admin','otPolicy','manual-duration-v1',
   'ownerId',p_owner_id::text,'otDate',p_date::text,
   'durationMinutes',p_duration_minutes));

 RETURN pg_catalog.jsonb_build_object(
  'id',v_id::text,'workspaceId',v_ws::text,'ownerId','cloud:'||p_owner_id::text,
  'submittedBy',v_actor::text,'submissionSource','manual_admin',
  'status','Submitted','otPolicy','manual-duration-v1',
  'durationMinutes',p_duration_minutes);
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text)
 TO authenticated;

-- A historical manual-duration approval is a status/audit decision only.
-- It cannot create an attendance association or alter the automatic clock-out cutoff.
CREATE FUNCTION public.timetracker_ot_decide_manual_duration(
 p_board_id uuid,p_request_id uuid,p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=''
AS $f$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_owner uuid;
 v_status text;
 v_is_approver boolean;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_is_approver:=
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws) IN ('HR','System Admin'),false)
  OR COALESCE(public.is_platform_admin(v_actor),false)
  OR COALESCE(public.apsyntra_role_is_bootstrap(),false);
 IF NOT v_is_approver THEN
  RAISE EXCEPTION 'Authorized TimeTracker OT approver required' USING ERRCODE='42501';
 END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('Approved','Rejected') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid manual duration OT decision' USING ERRCODE='22023';
 END IF;

 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws
  AND ot_policy='manual-duration-v1' AND status='Submitted';
 IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Manual duration request unavailable or self-approval prohibited'
   USING ERRCODE='42501';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_owner::text,0));

 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND ot_policy='manual-duration-v1'
  AND status='Submitted' FOR UPDATE;
 IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Manual duration request changed or self-approval prohibited'
   USING ERRCODE='PT409';
 END IF;

 UPDATE public.timetracker_ot_requests SET status=p_decision,
  decided_by=v_actor,decided_at=pg_catalog.clock_timestamp()
 WHERE id=p_request_id AND workspace_id=v_ws
  AND ot_policy='manual-duration-v1' AND status='Submitted'
 RETURNING status INTO v_status;
 IF v_status IS NULL THEN
  RAISE EXCEPTION 'Concurrent manual duration decision conflict' USING ERRCODE='PT409';
 END IF;

 INSERT INTO public.timetracker_ot_audit
  (workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,pg_catalog.lower(p_decision),
  pg_catalog.jsonb_build_object('submissionSource','manual_admin','otPolicy','manual-duration-v1'));

 RETURN pg_catalog.jsonb_build_object(
  'id',p_request_id::text,'workspaceId',v_ws::text,'status',v_status,
  'decidedBy',v_actor::text,'submissionSource','manual_admin',
  'otPolicy','manual-duration-v1');
END;
$f$;
REVOKE ALL ON FUNCTION public.timetracker_ot_decide_manual_duration(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_decide_manual_duration(uuid,uuid,text)
 TO authenticated;

-- Existing duration requests may be reviewed by HR, System Admin and platform Admin.
-- The exact employee lock, record binding, self-review denial and worker contract stay intact.
DO $duration_decision$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_decide_duration(uuid,uuid,text)'::regprocedure);
 old:=$old$IF private.tt_role_in_workspace(v_actor,v_ws) IS DISTINCT FROM 'HR' THEN
  RAISE EXCEPTION 'HR approval required' USING ERRCODE='42501'; END IF;$old$;
 replacement:=$new$IF NOT (
  COALESCE(private.tt_role_in_workspace(v_actor,v_ws) IN ('HR','System Admin'),false)
  OR COALESCE(public.is_platform_admin(v_actor),false)
  OR COALESCE(public.apsyntra_role_is_bootstrap(),false)
 ) THEN
  RAISE EXCEPTION 'Authorized TimeTracker OT approver required' USING ERRCODE='42501'; END IF;$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Duration OT decision role-gate drift'; END IF;
 EXECUTE pg_catalog.replace(d,old,replacement);
END;
$duration_decision$;

-- Legacy range requests already in the database remain reviewable. They are shown
-- as duration only in the new UI; their stored historical time fields are not returned.
DO $legacy_decision$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_decide(uuid,uuid,text)'::regprocedure);
 FOR old,replacement IN VALUES
 ('v_manual_admin boolean;',
  'v_manual_admin boolean; v_hr boolean; v_ot_approver boolean;'),
 ('v_bootstrap:=public.apsyntra_role_is_bootstrap();',
  'v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);'),
 ('v_manual_admin:=public.module_role_for(''time-tracker'',v_actor)=''System Admin'';',
  'v_manual_admin:=COALESCE(private.tt_role_in_workspace(v_actor,v_ws)=''System Admin'',false);
 v_hr:=COALESCE(private.tt_role_in_workspace(v_actor,v_ws)=''HR'',false);
 v_ot_approver:=v_bootstrap OR v_manual_admin OR v_hr OR COALESCE(public.is_platform_admin(v_actor),false);'),
 ('IF NOT v_bootstrap AND NOT v_manual_admin THEN',
  'IF NOT v_ot_approver THEN'),
 ('IF NOT v_bootstrap THEN',
  'IF NOT v_ot_approver THEN')
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>
    CASE WHEN old='IF NOT v_bootstrap AND NOT v_manual_admin THEN' THEN 3 ELSE 2 END THEN
   RAISE EXCEPTION 'Legacy OT decision role-gate drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$legacy_decision$;

-- The TimeTracker directory and OT snapshot use the same server-resolved,
-- workspace-scoped role. Platform Admins resolve as System Admin, not as a
-- caller-supplied browser role.
DO $directory$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.list_module_directory(text)'::regprocedure);
 old:='caller_role:=public.module_role_for(p_module_id,caller);';
 replacement:='caller_role:=CASE WHEN p_module_id=''time-tracker'' AND public.is_platform_admin(caller) THEN ''System Admin'' WHEN p_module_id=''time-tracker'' THEN private.tt_role_in_workspace(caller,ws) ELSE public.module_role_for(p_module_id,caller) END;';
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'TimeTracker directory role-resolution drift'; END IF;
 EXECUTE pg_catalog.replace(d,old,replacement);
END;
$directory$;

-- The signed snapshot exposes all active-workspace requests to the three authorized
-- approver classes, while employees still receive only their own rows. Manual history
-- is visible only to approvers (or its owner), including former employees.
DO $snapshot$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure);
 FOR old,replacement IN VALUES
 ('v_manual_admin boolean; v_hr boolean; v_attendance_state jsonb;',
  'v_manual_admin boolean; v_hr boolean; v_ot_approver boolean; v_attendance_state jsonb;'),
 ('v_bootstrap:=public.apsyntra_role_is_bootstrap();',
  'v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);'),
 ('v_manual_admin:=public.module_role_for(''time-tracker'',v_user)=''System Admin'';
 v_hr:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)=''HR'',false);',
  'v_manual_admin:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)=''System Admin'',false)
  OR COALESCE(public.is_platform_admin(v_user),false);
 v_hr:=COALESCE(private.tt_role_in_workspace(v_user,v_ws)=''HR'',false);
 v_ot_approver:=v_bootstrap OR v_manual_admin OR v_hr OR COALESCE(public.is_platform_admin(v_user),false);'),
 ($old$'start',to_char(r.start_time,'HH24:MI'),
   'end',to_char(r.end_time,'HH24:MI'),
$old$,''),
 ('''canReviewDuration'',(v_hr AND r.ot_policy=''duration-v1'' AND r.status=''Submitted''
    AND r.owner_id<>v_user AND wm.user_id IS NOT NULL),',
  '''canReviewOt'',(v_ot_approver AND r.status=''Submitted''
    AND (r.submission_source=''manual_admin'' OR wm.user_id IS NOT NULL)
    AND (r.owner_id<>v_user OR (v_bootstrap AND r.ot_policy=''legacy-range''))),
  ''canReviewDuration'',(v_ot_approver AND r.ot_policy IN (''duration-v1'',''manual-duration-v1'')
    AND r.status=''Submitted'' AND r.owner_id<>v_user
    AND (r.submission_source=''manual_admin'' OR wm.user_id IS NOT NULL)),'),
 ('''scope'',CASE WHEN v_bootstrap OR v_hr THEN ''AUTHORIZED_WORKSPACE_TEAM''',
  '''scope'',CASE WHEN v_bootstrap OR v_ot_approver THEN ''AUTHORIZED_WORKSPACE_TEAM'''),
 ('''bootstrapApprover'',v_bootstrap,''durationOtContract'',''tt-duration-ot-1'',
  ''durationOtHrApprover'',v_hr,',
  '''bootstrapApprover'',v_bootstrap,''durationOtContract'',''tt-duration-ot-1'',
  ''durationOtHrApprover'',v_hr,''durationOtApprover'',v_ot_approver,'),
 ($old$AND r.status<>'Withdrawn' AND (
  v_bootstrap OR r.submission_source='manual_admin'
  OR (wm.user_id IS NOT NULL AND (r.owner_id=v_user OR
   (v_hr AND r.ot_policy='duration-v1')))
 )$old$,
  $new$AND r.status<>'Withdrawn' AND (
   v_bootstrap
   OR (v_ot_approver AND r.submission_source='manual_admin')
   OR (wm.user_id IS NOT NULL AND (r.owner_id=v_user OR v_ot_approver))
  )$new$)
 LOOP
  IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
   RAISE EXCEPTION 'OT approver snapshot baseline drift: %',old; END IF;
  d:=pg_catalog.replace(d,old,replacement);
 END LOOP;
 EXECUTE d;
END;
$snapshot$;

COMMENT ON FUNCTION public.timetracker_ot_submit_manual_duration(uuid,uuid,date,integer,text) IS
 'Creates historical administrative OT using duration only; never creates clock-time or attendance cutoff data.';
COMMENT ON FUNCTION public.timetracker_ot_decide_manual_duration(uuid,uuid,text) IS
 'Approves/rejects historical manual duration OT for HR, System Admin and platform Admin roles.';
COMMENT ON FUNCTION public.timetracker_ot_snapshot(uuid) IS
 'Signed OT snapshot: employees see own requests; HR, System Admin and platform Admin see workspace requests and review controls.';

NOTIFY pgrst,'reload schema';
COMMIT;
