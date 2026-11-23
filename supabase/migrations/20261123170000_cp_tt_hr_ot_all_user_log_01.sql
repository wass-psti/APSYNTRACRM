-- CP-TT-HR-OT-AND-ALL-USER-LOG-01
-- Preserve the existing TimeTracker OT contract while retaining historical
-- manual OT rows and publishing data-free invalidation hints to the board channel.
BEGIN;

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
  r.submission_source='manual_admin'
  OR (wm.user_id IS NOT NULL AND (v_bootstrap OR r.owner_id=v_user))
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

CREATE OR REPLACE FUNCTION public.timetracker_ot_realtime_broadcast_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_row jsonb;
 v_workspace_id uuid;
 v_board_id uuid;
 v_actor_id uuid:=auth.uid();
BEGIN
 IF pg_catalog.current_setting('apsyntra.realtime_suppress',true)='on' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;

 v_row:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 v_workspace_id:=nullif(v_row->>'workspace_id','')::uuid;

 IF v_workspace_id IS NOT NULL THEN
  SELECT b.id INTO v_board_id
  FROM public.work_boards b
  WHERE b.workspace_id=v_workspace_id
    AND b.name='TimeTracker Attendance'
    AND b.status='active'
    AND b.archived_at IS NULL
    AND b.trashed_at IS NULL
  ORDER BY b.id
  LIMIT 1;
 END IF;

 IF v_board_id IS NOT NULL THEN
  -- Payload is deliberately limited to invalidation metadata. Receivers must
  -- retrieve the authoritative OT snapshot through their existing signed RPC.
  PERFORM realtime.send(
   jsonb_build_object(
    'board_id',v_board_id,
    'entity','board',
    'entity_id',v_board_id::text,
    'item_id',NULL,
    'action','OT_'||TG_OP,
    'actor_id',v_actor_id,
    'occurred_at',clock_timestamp()
   ),
   'board-change',
   'board:'||v_board_id::text,
   true
  );
 END IF;

 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS timetracker_ot_realtime_change
 ON public.timetracker_ot_requests;
CREATE TRIGGER timetracker_ot_realtime_change
AFTER INSERT OR UPDATE OR DELETE ON public.timetracker_ot_requests
FOR EACH ROW EXECUTE FUNCTION public.timetracker_ot_realtime_broadcast_change();

REVOKE ALL ON FUNCTION public.timetracker_ot_realtime_broadcast_change()
 FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.timetracker_ot_snapshot(uuid) IS
 'Returns the existing signed OT snapshot; manual_admin history remains visible after owner membership ends.';
COMMENT ON FUNCTION public.timetracker_ot_realtime_broadcast_change() IS
 'Broadcasts data-free TimeTracker board invalidation hints after OT changes; clients re-read through the signed OT snapshot RPC.';

COMMIT;
