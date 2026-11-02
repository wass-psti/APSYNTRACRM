-- CP-TT-OT-01 — STAGED ONLY. DO NOT APPLY TO PRODUCTION UNTIL SECURITY ACCEPTANCE.
-- Additive native OT persistence: signed owner submit; bootstrap-only approve/reject.
-- No TimeTracker attendance state, existing grants, roles or production rows are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.timetracker_ot_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 owner_id uuid NOT NULL REFERENCES public.profiles(id),
 ot_date date NOT NULL,
 start_time time WITHOUT TIME ZONE NOT NULL,
 end_time time WITHOUT TIME ZONE NOT NULL,
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 30 AND 360),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 500),
 status text NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Approved','Rejected')),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_by uuid REFERENCES public.profiles(id),
 decided_at timestamptz,
 CONSTRAINT tt_ot_time_same_day CHECK(end_time>start_time),
 CONSTRAINT tt_ot_duration_match CHECK(duration_minutes=
  ((extract(epoch FROM end_time-start_time))/60)::integer),
 CONSTRAINT tt_ot_decision_consistency CHECK(
  (status='Submitted' AND decided_by IS NULL AND decided_at IS NULL) OR
  (status IN ('Approved','Rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS tt_ot_workspace_day ON public.timetracker_ot_requests
 (workspace_id,ot_date DESC,submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tt_ot_unresolved_unique
 ON public.timetracker_ot_requests(workspace_id,owner_id,ot_date,start_time,end_time)
 WHERE status='Submitted';
ALTER TABLE public.timetracker_ot_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetracker_ot_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.timetracker_ot_requests FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.timetracker_ot_audit (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 request_id uuid NOT NULL REFERENCES public.timetracker_ot_requests(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 event text NOT NULL CHECK(event IN ('submitted','approved','rejected')),
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.timetracker_ot_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetracker_ot_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.timetracker_ot_audit FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.timetracker_ot_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'OT audit is immutable' USING ERRCODE='42501';
END $$;
DROP TRIGGER IF EXISTS tt_ot_audit_immutable ON public.timetracker_ot_audit;
CREATE TRIGGER tt_ot_audit_immutable BEFORE UPDATE OR DELETE
 ON public.timetracker_ot_audit FOR EACH ROW
 EXECUTE FUNCTION public.timetracker_ot_audit_immutable();
REVOKE ALL ON FUNCTION public.timetracker_ot_audit_immutable() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.timetracker_ot_require_scope(p_board_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_user uuid:=auth.uid();v_ws uuid;v_session_text text;
BEGIN
 IF v_user IS NULL OR p_board_id IS NULL THEN
  RAISE EXCEPTION 'Signed OT board access required' USING ERRCODE='42501';
 END IF;
 -- Session must be current, not only a still-valid but revoked access token.
 v_session_text:=auth.jwt()->>'session_id';
 IF v_session_text IS NULL OR
    v_session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=v_session_text::uuid
      AND s.user_id=v_user) THEN
  RAISE EXCEPTION 'Current signed session required' USING ERRCODE='42501';
 END IF;
 v_ws:=public.current_workspace_id(v_user);
 IF v_ws IS NULL OR NOT public.has_module_access('time-tracker',v_user) OR
    NOT EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
      AND b.workspace_id=v_ws AND b.name='TimeTracker Attendance'
      AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL) OR
    NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Signed TimeTracker board, module or workspace access denied'
   USING ERRCODE='42501';
 END IF;
 RETURN v_ws;
END $$;
REVOKE ALL ON FUNCTION public.timetracker_ot_require_scope(uuid)
 FROM PUBLIC,anon,authenticated;
-- Internal OT scope guard only. No direct EXECUTE grant to untrusted roles.

CREATE OR REPLACE FUNCTION public.timetracker_ot_snapshot(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_user uuid:=auth.uid();v_ws uuid;v_bootstrap boolean;
 v_rows jsonb;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 v_bootstrap:=public.apsyntra_role_is_bootstrap();
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id::text,'ownerId','cloud:'||r.owner_id::text,
  'name',coalesce(p.display_name,'Workforce member'),
  'date',r.ot_date::text,'start',to_char(r.start_time,'HH24:MI'),
  'end',to_char(r.end_time,'HH24:MI'),
  'durationMinutes',r.duration_minutes,'task',r.reason,'status',r.status,
  'submittedAt',r.submitted_at,'decidedAt',r.decided_at,
  'decidedBy',CASE WHEN v_bootstrap THEN r.decided_by::text ELSE NULL END)
  ORDER BY r.ot_date DESC,r.submitted_at DESC),'[]'::jsonb)
 INTO v_rows
 FROM public.timetracker_ot_requests r
 JOIN public.profiles p ON p.id=r.owner_id
 JOIN public.workspace_members wm ON wm.user_id=r.owner_id
  AND wm.workspace_id=v_ws AND wm.active
 WHERE r.workspace_id=v_ws AND (v_bootstrap OR r.owner_id=v_user);
 RETURN jsonb_build_object(
  'mode','ACTIVE','workspaceId',v_ws::text,'actorId',v_user::text,
  'scope',CASE WHEN v_bootstrap THEN 'AUTHORIZED_WORKSPACE_TEAM'
   ELSE 'OWN_OT_ONLY' END,
  'bootstrapApprover',v_bootstrap,'rows',v_rows);
END $$;

CREATE OR REPLACE FUNCTION public.timetracker_ot_submit(
 p_board_id uuid,p_date date,p_start time WITHOUT TIME ZONE,
 p_end time WITHOUT TIME ZONE,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_ws uuid;v_actor uuid:=auth.uid();v_today date;
 v_mins integer;v_reason text:=trim(coalesce(p_reason,''));v_id uuid;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
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
 (workspace_id,owner_id,ot_date,start_time,end_time,duration_minutes,reason)
 VALUES(v_ws,v_actor,p_date,p_start,p_end,v_mins,v_reason)
 RETURNING id INTO v_id;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event)
 VALUES(v_ws,v_id,v_actor,'submitted');
 RETURN jsonb_build_object('id',v_id::text,'workspaceId',v_ws::text,
  'ownerId','cloud:'||v_actor::text,'status','Submitted');
END $$;

CREATE OR REPLACE FUNCTION public.timetracker_ot_decide(
 p_board_id uuid,p_request_id uuid,p_decision text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_ws uuid;v_actor uuid:=auth.uid();v_owner uuid;v_status text;
BEGIN
 v_ws:=public.timetracker_ot_require_scope(p_board_id);
 IF NOT public.apsyntra_role_is_bootstrap() THEN
  RAISE EXCEPTION 'Bootstrap administrator OT approval required' USING ERRCODE='42501';
 END IF;
 IF p_decision NOT IN ('Approved','Rejected') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid OT decision' USING ERRCODE='22023';
 END IF;
 SELECT owner_id INTO v_owner FROM public.timetracker_ot_requests
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OT request changed or not found' USING ERRCODE='PT409'; END IF;
 IF v_owner=v_actor THEN
  RAISE EXCEPTION 'Self-approval is not permitted' USING ERRCODE='42501';
 END IF;
 UPDATE public.timetracker_ot_requests SET status=p_decision,
  decided_by=v_actor,decided_at=clock_timestamp()
 WHERE id=p_request_id AND workspace_id=v_ws AND status='Submitted'
 RETURNING status INTO v_status;
 IF v_status IS NULL THEN
  RAISE EXCEPTION 'Concurrent OT decision conflict' USING ERRCODE='PT409';
 END IF;
 INSERT INTO public.timetracker_ot_audit(workspace_id,request_id,actor_id,event)
 VALUES(v_ws,p_request_id,v_actor,lower(p_decision));
 RETURN jsonb_build_object('id',p_request_id::text,'workspaceId',v_ws::text,
  'status',v_status,'decidedBy',v_actor::text);
END $$;

REVOKE ALL ON FUNCTION public.timetracker_ot_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ot_submit(uuid,date,time without time zone,time without time zone,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_submit(uuid,date,time without time zone,time without time zone,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timetracker_ot_decide(uuid,uuid,text) TO authenticated;
COMMIT;
