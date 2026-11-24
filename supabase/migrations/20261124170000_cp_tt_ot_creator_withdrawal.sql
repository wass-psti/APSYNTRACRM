-- Creator-only pending OT withdrawal. Retain immutable request and audit history.
BEGIN;
ALTER TABLE public.timetracker_ot_requests DROP CONSTRAINT IF EXISTS timetracker_ot_requests_status_check;
ALTER TABLE public.timetracker_ot_requests ADD CONSTRAINT timetracker_ot_requests_status_check
 CHECK(status IN ('Submitted','Approved','Rejected','Withdrawn'));
ALTER TABLE public.timetracker_ot_requests DROP CONSTRAINT tt_ot_decision_consistency;
ALTER TABLE public.timetracker_ot_requests ADD CONSTRAINT tt_ot_decision_consistency CHECK(
 (status='Submitted' AND decided_by IS NULL AND decided_at IS NULL) OR
 (status IN ('Approved','Rejected','Withdrawn') AND decided_by IS NOT NULL AND decided_at IS NOT NULL));
ALTER TABLE public.timetracker_ot_audit DROP CONSTRAINT IF EXISTS timetracker_ot_audit_event_check;
ALTER TABLE public.timetracker_ot_audit ADD CONSTRAINT timetracker_ot_audit_event_check
 CHECK(event IN ('submitted','approved','rejected','withdrawn'));

CREATE OR REPLACE FUNCTION public.timetracker_ot_withdraw(p_board_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $function$
DECLARE
 v_ws uuid;
 v_actor uuid:=auth.uid();
 v_owner uuid;
 v_source text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 AND coalesce(submitted_by,CASE WHEN submission_source='employee' THEN owner_id END)=v_actor;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Pending OT request unavailable to its creator' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_ws::text||':time-tracker:attendance:'||v_owner::text,0));
 UPDATE public.timetracker_ot_requests SET status='Withdrawn',
  decided_by=v_actor,decided_at=clock_timestamp()
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 AND coalesce(submitted_by,CASE WHEN submission_source='employee' THEN owner_id END)=v_actor
 RETURNING submission_source INTO v_source;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'OT request changed or no longer pending' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event,details)
 VALUES(v_ws,p_request_id,v_actor,'withdrawn',jsonb_build_object('submissionSource',v_source));
 RETURN jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status','Withdrawn','withdrawnBy',v_actor::text);
END
$function$;
REVOKE ALL ON FUNCTION public.timetracker_ot_withdraw(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_withdraw(uuid,uuid) TO authenticated;

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
  'canWithdraw',(r.status='Submitted' AND coalesce(r.submitted_by,CASE WHEN r.submission_source='employee' THEN r.owner_id END)=v_user),
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
 WHERE r.workspace_id=v_ws AND r.status<>'Withdrawn' AND (
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

COMMIT;
