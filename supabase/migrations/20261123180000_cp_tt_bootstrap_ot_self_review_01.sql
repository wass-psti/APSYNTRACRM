-- CP-TT-BOOTSTRAP-OT-SELF-REVIEW-01: Bootstrap administrators may decide their own
-- submitted OT, with unchanged review/audit/locking semantics for every actor.
-- Preserve System Admin manual-only review and nonbootstrap self-review denial.
BEGIN;

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

 IF v_owner=v_actor AND NOT v_bootstrap THEN
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

CREATE OR REPLACE FUNCTION public.timetracker_ot_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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
  'name',coalesce(p.display_name,'Former workforce member'),
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
 LEFT JOIN public.profiles p ON p.id=r.owner_id
 LEFT JOIN public.workspace_members wm ON wm.user_id=r.owner_id
  AND wm.workspace_id=v_ws AND wm.active
 LEFT JOIN public.profiles submitter ON submitter.id=r.submitted_by
 WHERE r.workspace_id=v_ws AND (
  v_bootstrap OR r.submission_source='manual_admin'
  OR (wm.user_id IS NOT NULL AND r.owner_id=v_user)
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

COMMENT ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text) IS
 'Bootstrap administrators may approve or reject any submitted workspace OT including their own; System Admin manual-only review is unchanged.';

COMMIT;
