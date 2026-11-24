-- CP-TT-LOG-PAGE-01: indexed historical attendance pages and lightweight Clock reads.
-- Attendance writes and existing module-role visibility remain unchanged.
BEGIN;

ALTER TABLE private.tt_attendance_board_projection
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'Unassigned',
  ADD COLUMN IF NOT EXISTS work_note text,
  ADD COLUMN IF NOT EXISTS closure_marker text NOT NULL DEFAULT '';


DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname='tt_attendance_projection_closure_marker_check'
      AND conrelid='private.tt_attendance_board_projection'::regclass
  ) THEN
    ALTER TABLE private.tt_attendance_board_projection
      ADD CONSTRAINT tt_attendance_projection_closure_marker_check
      CHECK (closure_marker IN ('','administratively_closed','legacy_duplicate_session'));
  END IF;
END;
$constraint$;

-- Backfill the read model from the existing authoritative attendance state.
UPDATE private.tt_attendance_board_projection p
SET department=COALESCE(NULLIF(pg_catalog.left(r.value#>>'{clockIn,department}',80),''),'Unassigned'),
    work_note=NULLIF(pg_catalog.left(COALESCE(r.value#>>'{clockIn,workNote}',r.value->>'note',''),500),''),
    closure_marker=CASE
      WHEN r.value#>>'{clockOut,status}'='administratively_closed'
        THEN 'administratively_closed'
      WHEN r.value#>>'{reconciliation,type}'='legacy_duplicate_session'
        THEN 'legacy_duplicate_session'
      ELSE ''
    END
FROM public.module_state_entries e
CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records') r(value)
WHERE e.workspace_id=p.workspace_id
  AND e.module_id='time-tracker'
  AND e.state_key='timetracker.attendance.v1'
  AND e.scope='shared' AND e.owner_key='*'
  AND r.value->>'id'=p.record_id::text;

-- Keep the read model current for both ordinary Clock writes and admin corrections.
CREATE OR REPLACE FUNCTION private.tt_attendance_projection_metadata_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_record jsonb;
BEGIN
  SELECT r.value INTO v_record
  FROM public.module_state_entries e
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(e.value::jsonb->'records') r(value)
  WHERE e.workspace_id=NEW.workspace_id
    AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*'
    AND r.value->>'id'=NEW.record_id::text
  LIMIT 1;

  IF v_record IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.department:=COALESCE(
    NULLIF(pg_catalog.left(v_record#>>'{clockIn,department}',80),''),
    'Unassigned'
  );
  NEW.work_note:=NULLIF(pg_catalog.left(
    COALESCE(v_record#>>'{clockIn,workNote}',v_record->>'note',''),500
  ),'');
  NEW.closure_marker:=CASE
    WHEN v_record#>>'{clockOut,status}'='administratively_closed'
      THEN 'administratively_closed'
    WHEN v_record#>>'{reconciliation,type}'='legacy_duplicate_session'
      THEN 'legacy_duplicate_session'
    ELSE ''
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_attendance_projection_metadata_sync()
  FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS tt_attendance_projection_metadata_sync
  ON private.tt_attendance_board_projection;
CREATE TRIGGER tt_attendance_projection_metadata_sync
  BEFORE INSERT OR UPDATE OF source_revision
  ON private.tt_attendance_board_projection
  FOR EACH ROW
  EXECUTE FUNCTION private.tt_attendance_projection_metadata_sync();

-- One index supports global keyset order; one supports the lightweight own-Clock read.
CREATE INDEX IF NOT EXISTS tt_attendance_log_page_idx
  ON private.tt_attendance_board_projection
    (workspace_id,board_id,clock_in_at DESC,record_id DESC);
CREATE INDEX IF NOT EXISTS tt_attendance_clock_own_idx
  ON private.tt_attendance_board_projection
    (workspace_id,board_id,employee_id,clock_in_at DESC,record_id DESC);
CREATE INDEX IF NOT EXISTS tt_attendance_clock_active_idx
  ON private.tt_attendance_board_projection
    (workspace_id,board_id,employee_id,clock_in_at DESC,record_id DESC)
  WHERE clock_out_at IS NULL;
CREATE INDEX IF NOT EXISTS tt_ojt_attendance_log_page_idx
  ON private.tt_ojt_attendance
    (workspace_id,board_id,clock_in_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS private.tt_ojt_attendance_log_revision (
  workspace_id uuid NOT NULL,
  board_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0),
  PRIMARY KEY(workspace_id,board_id)
);
INSERT INTO private.tt_ojt_attendance_log_revision(workspace_id,board_id,revision)
SELECT workspace_id,board_id,pg_catalog.count(*)
FROM private.tt_ojt_attendance
GROUP BY workspace_id,board_id
ON CONFLICT(workspace_id,board_id) DO NOTHING;
REVOKE ALL ON private.tt_ojt_attendance_log_revision FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tt_ojt_attendance_log_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_workspace uuid;
  v_board uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    v_workspace:=OLD.workspace_id;
    v_board:=OLD.board_id;
  ELSE
    v_workspace:=NEW.workspace_id;
    v_board:=NEW.board_id;
  END IF;
  INSERT INTO private.tt_ojt_attendance_log_revision(workspace_id,board_id,revision)
  VALUES(v_workspace,v_board,1)
  ON CONFLICT(workspace_id,board_id) DO UPDATE
    SET revision=private.tt_ojt_attendance_log_revision.revision+1;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.tt_ojt_attendance_log_revision_bump()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tt_ojt_attendance_log_revision_bump
  ON private.tt_ojt_attendance;
CREATE TRIGGER tt_ojt_attendance_log_revision_bump
  AFTER INSERT OR UPDATE OR DELETE ON private.tt_ojt_attendance
  FOR EACH ROW EXECUTE FUNCTION private.tt_ojt_attendance_log_revision_bump();

-- Reuse the existing signed Clock capability as the compact source of the
-- current module role. This adds one descriptive field and does not change the
-- existing scope check or Clock-write decision.
CREATE OR REPLACE FUNCTION public.timetracker_attendance_capabilities(
  p_board_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_workspace uuid;
  v_actor uuid:=auth.uid();
  v_role text;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_actor);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Current TimeTracker role required' USING ERRCODE='42501';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-attendance-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'canClock',true,'moduleRole',v_role
  );
END;
$function$;
COMMENT ON FUNCTION public.timetracker_attendance_capabilities(uuid) IS
  'Signed TimeTracker Clock capability; includes the existing assigned module role for lightweight Clock and Log initialization.';

CREATE OR REPLACE FUNCTION public.timetracker_attendance_clock_snapshot(
  p_board_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_revision bigint:=0;
  v_today_start timestamptz;
  v_records jsonb;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  v_today_start:=(
    (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Manila')::date::timestamp
    AT TIME ZONE 'Asia/Manila'
  );

  SELECT e.revision INTO v_revision
  FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace
    AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*';

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',p.record_id::text,
      'ownerId','cloud:'||p.employee_id::text,
      'clockIn',pg_catalog.jsonb_build_object(
        'timestamp',p.clock_in_at,
        'location',p.clock_in_location,
        'department',p.department,
        'workNote',p.work_note
      ),
      'clockOut',CASE WHEN p.clock_out_at IS NULL THEN NULL ELSE
        pg_catalog.jsonb_build_object(
          'timestamp',p.clock_out_at,
          'status',CASE WHEN p.closure_marker='administratively_closed'
            THEN 'administratively_closed' ELSE 'completed' END
        ) END,
      'creditedMsOverride',p.credited_ms,
      'reconciliation',CASE WHEN p.closure_marker='legacy_duplicate_session'
        THEN pg_catalog.jsonb_build_object('type','legacy_duplicate_session')
        ELSE NULL END
    ) ORDER BY p.clock_in_at DESC,p.record_id DESC
  ),'[]'::jsonb) INTO v_records
  FROM private.tt_attendance_board_projection p
  WHERE p.workspace_id=v_workspace
    AND p.board_id=p_board_id
    AND p.employee_id=v_actor
    AND (p.clock_in_at>=v_today_start OR p.clock_out_at IS NULL);

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE',
    'contract','tt-attendance-clock-1',
    'actorId',v_actor::text,
    'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,
    'revision',COALESCE(v_revision,0),
    'records',v_records
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_clock_snapshot(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_clock_snapshot(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.timetracker_auto_clockout_snapshot(p_board_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_record_id text;
  v_session jsonb;
BEGIN
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);

  SELECT p.record_id::text INTO v_record_id
  FROM private.tt_attendance_board_projection p
  WHERE p.workspace_id=v_workspace
    AND p.board_id=p_board_id
    AND p.employee_id=v_actor
    AND p.clock_out_at IS NULL
  ORDER BY p.clock_in_at DESC,p.record_id DESC
  LIMIT 1;

  IF v_record_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'recordId',s.record_id::text,
      'status',s.status,
      'thresholdAt',s.threshold_at,
      'graceStartedAt',s.grace_started_at,
      'graceDeadlineAt',s.grace_deadline_at,
      'overtimeCutoffAt',s.overtime_cutoff_at,
      'nextAt',CASE
        WHEN s.status='MONITORING' THEN s.threshold_at
        WHEN s.status='GRACE' THEN s.grace_deadline_at
        WHEN s.status='OVERTIME' THEN s.overtime_cutoff_at
        ELSE NULL END,
      'lastEvaluatedAt',s.last_evaluated_at,
      'clockOutReason',s.clock_out_reason)
    INTO v_session
    FROM private.tt_auto_clockout_sessions s
    WHERE s.workspace_id=v_workspace AND s.board_id=p_board_id
      AND s.employee_id=v_actor AND s.record_id=v_record_id::uuid;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-auto-clockout-1',
    'actorId',v_actor::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'session',v_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_auto_clockout_snapshot(uuid)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.timetracker_ojt_admin_attendance_record(
  p_board_id uuid,
  p_record_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_workspace uuid;
  v_record jsonb;
BEGIN
  v_workspace:=private.tt_ojt_admin(p_board_id);
  SELECT pg_catalog.jsonb_build_object(
    'id',a.id::text,'internId',a.intern_id::text,
    'name',i.display_name,'clockIn',a.clock_in_at,
    'clockOut',a.clock_out_at,'location',a.location,
    'workNote',a.work_note,'revision',a.revision
  ) INTO v_record
  FROM private.tt_ojt_attendance a
  JOIN private.tt_ojt_interns i ON i.id=a.intern_id
  WHERE a.workspace_id=v_workspace AND a.board_id=p_board_id
    AND a.id=p_record_id;
  IF v_record IS NULL THEN
    RAISE EXCEPTION 'Intern attendance record was not found' USING ERRCODE='P0002';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE','contract','tt-ojt-admin-attendance-record-1',
    'actorId',auth.uid()::text,'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,'record',v_record
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_ojt_admin_attendance_record(uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_admin_attendance_record(uuid,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.timetracker_attendance_log_page(
  p_board_id uuid,
  p_page_size integer DEFAULT 50,
  p_cursor jsonb DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_period text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_location text DEFAULT 'all',
  p_employee_id uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_include_summary boolean DEFAULT true,
  p_record_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_workspace uuid;
  v_role text;
  v_team boolean;
  v_ojt boolean;
  v_page_size integer:=p_page_size;
  v_sort text:=p_sort;
  v_period text:=p_period;
  v_status text:=p_status;
  v_location text:=p_location;
  v_search text:=pg_catalog.left(pg_catalog.btrim(COALESCE(p_search,'')),120);
  v_include_summary boolean:=COALESCE(p_include_summary,true);
  v_record_id uuid:=p_record_id;
  v_cursor_at timestamptz;
  v_cursor_rank integer;
  v_cursor_id uuid;
  v_cursor_source_revision bigint;
  v_cursor_ojt_revision bigint;
  v_source_revision bigint:=0;
  v_ojt_revision bigint:=0;
  v_changed boolean:=false;
  v_period_start timestamptz;
  v_today_start timestamptz;
  v_now timestamptz:=pg_catalog.clock_timestamp();
  v_summary jsonb;
  v_page jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
  v_last jsonb;
  v_scope text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A signed CRM session is required' USING ERRCODE='42501';
  END IF;
  v_workspace:=public.timetracker_ot_require_scope(p_board_id);
  v_role:=public.module_role_for('time-tracker',v_actor);
  v_team:=v_role IN ('System Admin','IT Administrator','HR');
  v_ojt:=v_role IN ('System Admin','IT Administrator');
  v_scope:=CASE WHEN v_team THEN 'AUTHORIZED_WORKSPACE_TEAM' ELSE 'OWN_ATTENDANCE_ONLY' END;

  SELECT COALESCE(e.revision,0) INTO v_source_revision
  FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*';
  v_source_revision:=COALESCE(v_source_revision,0);
  IF v_ojt THEN
    SELECT COALESCE(r.revision,0) INTO v_ojt_revision
    FROM private.tt_ojt_attendance_log_revision r
    WHERE r.workspace_id=v_workspace AND r.board_id=p_board_id;
    v_ojt_revision:=COALESCE(v_ojt_revision,0);
  END IF;

  IF v_page_size IS NULL OR v_page_size NOT BETWEEN 1 AND 100
     OR v_sort NOT IN ('newest','oldest')
     OR v_period NOT IN ('all','today','week','month')
     OR v_status NOT IN ('all','Active','Completed','Late','Administrative closure')
     OR v_location IS NULL OR pg_catalog.length(v_location)>100
     OR pg_catalog.length(v_search)>120 THEN
    RAISE EXCEPTION 'Attendance Log page request is invalid' USING ERRCODE='22023';
  END IF;

  IF p_cursor IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_cursor)<>'object'
       OR COALESCE(p_cursor->>'sourceRank','') !~ '^[01]$'
       OR COALESCE(p_cursor->>'recordId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(p_cursor->>'clockIn','')=''
       OR COALESCE(p_cursor->>'sourceRevision','') !~ '^\d+$'
       OR COALESCE(p_cursor->>'ojtRevision','') !~ '^\d+$' THEN
      RAISE EXCEPTION 'Attendance Log cursor is invalid' USING ERRCODE='22023';
    END IF;
    v_cursor_at:=(p_cursor->>'clockIn')::timestamptz;
    v_cursor_rank:=(p_cursor->>'sourceRank')::integer;
    v_cursor_id:=(p_cursor->>'recordId')::uuid;
    v_cursor_source_revision:=(p_cursor->>'sourceRevision')::bigint;
    v_cursor_ojt_revision:=(p_cursor->>'ojtRevision')::bigint;
    IF v_cursor_rank=1 AND NOT v_ojt THEN
      RAISE EXCEPTION 'Attendance Log cursor source is unavailable' USING ERRCODE='22023';
    END IF;
  END IF;

  IF v_ojt THEN
    PERFORM private.tt_ojt_admin(p_board_id);
  END IF;

  IF p_cursor IS NOT NULL AND (
    v_cursor_source_revision IS DISTINCT FROM v_source_revision OR
    v_cursor_ojt_revision IS DISTINCT FROM v_ojt_revision
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'mode','STALE_SNAPSHOT','contract','tt-attendance-log-page-1',
      'actorId',v_actor::text,'workspaceId',v_workspace::text,
      'boardId',p_board_id::text,'scope',v_scope
    );
  END IF;

  v_today_start:=(
    (v_now AT TIME ZONE 'Asia/Manila')::date::timestamp
    AT TIME ZONE 'Asia/Manila'
  );
  CASE v_period
    WHEN 'today' THEN v_period_start:=v_today_start;
    WHEN 'week' THEN
      v_period_start:=v_today_start-
        ((EXTRACT(ISODOW FROM (v_now AT TIME ZONE 'Asia/Manila'))::integer-1)
          *INTERVAL '1 day');
    WHEN 'month' THEN
      v_period_start:=(
        pg_catalog.date_trunc('month',v_now AT TIME ZONE 'Asia/Manila')
        AT TIME ZONE 'Asia/Manila'
      );
    ELSE v_period_start:=NULL;
  END CASE;

  IF v_include_summary THEN
   -- Summary scans only indexed, sanitized projections and returns aggregates,
   -- never the full historical row set to the browser.
   WITH standard_rows AS (
     SELECT
       'cloud:'||p.employee_id::text AS owner_key,
       COALESCE(NULLIF(pg_catalog.btrim(e.display_name),''),e.email,'Workforce member') AS employee_name,
       COALESCE(NULLIF(p.department,''),'Unassigned') AS department,
       CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END AS location,
       p.clock_in_at,
       p.clock_out_at,
       p.credited_ms,
       p.closure_marker,
       CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
         WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
           THEN 'Late' ELSE 'On time' END AS classification,
       CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END AS status
     FROM private.tt_attendance_board_projection p
     JOIN public.profiles e ON e.id=p.employee_id AND e.status='active'
     JOIN public.workspace_members wm
       ON wm.user_id=p.employee_id AND wm.workspace_id=v_workspace AND wm.active=true
     WHERE p.workspace_id=v_workspace AND p.board_id=p_board_id
       AND (v_team OR p.employee_id=v_actor)
       AND public.has_module_access('time-tracker',p.employee_id)
       AND (v_period='all' OR
         (p.clock_in_at>=v_period_start AND p.clock_in_at<=v_now))
       AND (v_status='all'
         OR (v_status='Active' AND p.clock_out_at IS NULL)
         OR (v_status='Completed' AND p.clock_out_at IS NOT NULL)
         OR (v_status='Late' AND p.closure_marker='' AND
           (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00')
         OR (v_status='Administrative closure' AND p.closure_marker<>''))
       AND (v_location='all' OR
         (CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END)=v_location)
       AND (p_employee_id IS NULL OR p.employee_id=p_employee_id)
       AND (v_record_id IS NULL OR p.record_id=v_record_id)
       AND (v_search='' OR
         (COALESCE(e.display_name,'')||' '||COALESCE(e.email,'')||' '||
          COALESCE(p.department,'')||' '||COALESCE(p.clock_in_location,'')||' '||
          CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
          CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
            WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
              THEN 'Late' ELSE 'On time' END||' '||
          pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
          pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
   ), ojt_rows AS (
     SELECT
       'ojt:'||a.intern_id::text AS owner_key,
       i.display_name AS employee_name,
       'OJT'::text AS department,
       CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END AS location,
       a.clock_in_at,
       a.clock_out_at,
       CASE WHEN a.clock_out_at IS NULL THEN NULL
         ELSE private.tt_attendance_credited_ms(a.clock_in_at,a.clock_out_at) END AS credited_ms,
       ''::text AS closure_marker,
       CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
         THEN 'Late' ELSE 'On time' END AS classification,
       CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END AS status
     FROM private.tt_ojt_attendance a
     JOIN private.tt_ojt_interns i ON i.id=a.intern_id
     WHERE v_ojt AND a.workspace_id=v_workspace AND a.board_id=p_board_id
       AND p_employee_id IS NULL
       AND (v_record_id IS NULL OR a.id=v_record_id)
       AND (v_period='all' OR (a.clock_in_at>=v_period_start AND a.clock_in_at<=v_now))
       AND (v_status='all'
         OR (v_status='Active' AND a.clock_out_at IS NULL)
         OR (v_status='Completed' AND a.clock_out_at IS NOT NULL)
         OR (v_status='Late' AND (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'))
       AND (v_location='all' OR (CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END)=v_location)
       AND (v_search='' OR
         (i.display_name||' OJT '||COALESCE(a.location,'')||' '||
          CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
          CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
            THEN 'Late' ELSE 'On time' END||' '||
          pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
          pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
   ), filtered AS (
     SELECT * FROM standard_rows
     UNION ALL
     SELECT * FROM ojt_rows
   ), metrics AS (
     SELECT
       pg_catalog.count(*)::integer AS sessions,
       pg_catalog.count(DISTINCT owner_key)::integer AS people,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day')::integer AS today,
       pg_catalog.count(*) FILTER (WHERE status='Completed')::integer AS completed,
       pg_catalog.count(*) FILTER (WHERE status='Active')::integer AS active,
       pg_catalog.count(*) FILTER (WHERE classification='Late')::integer AS late,
       COALESCE(pg_catalog.sum(credited_ms) FILTER (WHERE status='Completed'),0)::bigint AS credited_ms,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND classification='On time')::integer AS today_on_time,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND classification='Late')::integer AS today_late,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND status='Active')::integer AS today_active,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND status='Active' AND clock_in_at<=v_now-INTERVAL '14 hours')::integer AS today_stagnant,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND location='Office-Base Duty')::integer AS today_office,
       pg_catalog.count(*) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day'
         AND status='Completed')::integer AS today_completed,
       COALESCE(pg_catalog.sum(credited_ms) FILTER (WHERE clock_in_at>=v_today_start
         AND clock_in_at<v_today_start+INTERVAL '1 day' AND status='Completed'),0)::bigint
         AS today_credited_ms
     FROM filtered
   ), locations AS (
     SELECT COALESCE(pg_catalog.jsonb_agg(
       pg_catalog.jsonb_build_object('location',location,'count',count)
       ORDER BY location
     ),'[]'::jsonb) AS value
     FROM (
       SELECT location,pg_catalog.count(*)::integer AS count
       FROM filtered GROUP BY location
     ) counts
   )
   SELECT pg_catalog.jsonb_build_object(
     'sessions',metrics.sessions,
     'people',metrics.people,
     'today',metrics.today,
     'historical',GREATEST(0,metrics.sessions-metrics.today),
     'completed',metrics.completed,
     'active',metrics.active,
     'late',metrics.late,
     'creditedMs',metrics.credited_ms,
     'todayOnTime',metrics.today_on_time,
     'todayLate',metrics.today_late,
     'todayActive',metrics.today_active,
     'todayStagnant',metrics.today_stagnant,
     'todayOffice',metrics.today_office,
     'todayCompleted',metrics.today_completed,
     'todayCreditedMs',metrics.today_credited_ms,
     'locationCounts',locations.value
   ) INTO v_summary
   FROM metrics CROSS JOIN locations;

  ELSE
    v_summary:=NULL;
  END IF;

  IF v_sort='newest' THEN
    WITH standard_page AS (
      SELECT p.clock_in_at,0 AS source_rank,p.record_id,
        pg_catalog.jsonb_build_object(
          'id',p.record_id::text,'recordId',p.record_id::text,
          'sourceRank',0,'ownerId','cloud:'||p.employee_id::text,
          'name',COALESCE(NULLIF(pg_catalog.btrim(e.display_name),''),e.email,'Workforce member'),
          'clockIn',p.clock_in_at,'clockOut',p.clock_out_at,
          'department',COALESCE(NULLIF(p.department,''),'Unassigned'),
          'location',CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END,
          'status',CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END,
          'classification',CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
            WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
              THEN 'Late' ELSE 'On time' END,
          'workNote',p.work_note,'creditedMs',p.credited_ms,'isOjt',false,
          'revision',p.source_revision
        ) AS row_value
      FROM private.tt_attendance_board_projection p
      JOIN public.profiles e ON e.id=p.employee_id AND e.status='active'
      JOIN public.workspace_members wm
        ON wm.user_id=p.employee_id AND wm.workspace_id=v_workspace AND wm.active=true
      WHERE p.workspace_id=v_workspace AND p.board_id=p_board_id
        AND (v_team OR p.employee_id=v_actor)
        AND public.has_module_access('time-tracker',p.employee_id)
        AND (v_period='all' OR (p.clock_in_at>=v_period_start AND p.clock_in_at<=v_now))
        AND (v_status='all'
          OR (v_status='Active' AND p.clock_out_at IS NULL)
          OR (v_status='Completed' AND p.clock_out_at IS NOT NULL)
          OR (v_status='Late' AND p.closure_marker='' AND
            (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00')
          OR (v_status='Administrative closure' AND p.closure_marker<>''))
        AND (v_location='all' OR (CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END)=v_location)
        AND (p_employee_id IS NULL OR p.employee_id=p_employee_id)
        AND (v_record_id IS NULL OR p.record_id=v_record_id)
        AND (v_search='' OR
          (COALESCE(e.display_name,'')||' '||COALESCE(e.email,'')||' '||
           COALESCE(p.department,'')||' '||COALESCE(p.clock_in_location,'')||' '||
           CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
           CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
             WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
               THEN 'Late' ELSE 'On time' END||' '||
           pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
           pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
        AND (v_cursor_at IS NULL OR
          (p.clock_in_at,0,p.record_id)<(v_cursor_at,v_cursor_rank,v_cursor_id))
      ORDER BY p.clock_in_at DESC,p.record_id DESC
      LIMIT v_page_size+1
    ), ojt_page AS (
      SELECT a.clock_in_at,1 AS source_rank,a.id AS record_id,
        pg_catalog.jsonb_build_object(
          'id','ojt:'||a.id::text,'recordId',a.id::text,
          'sourceRank',1,'ownerId','ojt:'||a.intern_id::text,
          'name',i.display_name,'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
          'department','OJT','location',CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END,
          'status',CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END,
          'classification',CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
            THEN 'Late' ELSE 'On time' END,
          'workNote',a.work_note,
          'creditedMs',CASE WHEN a.clock_out_at IS NULL THEN NULL
            ELSE private.tt_attendance_credited_ms(a.clock_in_at,a.clock_out_at) END,
          'isOjt',true,'revision',a.revision
        ) AS row_value
      FROM private.tt_ojt_attendance a
      JOIN private.tt_ojt_interns i ON i.id=a.intern_id
      WHERE v_ojt AND a.workspace_id=v_workspace AND a.board_id=p_board_id
        AND p_employee_id IS NULL
        AND (v_record_id IS NULL OR a.id=v_record_id)
        AND (v_period='all' OR (a.clock_in_at>=v_period_start AND a.clock_in_at<=v_now))
        AND (v_status='all'
          OR (v_status='Active' AND a.clock_out_at IS NULL)
          OR (v_status='Completed' AND a.clock_out_at IS NOT NULL)
          OR (v_status='Late' AND (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'))
        AND (v_location='all' OR (CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END)=v_location)
        AND (v_search='' OR
          (i.display_name||' OJT '||COALESCE(a.location,'')||' '||
           CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
           CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
             THEN 'Late' ELSE 'On time' END||' '||
           pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
           pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
        AND (v_cursor_at IS NULL OR
          (a.clock_in_at,1,a.id)<(v_cursor_at,v_cursor_rank,v_cursor_id))
      ORDER BY a.clock_in_at DESC,a.id DESC
      LIMIT v_page_size+1
    ), candidates AS (
      SELECT * FROM standard_page
      UNION ALL
      SELECT * FROM ojt_page
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY clock_in_at DESC,source_rank DESC,record_id DESC),
      '[]'::jsonb) INTO v_page
    FROM (
      SELECT * FROM candidates
      ORDER BY clock_in_at DESC,source_rank DESC,record_id DESC
      LIMIT v_page_size+1
    ) page_rows;
  ELSE
    WITH standard_page AS (
      SELECT p.clock_in_at,0 AS source_rank,p.record_id,
        pg_catalog.jsonb_build_object(
          'id',p.record_id::text,'recordId',p.record_id::text,
          'sourceRank',0,'ownerId','cloud:'||p.employee_id::text,
          'name',COALESCE(NULLIF(pg_catalog.btrim(e.display_name),''),e.email,'Workforce member'),
          'clockIn',p.clock_in_at,'clockOut',p.clock_out_at,
          'department',COALESCE(NULLIF(p.department,''),'Unassigned'),
          'location',CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END,
          'status',CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END,
          'classification',CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
            WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
              THEN 'Late' ELSE 'On time' END,
          'workNote',p.work_note,'creditedMs',p.credited_ms,'isOjt',false,
          'revision',p.source_revision
        ) AS row_value
      FROM private.tt_attendance_board_projection p
      JOIN public.profiles e ON e.id=p.employee_id AND e.status='active'
      JOIN public.workspace_members wm
        ON wm.user_id=p.employee_id AND wm.workspace_id=v_workspace AND wm.active=true
      WHERE p.workspace_id=v_workspace AND p.board_id=p_board_id
        AND (v_team OR p.employee_id=v_actor)
        AND public.has_module_access('time-tracker',p.employee_id)
        AND (v_period='all' OR (p.clock_in_at>=v_period_start AND p.clock_in_at<=v_now))
        AND (v_status='all'
          OR (v_status='Active' AND p.clock_out_at IS NULL)
          OR (v_status='Completed' AND p.clock_out_at IS NOT NULL)
          OR (v_status='Late' AND p.closure_marker='' AND
            (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00')
          OR (v_status='Administrative closure' AND p.closure_marker<>''))
        AND (v_location='all' OR (CASE WHEN p.clock_in_location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN p.clock_in_location ELSE 'Unspecified' END)=v_location)
        AND (p_employee_id IS NULL OR p.employee_id=p_employee_id)
        AND (v_record_id IS NULL OR p.record_id=v_record_id)
        AND (v_search='' OR
          (COALESCE(e.display_name,'')||' '||COALESCE(e.email,'')||' '||
           COALESCE(p.department,'')||' '||COALESCE(p.clock_in_location,'')||' '||
           CASE WHEN p.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
           CASE WHEN p.closure_marker<>'' THEN 'Administrative closure'
             WHEN (p.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
               THEN 'Late' ELSE 'On time' END||' '||
           pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
           pg_catalog.to_char(p.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
        AND (v_cursor_at IS NULL OR
          (p.clock_in_at,0,p.record_id)>(v_cursor_at,v_cursor_rank,v_cursor_id))
      ORDER BY p.clock_in_at ASC,p.record_id ASC
      LIMIT v_page_size+1
    ), ojt_page AS (
      SELECT a.clock_in_at,1 AS source_rank,a.id AS record_id,
        pg_catalog.jsonb_build_object(
          'id','ojt:'||a.id::text,'recordId',a.id::text,
          'sourceRank',1,'ownerId','ojt:'||a.intern_id::text,
          'name',i.display_name,'clockIn',a.clock_in_at,'clockOut',a.clock_out_at,
          'department','OJT','location',CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END,
          'status',CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END,
          'classification',CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
            THEN 'Late' ELSE 'On time' END,
          'workNote',a.work_note,
          'creditedMs',CASE WHEN a.clock_out_at IS NULL THEN NULL
            ELSE private.tt_attendance_credited_ms(a.clock_in_at,a.clock_out_at) END,
          'isOjt',true,'revision',a.revision
        ) AS row_value
      FROM private.tt_ojt_attendance a
      JOIN private.tt_ojt_interns i ON i.id=a.intern_id
      WHERE v_ojt AND a.workspace_id=v_workspace AND a.board_id=p_board_id
        AND p_employee_id IS NULL
        AND (v_record_id IS NULL OR a.id=v_record_id)
        AND (v_period='all' OR (a.clock_in_at>=v_period_start AND a.clock_in_at<=v_now))
        AND (v_status='all'
          OR (v_status='Active' AND a.clock_out_at IS NULL)
          OR (v_status='Completed' AND a.clock_out_at IS NOT NULL)
          OR (v_status='Late' AND (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'))
        AND (v_location='all' OR (CASE WHEN a.location IN ('Office-Base Duty','Offsite (Home)','Local Field Works','Out of Town Assignment','International Field Assignments') THEN a.location ELSE 'Unspecified' END)=v_location)
        AND (v_search='' OR
          (i.display_name||' OJT '||COALESCE(a.location,'')||' '||
           CASE WHEN a.clock_out_at IS NULL THEN 'Active' ELSE 'Completed' END||' '||
           CASE WHEN (a.clock_in_at AT TIME ZONE 'Asia/Manila')::time>TIME '08:00'
             THEN 'Late' ELSE 'On time' END||' '||
           pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','FMDay, FMMonth FMDD, YYYY')||' '||
           pg_catalog.to_char(a.clock_in_at AT TIME ZONE 'Asia/Manila','HH12:MI AM')) ILIKE '%'||v_search||'%')
        AND (v_cursor_at IS NULL OR
          (a.clock_in_at,1,a.id)>(v_cursor_at,v_cursor_rank,v_cursor_id))
      ORDER BY a.clock_in_at ASC,a.id ASC
      LIMIT v_page_size+1
    ), candidates AS (
      SELECT * FROM standard_page
      UNION ALL
      SELECT * FROM ojt_page
    )
    SELECT COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY clock_in_at ASC,source_rank ASC,record_id ASC),
      '[]'::jsonb) INTO v_page
    FROM (
      SELECT * FROM candidates
      ORDER BY clock_in_at ASC,source_rank ASC,record_id ASC
      LIMIT v_page_size+1
    ) page_rows;
  END IF;

  -- Recheck after page construction to catch a write that raced the query.
  SELECT COALESCE(e.revision,0) INTO v_cursor_source_revision
  FROM public.module_state_entries e
  WHERE e.workspace_id=v_workspace AND e.module_id='time-tracker'
    AND e.state_key='timetracker.attendance.v1'
    AND e.scope='shared' AND e.owner_key='*';
  v_cursor_source_revision:=COALESCE(v_cursor_source_revision,0);
  IF v_ojt THEN
    SELECT COALESCE(r.revision,0) INTO v_cursor_ojt_revision
    FROM private.tt_ojt_attendance_log_revision r
    WHERE r.workspace_id=v_workspace AND r.board_id=p_board_id;
    v_cursor_ojt_revision:=COALESCE(v_cursor_ojt_revision,0);
  ELSE
    v_cursor_ojt_revision:=0;
  END IF;
  IF v_cursor_source_revision IS DISTINCT FROM v_source_revision OR
     v_cursor_ojt_revision IS DISTINCT FROM v_ojt_revision THEN
    RETURN pg_catalog.jsonb_build_object(
      'mode','STALE_SNAPSHOT','contract','tt-attendance-log-page-1',
      'actorId',v_actor::text,'workspaceId',v_workspace::text,
      'boardId',p_board_id::text,'scope',v_scope
    );
  END IF;

  v_has_more:=COALESCE(pg_catalog.jsonb_array_length(v_page),0)>v_page_size;
  IF v_has_more THEN
    v_last:=v_page->(v_page_size-1);
    v_next_cursor:=pg_catalog.jsonb_build_object(
      'clockIn',v_last->>'clockIn',
      'sourceRank',(v_last->>'sourceRank')::integer,
      'recordId',v_last->>'recordId',
      'sourceRevision',v_source_revision,
      'ojtRevision',v_ojt_revision
    );
    SELECT COALESCE(pg_catalog.jsonb_agg(value ORDER BY ordinality),'[]'::jsonb)
      INTO v_page
    FROM pg_catalog.jsonb_array_elements(v_page) WITH ORDINALITY AS rows(value,ordinality)
    WHERE ordinality<=v_page_size;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'mode','ACTIVE',
    'contract','tt-attendance-log-page-1',
    'actorId',v_actor::text,
    'workspaceId',v_workspace::text,
    'boardId',p_board_id::text,
    'scope',v_scope,
    'records',COALESCE(v_page,'[]'::jsonb),
    'hasMore',v_has_more,
    'nextCursor',v_next_cursor,
    'sourceRevision',v_source_revision,
    'ojtRevision',v_ojt_revision,
    'pageSize',v_page_size,
    'summary',v_summary
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.timetracker_attendance_log_page(uuid,integer,jsonb,text,text,text,text,uuid,text,boolean,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_attendance_log_page(uuid,integer,jsonb,text,text,text,text,uuid,text,boolean,uuid)
  TO authenticated;

COMMIT;
