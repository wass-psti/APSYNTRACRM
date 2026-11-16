-- CP-FM1-CORE-02 — server-backed incident lifecycle and SLA processing.
-- FM1 contract activation and outbound notification delivery remain inactive until
-- the agreement, readiness decisions, approved calendar and operational channels exist.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.workspaces') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
     OR to_regnamespace('private') IS NULL
     OR to_regnamespace('extensions') IS NULL
     OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'CP-FM1-CORE-02 prerequisites are not installed'
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS private.fm1_calendar_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_key text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  opens_at time NOT NULL DEFAULT time '08:00',
  closes_at time NOT NULL DEFAULT time '17:00',
  holiday_dates date[],
  approval_state text NOT NULL DEFAULT 'unconfigured'
    CHECK (approval_state IN ('unconfigured','pending_review','approved','superseded')),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (opens_at < closes_at),
  CHECK (weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  CHECK ((approval_state = 'approved') = (approved_at IS NOT NULL AND holiday_dates IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS private.fm1_service_config (
  service_key text PRIMARY KEY,
  contract_id text NOT NULL UNIQUE,
  client_name text NOT NULL,
  site_code text NOT NULL,
  site_location text NOT NULL,
  provider_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  term_start timestamptz NOT NULL,
  term_end_exclusive timestamptz NOT NULL,
  execution_state text NOT NULL DEFAULT 'awaiting_acceptance'
    CHECK (execution_state IN ('draft','awaiting_acceptance','onboarding','ready','active','suspended','expired','terminated')),
  readiness_state text NOT NULL DEFAULT 'pending'
    CHECK (readiness_state IN ('pending','in_progress','ready','needs_review')),
  calendar_version_id uuid REFERENCES private.fm1_calendar_versions(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (term_end_exclusive > term_start)
);

CREATE TABLE IF NOT EXISTS private.fm1_decisions (
  decision_key text PRIMARY KEY CHECK (decision_key IN ('D01','D02','D03','D04','D05','D06','D07','D08','D09')),
  decision_title text NOT NULL,
  approval_state text NOT NULL DEFAULT 'pending'
    CHECK (approval_state IN ('pending','approved','rejected','superseded')),
  decision_text text,
  evidence_reference text,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((approval_state = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

INSERT INTO private.fm1_calendar_versions (
  calendar_key, timezone, weekdays, opens_at, closes_at, holiday_dates, approval_state
)
VALUES ('BIOTECH-FM1-2027-UNCONFIGURED','Asia/Manila',
  ARRAY[1,2,3,4,5]::smallint[],time '08:00',time '17:00',NULL,'unconfigured')
ON CONFLICT (calendar_key) DO NOTHING;

INSERT INTO private.fm1_service_config (
  service_key,contract_id,client_name,site_code,site_location,provider_name,
  timezone,term_start,term_end_exclusive,execution_state,readiness_state,calendar_version_id
)
SELECT 'BIOTECH-FM1-2027','BIOTECH-FM1-2027','BIOTECH Farms, Inc.','FM1',
  'Tantangan, South Cotabato','Watchdog Automation Sales & Services','Asia/Manila',
  timestamptz '2027-01-01 00:00:00+08',timestamptz '2028-01-01 00:00:00+08',
  'awaiting_acceptance','pending',c.id
FROM private.fm1_calendar_versions c
WHERE c.calendar_key='BIOTECH-FM1-2027-UNCONFIGURED'
ON CONFLICT (service_key) DO NOTHING;

INSERT INTO private.fm1_decisions(decision_key,decision_title)
VALUES
 ('D01','Authority and readiness'),
 ('D02','Updates and due dates'),
 ('D03','Priority recalculation'),
 ('D04','Duplicates and recurrence'),
 ('D05','Billing increments'),
 ('D06','Credit period and claims'),
 ('D07','KPI cohort'),
 ('D08','Boundaries and calendars'),
 ('D09','IT operations')
ON CONFLICT (decision_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS private.fm1_ticket_number_counters (
  ticket_year integer PRIMARY KEY CHECK (ticket_year BETWEEN 2000 AND 2200),
  last_value bigint NOT NULL CHECK (last_value > 0)
);

CREATE TABLE IF NOT EXISTS private.fm1_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  service_key text NOT NULL DEFAULT 'BIOTECH-FM1-2027'
    REFERENCES private.fm1_service_config(service_key) ON DELETE RESTRICT,
  site_code text NOT NULL DEFAULT 'FM1',
  requester_name text NOT NULL CHECK (char_length(requester_name) BETWEEN 2 AND 120),
  callback_number text NOT NULL CHECK (char_length(callback_number) BETWEEN 7 AND 32),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 4 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 4000),
  priority_requested text NOT NULL CHECK (priority_requested IN ('P1','P2','P3','P4')),
  priority_effective text NOT NULL CHECK (priority_effective IN ('P1','P2','P3','P4')),
  production_impact text NOT NULL CHECK (production_impact IN ('critical','degraded','no-impact')),
  production_stopped boolean NOT NULL DEFAULT false,
  safety_concern boolean NOT NULL DEFAULT false,
  reporting_channel text NOT NULL CHECK (reporting_channel IN ('portal','email','telephone')),
  asset_reference text CHECK (asset_reference IS NULL OR char_length(asset_reference) <= 160),
  reported_occurred_at timestamptz,
  received_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'New'
    CHECK (status IN ('New','Triaged','Assigned','In Progress','Waiting','Restored','Resolution Review','Closed','Reopened','Duplicate','Cancelled')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  idempotency_key uuid NOT NULL,
  intake_fingerprint text NOT NULL CHECK (length(intake_fingerprint)=64),
  contract_state_at_receipt text NOT NULL DEFAULT 'awaiting_acceptance',
  sla_activation_state text NOT NULL DEFAULT 'NOT_ACTIVE'
    CHECK (sla_activation_state IN ('NOT_ACTIVE','PENDING_READINESS','ACTIVE','NEEDS_REVIEW')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id,idempotency_key),
  CHECK ((status='Closed') = (closed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS private.fm1_ticket_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source text NOT NULL DEFAULT 'crm',
  idempotency_key uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (ticket_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS private.fm1_priority_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence > 0),
  requested_priority text NOT NULL CHECK (requested_priority IN ('P1','P2','P3','P4')),
  effective_priority text NOT NULL CHECK (effective_priority IN ('P1','P2','P3','P4')),
  confirmed_priority text CHECK (confirmed_priority IS NULL OR confirmed_priority IN ('P1','P2','P3','P4')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision_state text NOT NULL DEFAULT 'pending_d03'
    CHECK (decision_state IN ('pending_d03','confirmed','needs_review')),
  idempotency_key uuid NOT NULL,
  UNIQUE (ticket_id,sequence),
  UNIQUE (ticket_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS private.fm1_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  metric text NOT NULL CHECK (metric IN ('human_response','engineering_start','public_update','restoration')),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('portal','email','telephone')),
  evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 8 AND 4000),
  human_confirmed boolean NOT NULL DEFAULT false,
  client_operator text,
  qualifies boolean NOT NULL DEFAULT false,
  review_state text NOT NULL DEFAULT 'recorded'
    CHECK (review_state IN ('recorded','needs_review','accepted','rejected')),
  idempotency_key uuid NOT NULL,
  UNIQUE (ticket_id,idempotency_key),
  CHECK (metric <> 'restoration' OR (client_operator IS NOT NULL AND char_length(client_operator) BETWEEN 2 AND 120))
);

CREATE TABLE IF NOT EXISTS private.fm1_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  metric text NOT NULL CHECK (metric IN ('engineering_start','restoration')),
  reason text NOT NULL CHECK (reason IN ('missing_access','client_authorization','essential_evidence','site_action','spares','oem_response','agreed_shutdown')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  starts_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  external_owner text NOT NULL CHECK (char_length(external_owner) BETWEEN 2 AND 160),
  required_action text NOT NULL CHECK (char_length(required_action) BETWEEN 3 AND 1000),
  evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 8 AND 4000),
  expected_review_at timestamptz,
  validation_state text NOT NULL DEFAULT 'pending'
    CHECK (validation_state IN ('pending','validated','rejected','ended')),
  validated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  validated_at timestamptz,
  remote_and_guided_diagnosis_blocked boolean NOT NULL DEFAULT false,
  resumed_at timestamptz,
  ended_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  end_reason text,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (ticket_id,idempotency_key),
  CHECK (expected_review_at IS NULL OR expected_review_at >= requested_at),
  CHECK ((validation_state IN ('validated','rejected','ended')) = (validated_by IS NOT NULL AND validated_at IS NOT NULL)),
  CHECK ((validation_state='ended') = (resumed_at IS NOT NULL AND ended_by IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS private.fm1_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  metric text NOT NULL CHECK (metric IN ('human_response','engineering_start','restoration','agreed_plan','public_update')),
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  priority text NOT NULL CHECK (priority IN ('P1','P2','P3','P4')),
  target_seconds bigint NOT NULL CHECK (target_seconds > 0),
  clock_mode text NOT NULL CHECK (clock_mode IN ('elapsed','support')),
  calendar_version_id uuid REFERENCES private.fm1_calendar_versions(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  proposed_due_at timestamptz,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('not_started','running','paused_where_permitted','met','breached','not_applicable','needs_review')),
  decision_state text NOT NULL DEFAULT 'pending_activation'
    CHECK (decision_state IN ('pending_activation','pending_calendar','pending_d02','pending_d03','ready','needs_review')),
  met_at timestamptz,
  completed_at timestamptz,
  breached_at timestamptz,
  last_evaluated_at timestamptz,
  calculation_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (ticket_id,metric,sequence),
  CHECK (due_at IS NULL OR proposed_due_at IS NULL OR due_at = proposed_due_at),
  CHECK ((status='met') = (met_at IS NOT NULL)),
  CHECK ((status='breached') = (breached_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS private.fm1_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence > 0),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL,
  correlation_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  event_hash text NOT NULL CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (ticket_id,sequence)
);

CREATE TABLE IF NOT EXISTS private.fm1_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  obligation_id uuid REFERENCES private.fm1_obligations(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  delivery_key text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'unconfigured'
    CHECK (channel IN ('unconfigured','email','sms','paging','manual_call')),
  recipient_scope text NOT NULL DEFAULT 'internal',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_state text NOT NULL DEFAULT 'pending_configuration'
    CHECK (delivery_state IN ('pending_configuration','queued','sending','delivered','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS private.fm1_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  scanned_count integer NOT NULL DEFAULT 0,
  breached_count integer NOT NULL DEFAULT 0,
  skipped_reason text,
  error_message text
);

CREATE INDEX IF NOT EXISTS fm1_tickets_workspace_received_idx
  ON private.fm1_tickets (workspace_id,received_at DESC,id);
CREATE INDEX IF NOT EXISTS fm1_tickets_workspace_status_idx
  ON private.fm1_tickets (workspace_id,status,received_at DESC);
CREATE INDEX IF NOT EXISTS fm1_tickets_workspace_priority_idx
  ON private.fm1_tickets (workspace_id,priority_effective,received_at DESC);
CREATE INDEX IF NOT EXISTS fm1_ticket_events_ticket_recorded_idx
  ON private.fm1_ticket_events (ticket_id,recorded_at DESC,event_id);
CREATE INDEX IF NOT EXISTS fm1_obligations_due_idx
  ON private.fm1_obligations (due_at,id) WHERE status='running';
CREATE INDEX IF NOT EXISTS fm1_obligations_ticket_metric_idx
  ON private.fm1_obligations (ticket_id,metric,sequence DESC);
CREATE INDEX IF NOT EXISTS fm1_audit_events_ticket_sequence_idx
  ON private.fm1_audit_events (ticket_id,sequence DESC);
CREATE INDEX IF NOT EXISTS fm1_holds_ticket_state_idx
  ON private.fm1_holds (ticket_id,validation_state,requested_at DESC);
CREATE INDEX IF NOT EXISTS fm1_outbox_pending_idx
  ON private.fm1_notification_outbox (delivery_state,available_at,created_at)
  WHERE delivery_state IN ('pending_configuration','queued','failed');

CREATE OR REPLACE FUNCTION private.fm1_reject_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'FM1 event history is append-only' USING ERRCODE='55000';
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_reject_append_only_truncate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'FM1 event history cannot be truncated' USING ERRCODE='55000';
END
$function$;

CREATE TRIGGER fm1_ticket_events_append_only
BEFORE UPDATE OR DELETE ON private.fm1_ticket_events
FOR EACH ROW EXECUTE FUNCTION private.fm1_reject_append_only_mutation();
CREATE TRIGGER fm1_ticket_events_no_truncate
BEFORE TRUNCATE ON private.fm1_ticket_events
FOR EACH STATEMENT EXECUTE FUNCTION private.fm1_reject_append_only_truncate();
CREATE TRIGGER fm1_priority_events_append_only
BEFORE UPDATE OR DELETE ON private.fm1_priority_events
FOR EACH ROW EXECUTE FUNCTION private.fm1_reject_append_only_mutation();
CREATE TRIGGER fm1_priority_events_no_truncate
BEFORE TRUNCATE ON private.fm1_priority_events
FOR EACH STATEMENT EXECUTE FUNCTION private.fm1_reject_append_only_truncate();
CREATE TRIGGER fm1_milestones_append_only
BEFORE UPDATE OR DELETE ON private.fm1_milestones
FOR EACH ROW EXECUTE FUNCTION private.fm1_reject_append_only_mutation();
CREATE TRIGGER fm1_milestones_no_truncate
BEFORE TRUNCATE ON private.fm1_milestones
FOR EACH STATEMENT EXECUTE FUNCTION private.fm1_reject_append_only_truncate();
CREATE TRIGGER fm1_audit_events_append_only
BEFORE UPDATE OR DELETE ON private.fm1_audit_events
FOR EACH ROW EXECUTE FUNCTION private.fm1_reject_append_only_mutation();
CREATE TRIGGER fm1_audit_events_no_truncate
BEFORE TRUNCATE ON private.fm1_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION private.fm1_reject_append_only_truncate();

CREATE OR REPLACE FUNCTION private.fm1_assert_workspace(p_workspace_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'A signed APSYNTRA CRM session is required' USING ERRCODE='28000';
  END IF;
  IF public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'The FM1 request does not match the active CRM workspace' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_union_ranges(p_ranges tstzrange[])
RETURNS tstzrange[] LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE
  v_range tstzrange;
  v_start timestamptz;
  v_end timestamptz;
  v_result tstzrange[] := ARRAY[]::tstzrange[];
BEGIN
  FOR v_range IN
    SELECT x.r FROM unnest(coalesce(p_ranges,ARRAY[]::tstzrange[])) AS x(r)
    WHERE NOT isempty(x.r) AND lower(x.r) IS NOT NULL AND upper(x.r) IS NOT NULL
      AND upper(x.r)>lower(x.r)
    ORDER BY lower(x.r),upper(x.r)
  LOOP
    IF v_start IS NULL THEN
      v_start:=lower(v_range); v_end:=upper(v_range);
    ELSIF lower(v_range)<=v_end THEN
      v_end:=greatest(v_end,upper(v_range));
    ELSE
      v_result:=array_append(v_result,tstzrange(v_start,v_end,'[)'));
      v_start:=lower(v_range); v_end:=upper(v_range);
    END IF;
  END LOOP;
  IF v_start IS NOT NULL THEN
    v_result:=array_append(v_result,tstzrange(v_start,v_end,'[)'));
  END IF;
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_union_seconds(p_ranges tstzrange[])
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT coalesce(sum(extract(epoch FROM upper(x.r)-lower(x.r)))::bigint,0)
  FROM unnest(private.fm1_union_ranges(p_ranges)) AS x(r)
$function$;

CREATE OR REPLACE FUNCTION private.fm1_elapsed_deadline(
  p_start timestamptz,p_target_seconds bigint,
  p_exclusions tstzrange[] DEFAULT ARRAY[]::tstzrange[]
)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE
  v_cursor timestamptz:=p_start;
  v_remaining numeric:=p_target_seconds;
  v_range tstzrange;
  v_available numeric;
BEGIN
  IF p_start IS NULL OR p_target_seconds IS NULL OR p_target_seconds<=0 THEN RETURN NULL; END IF;
  FOR v_range IN SELECT x.r FROM unnest(private.fm1_union_ranges(p_exclusions)) AS x(r) LOOP
    IF upper(v_range)<=v_cursor THEN CONTINUE; END IF;
    v_available:=greatest(0,extract(epoch FROM lower(v_range)-v_cursor));
    IF v_available>=v_remaining THEN
      RETURN v_cursor+make_interval(secs=>v_remaining::double precision);
    END IF;
    v_remaining:=v_remaining-v_available;
    v_cursor:=greatest(v_cursor,upper(v_range));
  END LOOP;
  RETURN v_cursor+make_interval(secs=>v_remaining::double precision);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_support_deadline(
  p_start timestamptz,p_target_seconds bigint,p_calendar_version_id uuid,
  p_exclusions tstzrange[] DEFAULT ARRAY[]::tstzrange[]
)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = ''
AS $function$
DECLARE
  v_calendar private.fm1_calendar_versions%ROWTYPE;
  v_local_date date;
  v_open timestamptz;
  v_close timestamptz;
  v_cursor timestamptz;
  v_remaining numeric:=p_target_seconds;
  v_range tstzrange;
  v_available numeric;
  v_day integer;
BEGIN
  IF p_start IS NULL OR p_target_seconds IS NULL OR p_target_seconds<=0
     OR p_calendar_version_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_calendar FROM private.fm1_calendar_versions WHERE id=p_calendar_version_id;
  IF NOT FOUND OR v_calendar.approval_state<>'approved' OR v_calendar.holiday_dates IS NULL THEN
    RETURN NULL;
  END IF;
  v_local_date:=(p_start AT TIME ZONE v_calendar.timezone)::date;
  FOR v_day IN 0..3650 LOOP
    IF extract(dow FROM v_local_date)::smallint=ANY(v_calendar.weekdays)
       AND NOT (v_local_date=ANY(v_calendar.holiday_dates)) THEN
      v_open:=(v_local_date+v_calendar.opens_at) AT TIME ZONE v_calendar.timezone;
      v_close:=(v_local_date+v_calendar.closes_at) AT TIME ZONE v_calendar.timezone;
      v_cursor:=greatest(p_start,v_open);
      IF v_close>v_cursor THEN
        FOR v_range IN SELECT x.r FROM unnest(private.fm1_union_ranges(p_exclusions)) AS x(r) LOOP
          IF upper(v_range)<=v_cursor OR lower(v_range)>=v_close THEN CONTINUE; END IF;
          v_available:=greatest(0,extract(epoch FROM least(lower(v_range),v_close)-v_cursor));
          IF v_available>=v_remaining THEN
            RETURN v_cursor+make_interval(secs=>v_remaining::double precision);
          END IF;
          v_remaining:=v_remaining-v_available;
          v_cursor:=greatest(v_cursor,upper(v_range));
          EXIT WHEN v_cursor>=v_close OR v_remaining<=0;
        END LOOP;
        IF v_remaining<=0 THEN RETURN v_cursor; END IF;
        IF v_cursor<v_close THEN
          v_available:=extract(epoch FROM v_close-v_cursor);
          IF v_available>=v_remaining THEN
            RETURN v_cursor+make_interval(secs=>v_remaining::double precision);
          END IF;
          v_remaining:=v_remaining-v_available;
        END IF;
      END IF;
    END IF;
    v_local_date:=v_local_date+1;
  END LOOP;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_target(p_priority text,p_metric text)
RETURNS TABLE(target_seconds bigint,clock_mode text,decision_key text)
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $function$
  SELECT CASE
    WHEN p_priority='P1' AND p_metric='human_response' THEN 1800
    WHEN p_priority='P1' AND p_metric='engineering_start' THEN 3600
    WHEN p_priority='P1' AND p_metric='restoration' THEN 14400
    WHEN p_priority='P1' AND p_metric='public_update' THEN 3600
    WHEN p_priority='P2' AND p_metric='human_response' THEN 3600
    WHEN p_priority='P2' AND p_metric='engineering_start' THEN 7200
    WHEN p_priority='P2' AND p_metric='restoration' THEN 28800
    WHEN p_priority='P2' AND p_metric='public_update' THEN 7200
    WHEN p_priority='P3' AND p_metric='human_response' THEN 14400
    WHEN p_priority='P3' AND p_metric='engineering_start' THEN 28800
    WHEN p_priority='P3' AND p_metric='restoration' THEN 97200
    WHEN p_priority='P3' AND p_metric='public_update' THEN 32400
    WHEN p_priority='P4' AND p_metric='human_response' THEN 32400
    WHEN p_priority='P4' AND p_metric='engineering_start' THEN 97200
    WHEN p_priority='P4' AND p_metric='agreed_plan' THEN 162000
    WHEN p_priority='P4' AND p_metric='public_update' THEN 162000
    ELSE NULL END::bigint,
    CASE WHEN p_priority IN ('P1','P2') THEN 'elapsed' ELSE 'support' END,
    CASE WHEN p_metric='public_update' THEN 'D02' ELSE NULL END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_decision_approved(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS(SELECT 1 FROM private.fm1_decisions WHERE decision_key=p_key AND approval_state='approved')
$function$;

CREATE OR REPLACE FUNCTION private.fm1_activate_service_if_ready(p_now timestamptz DEFAULT clock_timestamp())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_config private.fm1_service_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM private.fm1_service_config
  WHERE service_key='BIOTECH-FM1-2027' FOR UPDATE;
  IF NOT FOUND OR p_now<v_config.term_start OR p_now>=v_config.term_end_exclusive
     OR v_config.execution_state<>'active' OR v_config.readiness_state<>'ready'
     OR NOT EXISTS (
       SELECT 1 FROM private.fm1_calendar_versions cal
       WHERE cal.id=v_config.calendar_version_id
         AND cal.approval_state='approved' AND cal.holiday_dates IS NOT NULL
     )
     OR NOT private.fm1_decision_approved('D01')
     OR NOT private.fm1_decision_approved('D08')
     OR NOT private.fm1_decision_approved('D09') THEN
    RETURN false;
  END IF;
  UPDATE private.fm1_service_config
  SET activated_at=coalesce(activated_at,p_now),
      updated_at=CASE WHEN activated_at IS NULL THEN p_now ELSE updated_at END
  WHERE service_key='BIOTECH-FM1-2027';
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_service_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM private.fm1_service_config c
    JOIN private.fm1_calendar_versions cal ON cal.id=c.calendar_version_id
    WHERE c.service_key='BIOTECH-FM1-2027'
      AND c.execution_state='active' AND c.readiness_state='ready'
      AND c.activated_at IS NOT NULL
      AND clock_timestamp()>=c.term_start AND clock_timestamp()<c.term_end_exclusive
      AND cal.approval_state='approved' AND cal.holiday_dates IS NOT NULL
      AND private.fm1_decision_approved('D01')
      AND private.fm1_decision_approved('D08')
      AND private.fm1_decision_approved('D09')
  )
$function$;

CREATE OR REPLACE FUNCTION private.fm1_append_audit_event(
  p_ticket_id uuid,p_workspace_id uuid,p_actor_id uuid,p_event_type text,
  p_occurred_at timestamptz,p_payload jsonb DEFAULT '{}'::jsonb,p_correlation_id uuid DEFAULT NULL
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_sequence bigint;
  v_previous_hash text;
  v_recorded_at timestamptz:=clock_timestamp();
  v_material jsonb;
  v_hash text;
  v_id bigint;
BEGIN
  SELECT coalesce(max(sequence),0)+1 INTO v_sequence
  FROM private.fm1_audit_events WHERE ticket_id=p_ticket_id;
  SELECT event_hash INTO v_previous_hash
  FROM private.fm1_audit_events WHERE ticket_id=p_ticket_id
  ORDER BY sequence DESC LIMIT 1;
  v_material:=jsonb_build_object(
    'ticket_id',p_ticket_id,'workspace_id',p_workspace_id,'sequence',v_sequence,
    'actor_id',p_actor_id,'event_type',p_event_type,'occurred_at',p_occurred_at,
    'recorded_at',v_recorded_at,'correlation_id',p_correlation_id,
    'payload',coalesce(p_payload,'{}'::jsonb),'previous_hash',v_previous_hash
  );
  v_hash:=encode(extensions.digest(convert_to(v_material::text,'UTF8'),'sha256'),'hex');
  INSERT INTO private.fm1_audit_events(
    ticket_id,workspace_id,sequence,actor_id,event_type,occurred_at,recorded_at,
    correlation_id,payload,previous_hash,event_hash
  ) VALUES (
    p_ticket_id,p_workspace_id,v_sequence,p_actor_id,p_event_type,p_occurred_at,
    v_recorded_at,p_correlation_id,coalesce(p_payload,'{}'::jsonb),v_previous_hash,v_hash
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_append_ticket_event(
  p_ticket_id uuid,p_workspace_id uuid,p_actor_id uuid,p_event_type text,
  p_occurred_at timestamptz,p_source text,p_idempotency_key uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,p_correlation_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO private.fm1_ticket_events(
    ticket_id,workspace_id,event_type,actor_id,occurred_at,source,idempotency_key,payload
  ) VALUES (
    p_ticket_id,p_workspace_id,p_event_type,p_actor_id,p_occurred_at,p_source,
    p_idempotency_key,coalesce(p_payload,'{}'::jsonb)
  )
  ON CONFLICT(ticket_id,idempotency_key) DO NOTHING
  RETURNING event_id INTO v_event_id;
  IF v_event_id IS NULL THEN
    SELECT event_id INTO v_event_id FROM private.fm1_ticket_events
    WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
    RETURN v_event_id;
  END IF;
  PERFORM private.fm1_append_audit_event(
    p_ticket_id,p_workspace_id,p_actor_id,p_event_type,p_occurred_at,
    coalesce(p_payload,'{}'::jsonb),p_correlation_id
  );
  RETURN v_event_id;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_next_ticket_number(p_received_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_year integer:=extract(year FROM (p_received_at AT TIME ZONE 'Asia/Manila'))::integer;
  v_sequence bigint;
BEGIN
  INSERT INTO private.fm1_ticket_number_counters(ticket_year,last_value)
  VALUES(v_year,1)
  ON CONFLICT(ticket_year) DO UPDATE
    SET last_value=private.fm1_ticket_number_counters.last_value+1
  RETURNING last_value INTO v_sequence;
  RETURN 'FM1-'||v_year::text||'-'||lpad(v_sequence::text,6,'0');
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_create_obligations(p_ticket private.fm1_tickets)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_metric text;
  v_metrics text[];
  v_target bigint;
  v_mode text;
  v_decision text;
  v_calendar uuid;
  v_activated_at timestamptz;
  v_start timestamptz;
  v_due timestamptz;
  v_ready boolean;
  v_count integer:=0;
BEGIN
  PERFORM private.fm1_activate_service_if_ready(p_ticket.received_at);
  SELECT calendar_version_id,activated_at INTO v_calendar,v_activated_at
  FROM private.fm1_service_config WHERE service_key=p_ticket.service_key;
  v_ready:=private.fm1_service_ready();
  v_start:=CASE WHEN v_ready THEN greatest(p_ticket.received_at,v_activated_at)
    ELSE p_ticket.received_at END;
  v_metrics:=CASE WHEN p_ticket.priority_effective='P4'
    THEN ARRAY['human_response','engineering_start','agreed_plan','public_update']::text[]
    ELSE ARRAY['human_response','engineering_start','restoration','public_update']::text[] END;
  FOREACH v_metric IN ARRAY v_metrics LOOP
    SELECT target_seconds,clock_mode,decision_key
      INTO v_target,v_mode,v_decision
    FROM private.fm1_target(p_ticket.priority_effective,v_metric);
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_due:=CASE WHEN v_mode='elapsed'
      THEN v_start+make_interval(secs=>v_target::double precision)
      ELSE private.fm1_support_deadline(v_start,v_target,v_calendar) END;
    INSERT INTO private.fm1_obligations(
      ticket_id,metric,sequence,priority,target_seconds,clock_mode,calendar_version_id,
      starts_at,proposed_due_at,due_at,status,decision_state
    ) VALUES (
      p_ticket.id,v_metric,1,p_ticket.priority_effective,v_target,v_mode,v_calendar,
      v_start,v_due,
      CASE WHEN v_ready AND (v_decision IS NULL OR private.fm1_decision_approved(v_decision))
        AND (v_mode='elapsed' OR v_due IS NOT NULL) THEN v_due ELSE NULL END,
      CASE WHEN v_ready AND (v_decision IS NULL OR private.fm1_decision_approved(v_decision))
        AND (v_mode='elapsed' OR v_due IS NOT NULL) THEN 'running' ELSE 'needs_review' END,
      CASE WHEN NOT v_ready THEN 'pending_activation'
        WHEN v_mode='support' AND v_due IS NULL THEN 'pending_calendar'
        WHEN v_decision IS NOT NULL AND NOT private.fm1_decision_approved(v_decision) THEN 'pending_d02'
        ELSE 'ready' END
    ) ON CONFLICT(ticket_id,metric,sequence) DO NOTHING;
    IF FOUND THEN v_count:=v_count+1; END IF;
  END LOOP;
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_recalculate_obligation_due(
  p_ticket_id uuid,p_metric text,p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_ticket private.fm1_tickets%ROWTYPE;
  v_obligation private.fm1_obligations%ROWTYPE;
  v_target bigint;
  v_mode text;
  v_decision text;
  v_calendar uuid;
  v_activated_at timestamptz;
  v_start timestamptz;
  v_exclusions tstzrange[];
  v_due timestamptz;
BEGIN
  SELECT * INTO v_ticket FROM private.fm1_tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND OR NOT private.fm1_service_ready() THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM private.fm1_priority_events pe
    WHERE pe.ticket_id=p_ticket_id AND pe.sequence>1)
     AND NOT private.fm1_decision_approved('D03') THEN
    RETURN;
  END IF;
  SELECT target_seconds,clock_mode,decision_key INTO v_target,v_mode,v_decision
  FROM private.fm1_target(v_ticket.priority_effective,p_metric);
  IF v_target IS NULL OR (v_decision IS NOT NULL AND NOT private.fm1_decision_approved(v_decision)) THEN RETURN; END IF;
  SELECT calendar_version_id,activated_at INTO v_calendar,v_activated_at
  FROM private.fm1_service_config WHERE service_key=v_ticket.service_key;
  v_start:=greatest(v_ticket.received_at,v_activated_at);
  SELECT coalesce(array_agg(tstzrange(h.starts_at,coalesce(h.resumed_at,p_now),'[)')),'{}'::tstzrange[])
    INTO v_exclusions
  FROM private.fm1_holds h
  WHERE h.ticket_id=p_ticket_id AND h.metric=p_metric
    AND h.validation_state IN ('validated','ended');
  v_due:=CASE WHEN v_mode='elapsed'
    THEN private.fm1_elapsed_deadline(v_start,v_target,v_exclusions)
    ELSE private.fm1_support_deadline(v_start,v_target,v_calendar,v_exclusions) END;
  IF v_due IS NULL THEN RETURN; END IF;
  SELECT * INTO v_obligation FROM private.fm1_obligations
  WHERE ticket_id=p_ticket_id AND metric=p_metric
  ORDER BY sequence DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_obligation.status IN ('met','breached','not_applicable') THEN RETURN; END IF;
  UPDATE private.fm1_obligations
  SET target_seconds=v_target,clock_mode=v_mode,calendar_version_id=v_calendar,
      starts_at=v_start,proposed_due_at=v_due,due_at=v_due,status='running',decision_state='ready',
      updated_at=p_now
  WHERE id=v_obligation.id;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_service_status_impl(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_service jsonb;
  v_decisions jsonb;
BEGIN
  SELECT to_jsonb(c) INTO v_service FROM private.fm1_service_config c
  WHERE service_key='BIOTECH-FM1-2027';
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.decision_key),'[]'::jsonb)
    INTO v_decisions FROM private.fm1_decisions d;
  RETURN jsonb_build_object(
    'service',v_service,'decisions',v_decisions,
    'contract_active',private.fm1_service_ready(),
    'sla_activation_state','PENDING_ACCEPTANCE_AND_READINESS',
    'external_notifications_enabled',false
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_create_ticket_impl(
  p_workspace_id uuid,p_idempotency_key uuid,p_requester_name text,p_callback_number text,
  p_subject text,p_description text,p_priority text,p_production_impact text,
  p_production_stopped boolean,p_safety_concern boolean,p_channel text,
  p_asset_reference text,p_reported_occurred_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_received_at timestamptz:=clock_timestamp();
  v_fingerprint text;
  v_ticket private.fm1_tickets%ROWTYPE;
  v_number text;
  v_service_state text;
  v_obligation_count integer;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_requester_name IS NULL OR char_length(btrim(p_requester_name)) NOT BETWEEN 2 AND 120
    OR p_callback_number IS NULL OR char_length(btrim(p_callback_number)) NOT BETWEEN 7 AND 32
    OR p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 4 AND 160
    OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 4000
    OR p_priority IS NULL OR p_priority NOT IN ('P1','P2','P3','P4')
    OR p_production_impact IS NULL OR p_production_impact NOT IN ('critical','degraded','no-impact')
    OR p_channel IS NULL OR p_channel NOT IN ('portal','email','telephone')
    OR (p_asset_reference IS NOT NULL AND char_length(btrim(p_asset_reference))>160)
    OR p_reported_occurred_at>v_received_at+interval '1 minute' THEN
    RAISE EXCEPTION 'FM1 intake fields are invalid' USING ERRCODE='22023';
  END IF;

  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'requester_name',btrim(p_requester_name),'callback_number',btrim(p_callback_number),
    'subject',btrim(p_subject),'description',btrim(p_description),'priority',p_priority,
    'production_impact',p_production_impact,'production_stopped',coalesce(p_production_stopped,false),
    'safety_concern',coalesce(p_safety_concern,false),'channel',p_channel,
    'asset_reference',nullif(btrim(coalesce(p_asset_reference,'')),''),
    'reported_occurred_at',p_reported_occurred_at
  )::text,'UTF8'),'sha256'),'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_idempotency_key::text,0));
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE workspace_id=p_workspace_id AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_ticket.intake_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'FM1 idempotency key was already used with different intake data' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',true,
      'sla_activation_state',v_ticket.sla_activation_state);
  END IF;

  v_number:=private.fm1_next_ticket_number(v_received_at);
  SELECT execution_state INTO v_service_state FROM private.fm1_service_config
  WHERE service_key='BIOTECH-FM1-2027';

  INSERT INTO private.fm1_tickets(
    ticket_number,workspace_id,requester_name,callback_number,subject,description,
    priority_requested,priority_effective,production_impact,production_stopped,safety_concern,
    reporting_channel,asset_reference,reported_occurred_at,received_at,recorded_at,
    created_by,idempotency_key,intake_fingerprint,contract_state_at_receipt,sla_activation_state
  ) VALUES (
    v_number,p_workspace_id,btrim(p_requester_name),btrim(p_callback_number),btrim(p_subject),
    btrim(p_description),p_priority,p_priority,p_production_impact,coalesce(p_production_stopped,false),
    coalesce(p_safety_concern,false),p_channel,nullif(btrim(coalesce(p_asset_reference,'')),''),
    p_reported_occurred_at,v_received_at,v_received_at,v_actor,p_idempotency_key,v_fingerprint,
    coalesce(v_service_state,'awaiting_acceptance'),'NOT_ACTIVE'
  ) RETURNING * INTO v_ticket;

  INSERT INTO private.fm1_priority_events(
    ticket_id,sequence,requested_priority,effective_priority,reason,actor_id,changed_at,
    decision_state,idempotency_key
  ) VALUES (
    v_ticket.id,1,p_priority,p_priority,'Priority proposed at original intake.',
    v_actor,v_received_at,'pending_d03',p_idempotency_key
  );

  v_obligation_count:=private.fm1_create_obligations(v_ticket);
  PERFORM private.fm1_append_ticket_event(
    v_ticket.id,p_workspace_id,v_actor,'TicketReceived',v_received_at,p_channel,
    p_idempotency_key,jsonb_build_object(
      'ticket_number',v_number,'reported_occurred_at',p_reported_occurred_at,
      'received_at',v_received_at,'priority',p_priority,'sla_activation_state','NOT_ACTIVE'
    ),p_idempotency_key
  );

  INSERT INTO private.fm1_notification_outbox(
    ticket_id,event_type,delivery_key,recipient_scope,payload,delivery_state
  ) VALUES (
    v_ticket.id,'TicketReceived','ticket-received:'||v_ticket.id::text,'internal',
    jsonb_build_object('ticket_id',v_ticket.id,'ticket_number',v_number,
      'priority',p_priority,'site','FM1','delivery_status','pending operational channel configuration'),
    'pending_configuration'
  ) ON CONFLICT(delivery_key) DO NOTHING;

  RETURN jsonb_build_object(
    'ticket',to_jsonb(v_ticket),'obligation_count',v_obligation_count,
    'idempotent_replay',false,'sla_activation_state','NOT_ACTIVE',
    'service_state',coalesce(v_service_state,'awaiting_acceptance'),
    'external_notifications_enabled',false
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_list_tickets_impl(
  p_workspace_id uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,p_status text DEFAULT NULL,p_priority text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
    OR (p_status IS NOT NULL AND p_status NOT IN ('New','Triaged','Assigned','In Progress','Waiting','Restored','Resolution Review','Closed','Reopened','Duplicate','Cancelled'))
    OR (p_priority IS NOT NULL AND p_priority NOT IN ('P1','P2','P3','P4'))
    OR (p_search IS NOT NULL AND char_length(p_search)>160) THEN
    RAISE EXCEPTION 'FM1 ticket list filters are invalid' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_total FROM private.fm1_tickets t
  WHERE t.workspace_id=p_workspace_id
    AND (p_status IS NULL OR t.status=p_status)
    AND (p_priority IS NULL OR t.priority_effective=p_priority)
    AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
      OR t.ticket_number ILIKE '%'||btrim(p_search)||'%'
      OR t.subject ILIKE '%'||btrim(p_search)||'%'
      OR t.requester_name ILIKE '%'||btrim(p_search)||'%');
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.id),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT t.id,t.workspace_id,t.ticket_number,t.subject,t.requester_name,t.priority_requested,
      t.priority_effective,t.production_impact,t.production_stopped,t.safety_concern,
      t.reporting_channel,t.status,t.revision,t.received_at,t.reported_occurred_at,
      t.sla_activation_state,t.assigned_to
    FROM private.fm1_tickets t
    WHERE t.workspace_id=p_workspace_id
      AND (p_status IS NULL OR t.status=p_status)
      AND (p_priority IS NULL OR t.priority_effective=p_priority)
      AND (nullif(btrim(coalesce(p_search,'')),'') IS NULL
        OR t.ticket_number ILIKE '%'||btrim(p_search)||'%'
        OR t.subject ILIKE '%'||btrim(p_search)||'%'
        OR t.requester_name ILIKE '%'||btrim(p_search)||'%')
    ORDER BY t.received_at DESC,t.id
    LIMIT p_limit OFFSET p_offset
  ) q;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_ticket_detail_impl(p_workspace_id uuid,p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket jsonb;
  v_obligations jsonb;
  v_events jsonb;
  v_milestones jsonb;
  v_holds jsonb;
  v_audit jsonb;
BEGIN
  SELECT to_jsonb(t) INTO v_ticket FROM private.fm1_tickets t
  WHERE t.id=p_ticket_id AND t.workspace_id=p_workspace_id;
  IF v_ticket IS NULL THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.metric,o.sequence),'[]'::jsonb)
    INTO v_obligations FROM private.fm1_obligations o WHERE o.ticket_id=p_ticket_id;
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.recorded_at,e.event_id),'[]'::jsonb)
    INTO v_events FROM private.fm1_ticket_events e WHERE e.ticket_id=p_ticket_id;
  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.recorded_at,m.id),'[]'::jsonb)
    INTO v_milestones FROM private.fm1_milestones m WHERE m.ticket_id=p_ticket_id;
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.requested_at,h.id),'[]'::jsonb)
    INTO v_holds FROM private.fm1_holds h WHERE h.ticket_id=p_ticket_id;
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.sequence),'[]'::jsonb)
    INTO v_audit FROM private.fm1_audit_events a WHERE a.ticket_id=p_ticket_id;
  RETURN jsonb_build_object('ticket',v_ticket,'obligations',v_obligations,
    'events',v_events,'milestones',v_milestones,'holds',v_holds,'audit',v_audit);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_transition_ticket_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_next_status text,
  p_reason text,p_idempotency_key uuid,p_client_operator text DEFAULT NULL,p_evidence text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_existing private.fm1_ticket_events%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
  v_previous_status text;
  v_valid boolean:=false;
  v_reopen_metric text;
BEGIN
  IF p_idempotency_key IS NULL OR p_expected_revision IS NULL
    OR p_next_status IS NULL OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'FM1 transition fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_existing FROM private.fm1_ticket_events
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',true); END IF;
  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;
  v_previous_status:=v_ticket.status;
  v_valid:=CASE v_ticket.status
    WHEN 'New' THEN p_next_status IN ('Triaged','Duplicate','Cancelled')
    WHEN 'Triaged' THEN p_next_status IN ('Assigned','Duplicate','Cancelled')
    WHEN 'Assigned' THEN p_next_status IN ('In Progress','Waiting','Duplicate','Cancelled')
    WHEN 'In Progress' THEN p_next_status IN ('Waiting','Restored','Duplicate','Cancelled')
    WHEN 'Waiting' THEN p_next_status IN ('In Progress','Restored','Duplicate','Cancelled')
    WHEN 'Restored' THEN p_next_status IN ('Resolution Review','Reopened','Duplicate','Cancelled')
    WHEN 'Resolution Review' THEN p_next_status IN ('Closed','Reopened','Duplicate','Cancelled')
    WHEN 'Closed' THEN p_next_status='Reopened'
    WHEN 'Reopened' THEN p_next_status IN ('Triaged','Assigned','In Progress','Waiting','Restored','Duplicate','Cancelled')
    ELSE false END;
  IF NOT v_valid THEN
    RAISE EXCEPTION 'FM1 ticket transition % -> % is not valid',v_ticket.status,p_next_status USING ERRCODE='22023';
  END IF;
  IF p_next_status='Restored' AND NOT EXISTS(
    SELECT 1 FROM private.fm1_milestones m
    WHERE m.ticket_id=p_ticket_id AND m.metric='restoration' AND m.qualifies=true
  ) THEN
    RAISE EXCEPTION 'Record verified usable restoration and Client operator evidence before transitioning to Restored'
      USING ERRCODE='22023';
  END IF;
  IF p_next_status='Closed' AND (p_evidence IS NULL OR char_length(btrim(p_evidence))<8) THEN
    RAISE EXCEPTION 'A closure summary is required' USING ERRCODE='22023';
  END IF;

  UPDATE private.fm1_tickets
  SET status=p_next_status,
      closed_at=CASE WHEN p_next_status='Closed' THEN v_now ELSE NULL END,
      revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'TicketTransitioned',v_now,'crm',p_idempotency_key,
    jsonb_build_object('previous_status',v_previous_status,'next_status',p_next_status,
      'reason',btrim(p_reason),'closure_summary',nullif(btrim(coalesce(p_evidence,'')),'')),
    p_idempotency_key
  );

  IF p_next_status='Reopened' THEN
    v_reopen_metric:=CASE WHEN v_ticket.priority_effective='P4' THEN 'agreed_plan' ELSE 'restoration' END;
    INSERT INTO private.fm1_obligations(
      ticket_id,metric,sequence,priority,target_seconds,clock_mode,starts_at,
      proposed_due_at,due_at,status,decision_state
    )
    SELECT p_ticket_id,v_reopen_metric,coalesce(max(o.sequence),0)+1,
      v_ticket.priority_effective,t.target_seconds,t.clock_mode,v_ticket.received_at,
      NULL,NULL,'needs_review','needs_review'
    FROM private.fm1_obligations o
    CROSS JOIN LATERAL private.fm1_target(v_ticket.priority_effective,v_reopen_metric) t
    WHERE o.ticket_id=p_ticket_id
    GROUP BY t.target_seconds,t.clock_mode;
    PERFORM private.fm1_append_audit_event(
      p_ticket_id,p_workspace_id,v_actor,'RestorationMeasurementReopened',v_now,
      jsonb_build_object('original_received_at',v_ticket.received_at,
        'reason',btrim(p_reason),'calculation_state','needs_review'),p_idempotency_key
    );
  END IF;
  RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',false);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_record_milestone_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_metric text,
  p_channel text,p_evidence text,p_idempotency_key uuid,p_human_confirmed boolean DEFAULT false,
  p_client_operator text DEFAULT NULL,p_occurred_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
  v_occurred timestamptz:=coalesce(p_occurred_at,v_now);
  v_qualifies boolean:=false;
  v_review text:='recorded';
  v_milestone private.fm1_milestones%ROWTYPE;
  v_obligation private.fm1_obligations%ROWTYPE;
  v_event_type text;
  v_target bigint;
  v_mode text;
  v_decision text;
  v_calendar uuid;
  v_due timestamptz;
  v_sequence integer;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_metric IS NULL OR p_metric NOT IN ('human_response','engineering_start','public_update','restoration')
    OR p_channel IS NULL OR p_channel NOT IN ('portal','email','telephone')
    OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000
    OR v_occurred>v_now+interval '1 minute' THEN
    RAISE EXCEPTION 'FM1 milestone fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_milestone FROM private.fm1_milestones
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('milestone',to_jsonb(v_milestone),'idempotent_replay',true); END IF;
  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;

  v_qualifies:=CASE
    WHEN p_metric IN ('human_response','public_update') THEN coalesce(p_human_confirmed,false)
    WHEN p_metric='engineering_start' THEN char_length(btrim(p_evidence))>=20
    WHEN p_metric='restoration' THEN coalesce(p_human_confirmed,false)
      AND p_client_operator IS NOT NULL
      AND char_length(btrim(p_client_operator)) BETWEEN 2 AND 120
    ELSE false END;
  IF v_occurred<v_now-interval '1 second' THEN
    v_qualifies:=false; v_review:='needs_review';
  END IF;
  IF NOT v_qualifies THEN v_review:='needs_review'; END IF;

  INSERT INTO private.fm1_milestones(
    ticket_id,metric,occurred_at,actor_id,channel,evidence,human_confirmed,
    client_operator,qualifies,review_state,idempotency_key
  ) VALUES (
    p_ticket_id,p_metric,v_occurred,v_actor,p_channel,btrim(p_evidence),
    coalesce(p_human_confirmed,false),nullif(btrim(coalesce(p_client_operator,'')),''),
    v_qualifies,v_review,p_idempotency_key
  ) RETURNING * INTO v_milestone;

  v_event_type:=CASE p_metric
    WHEN 'human_response' THEN 'HumanAcknowledged'
    WHEN 'engineering_start' THEN 'EngineeringStarted'
    WHEN 'public_update' THEN 'PublicUpdateSent'
    ELSE 'ServiceVerifiedRestored' END;

  UPDATE private.fm1_tickets SET revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,v_event_type,v_occurred,p_channel,p_idempotency_key,
    jsonb_build_object('metric',p_metric,'qualifies',v_qualifies,'review_state',v_review,
      'evidence',btrim(p_evidence),'client_operator',nullif(btrim(coalesce(p_client_operator,'')),''),
      'occurred_at',v_occurred,'recorded_at',v_now),p_idempotency_key
  );

  SELECT * INTO v_obligation FROM private.fm1_obligations
  WHERE ticket_id=p_ticket_id AND metric=p_metric
    AND status IN ('running','paused_where_permitted')
  ORDER BY sequence DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND v_qualifies THEN
    IF v_obligation.due_at IS NOT NULL AND v_occurred<=v_obligation.due_at
       AND v_obligation.status<>'breached' THEN
      UPDATE private.fm1_obligations SET status='met',met_at=v_occurred,
        completed_at=v_occurred,last_evaluated_at=v_now,updated_at=v_now
      WHERE id=v_obligation.id RETURNING * INTO v_obligation;
    ELSIF v_obligation.due_at IS NOT NULL AND v_occurred>v_obligation.due_at
       AND v_obligation.status<>'breached' THEN
      UPDATE private.fm1_obligations SET status='breached',breached_at=v_obligation.due_at,
        completed_at=v_occurred,last_evaluated_at=v_now,updated_at=v_now
      WHERE id=v_obligation.id RETURNING * INTO v_obligation;
      PERFORM private.fm1_append_audit_event(
        p_ticket_id,p_workspace_id,v_actor,'SlaObligationBreached',v_obligation.due_at,
        jsonb_build_object('obligation_id',v_obligation.id,'metric',p_metric,
          'completed_late_at',v_occurred,'due_at',v_obligation.due_at),p_idempotency_key
      );
      INSERT INTO private.fm1_notification_outbox(
        ticket_id,obligation_id,event_type,delivery_key,recipient_scope,payload,delivery_state
      ) VALUES (
        p_ticket_id,v_obligation.id,'SlaObligationBreached','breach:'||v_obligation.id::text,
        'internal',jsonb_build_object('ticket_id',p_ticket_id,'obligation_id',v_obligation.id,
          'metric',p_metric,'due_at',v_obligation.due_at,'completed_late_at',v_occurred),
        'pending_configuration'
      ) ON CONFLICT(delivery_key) DO NOTHING;
    ELSE
      UPDATE private.fm1_obligations SET completed_at=v_occurred,
        last_evaluated_at=v_now,updated_at=v_now
      WHERE id=v_obligation.id RETURNING * INTO v_obligation;
    END IF;
  END IF;

  IF p_metric='public_update' AND v_qualifies AND private.fm1_decision_approved('D02') THEN
    SELECT target_seconds,clock_mode,decision_key
      INTO v_target,v_mode,v_decision
    FROM private.fm1_target(v_ticket.priority_effective,'public_update');
    SELECT calendar_version_id INTO v_calendar FROM private.fm1_service_config
    WHERE service_key=v_ticket.service_key;
    v_due:=CASE WHEN v_mode='elapsed'
      THEN v_occurred+make_interval(secs=>v_target::double precision)
      ELSE private.fm1_support_deadline(v_occurred,v_target,v_calendar) END;
    SELECT coalesce(max(sequence),0)+1 INTO v_sequence FROM private.fm1_obligations
    WHERE ticket_id=p_ticket_id AND metric='public_update';
    INSERT INTO private.fm1_obligations(
      ticket_id,metric,sequence,priority,target_seconds,clock_mode,calendar_version_id,
      starts_at,proposed_due_at,due_at,status,decision_state
    ) VALUES (
      p_ticket_id,'public_update',v_sequence,v_ticket.priority_effective,v_target,v_mode,
      v_calendar,v_occurred,v_due,
      CASE WHEN private.fm1_service_ready() AND (v_mode='elapsed' OR v_due IS NOT NULL)
        THEN v_due ELSE NULL END,
      CASE WHEN private.fm1_service_ready() AND (v_mode='elapsed' OR v_due IS NOT NULL)
        THEN 'running' ELSE 'needs_review' END,
      CASE WHEN NOT private.fm1_service_ready() THEN 'pending_activation'
        WHEN v_mode='support' AND v_due IS NULL THEN 'pending_calendar' ELSE 'ready' END
    ) ON CONFLICT(ticket_id,metric,sequence) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'milestone',to_jsonb(v_milestone),
    'obligation',CASE WHEN v_obligation.id IS NULL THEN NULL ELSE to_jsonb(v_obligation) END,
    'ticket_revision',v_ticket.revision,'idempotent_replay',false
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_record_priority_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_requested_priority text,
  p_effective_priority text,p_confirmed_priority text,p_reason text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_existing private.fm1_priority_events%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
  v_previous_requested text;
  v_previous_effective text;
  v_sequence integer;
  v_event private.fm1_priority_events%ROWTYPE;
  v_metric text;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_requested_priority IS NULL OR p_requested_priority NOT IN ('P1','P2','P3','P4')
    OR p_effective_priority IS NULL OR p_effective_priority NOT IN ('P1','P2','P3','P4')
    OR (p_confirmed_priority IS NOT NULL AND p_confirmed_priority NOT IN ('P1','P2','P3','P4'))
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'FM1 priority event fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_existing FROM private.fm1_priority_events
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),
    'priority_event',to_jsonb(v_existing),'idempotent_replay',true); END IF;
  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;

  v_previous_requested:=v_ticket.priority_requested;
  v_previous_effective:=v_ticket.priority_effective;
  SELECT coalesce(max(sequence),0)+1 INTO v_sequence
  FROM private.fm1_priority_events WHERE ticket_id=p_ticket_id;
  INSERT INTO private.fm1_priority_events(
    ticket_id,sequence,requested_priority,effective_priority,confirmed_priority,
    reason,actor_id,changed_at,decision_state,idempotency_key
  ) VALUES (
    p_ticket_id,v_sequence,p_requested_priority,p_effective_priority,p_confirmed_priority,
    btrim(p_reason),v_actor,v_now,
    CASE WHEN private.fm1_decision_approved('D03') THEN 'confirmed' ELSE 'pending_d03' END,
    p_idempotency_key
  ) RETURNING * INTO v_event;

  UPDATE private.fm1_tickets SET priority_requested=p_requested_priority,
    priority_effective=p_effective_priority,
    sla_activation_state=CASE WHEN private.fm1_decision_approved('D03')
      THEN sla_activation_state ELSE 'NEEDS_REVIEW' END,
    revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'PriorityChanged',v_now,'crm',p_idempotency_key,
    jsonb_build_object('previous_requested',v_previous_requested,
      'previous_effective',v_previous_effective,'requested_priority',p_requested_priority,
      'effective_priority',p_effective_priority,'confirmed_priority',p_confirmed_priority,
      'reason',btrim(p_reason),'decision_state',v_event.decision_state),p_idempotency_key
  );

  IF private.fm1_decision_approved('D03') THEN
    FOR v_metric IN SELECT DISTINCT metric FROM private.fm1_obligations
      WHERE ticket_id=p_ticket_id AND status NOT IN ('met','breached','not_applicable')
    LOOP
      PERFORM private.fm1_recalculate_obligation_due(p_ticket_id,v_metric,v_now);
    END LOOP;
  ELSE
    UPDATE private.fm1_obligations SET priority=p_effective_priority,due_at=NULL,
      status='needs_review',decision_state='pending_d03',met_at=NULL,updated_at=v_now
    WHERE ticket_id=p_ticket_id AND status NOT IN ('met','breached','not_applicable');
  END IF;

  PERFORM private.fm1_append_audit_event(
    p_ticket_id,p_workspace_id,v_actor,'PriorityCalculationNeedsReview',v_now,
    jsonb_build_object('decision_key','D03','original_received_at',v_ticket.received_at,
      'calculation_state',CASE WHEN private.fm1_decision_approved('D03')
        THEN 'recalculated' ELSE 'preview_only' END),p_idempotency_key
  );
  RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'priority_event',to_jsonb(v_event),
    'sla_recalculation',CASE WHEN private.fm1_decision_approved('D03')
      THEN 'RECALCULATED' ELSE 'NEEDS_REVIEW_PENDING_D03' END);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_request_hold_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_metric text,p_reason text,p_external_owner text,
  p_required_action text,p_evidence text,p_expected_review_at timestamptz,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_hold private.fm1_holds%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_idempotency_key IS NULL
    OR p_metric IS NULL OR p_metric NOT IN ('engineering_start','restoration')
    OR p_reason IS NULL OR p_reason NOT IN ('missing_access','client_authorization','essential_evidence','site_action','spares','oem_response','agreed_shutdown')
    OR p_external_owner IS NULL OR char_length(btrim(p_external_owner)) NOT BETWEEN 2 AND 160
    OR p_required_action IS NULL OR char_length(btrim(p_required_action)) NOT BETWEEN 3 AND 1000
    OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000
    OR (p_expected_review_at IS NOT NULL AND p_expected_review_at<v_now) THEN
    RAISE EXCEPTION 'FM1 hold request fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_hold FROM private.fm1_holds
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('hold',to_jsonb(v_hold),'idempotent_replay',true); END IF;

  INSERT INTO private.fm1_holds(
    ticket_id,metric,reason,requested_at,starts_at,requested_by,external_owner,
    required_action,evidence,expected_review_at,idempotency_key
  ) VALUES (
    p_ticket_id,p_metric,p_reason,v_now,v_now,v_actor,btrim(p_external_owner),
    btrim(p_required_action),btrim(p_evidence),p_expected_review_at,p_idempotency_key
  ) RETURNING * INTO v_hold;

  UPDATE private.fm1_tickets SET revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;
  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'HoldRequested',v_now,'crm',p_idempotency_key,
    jsonb_build_object('hold_id',v_hold.id,'metric',p_metric,'reason',p_reason,
      'validation_state','pending'),p_idempotency_key
  );
  RETURN jsonb_build_object('hold',to_jsonb(v_hold),'ticket_revision',v_ticket.revision,
    'clock_effect','NONE_PENDING_VALIDATION');
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_validate_hold_impl(
  p_workspace_id uuid,p_hold_id uuid,p_decision text,p_evidence text,
  p_remote_and_guided_diagnosis_blocked boolean,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_hold private.fm1_holds%ROWTYPE;
  v_ticket private.fm1_tickets%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
  v_decision text:=p_decision;
  v_existing private.fm1_ticket_events%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR p_decision IS NULL OR p_decision NOT IN ('validated','rejected')
    OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 8 AND 4000 THEN
    RAISE EXCEPTION 'FM1 hold validation fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT h.* INTO v_hold FROM private.fm1_holds h
  JOIN private.fm1_tickets t ON t.id=h.ticket_id
  WHERE h.id=p_hold_id AND t.workspace_id=p_workspace_id FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 hold was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_existing FROM private.fm1_ticket_events
  WHERE ticket_id=v_hold.ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('hold',to_jsonb(v_hold),'idempotent_replay',true); END IF;
  IF v_hold.validation_state<>'pending' THEN
    RAISE EXCEPTION 'FM1 hold has already been reviewed' USING ERRCODE='40001';
  END IF;
  IF v_hold.metric='engineering_start' AND NOT coalesce(p_remote_and_guided_diagnosis_blocked,false) THEN
    v_decision:='rejected';
  END IF;
  UPDATE private.fm1_holds SET validation_state=v_decision,
    validated_by=v_actor,validated_at=v_now,
    remote_and_guided_diagnosis_blocked=coalesce(p_remote_and_guided_diagnosis_blocked,false),
    evidence=evidence||E'\nValidation: '||btrim(p_evidence)
  WHERE id=p_hold_id RETURNING * INTO v_hold;

  UPDATE private.fm1_tickets SET revision=revision+1,updated_at=v_now
  WHERE id=v_hold.ticket_id RETURNING * INTO v_ticket;
  IF v_decision='validated' THEN
    UPDATE private.fm1_obligations SET status='paused_where_permitted',updated_at=v_now
    WHERE ticket_id=v_hold.ticket_id AND metric=v_hold.metric AND status='running';
  END IF;
  PERFORM private.fm1_append_ticket_event(
    v_hold.ticket_id,p_workspace_id,v_actor,
    CASE WHEN v_decision='validated' THEN 'HoldValidated' ELSE 'HoldRejected' END,
    v_now,'crm',p_idempotency_key,
    jsonb_build_object('hold_id',v_hold.id,'metric',v_hold.metric,
      'validation_state',v_decision,
      'remote_and_guided_diagnosis_blocked',v_hold.remote_and_guided_diagnosis_blocked,
      'validation_evidence',btrim(p_evidence)),p_idempotency_key
  );
  RETURN jsonb_build_object('hold',to_jsonb(v_hold),'ticket_revision',v_ticket.revision);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_end_hold_impl(
  p_workspace_id uuid,p_hold_id uuid,p_end_reason text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_hold private.fm1_holds%ROWTYPE;
  v_ticket private.fm1_tickets%ROWTYPE;
  v_existing private.fm1_ticket_events%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_idempotency_key IS NULL OR p_end_reason IS NULL
    OR char_length(btrim(p_end_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'FM1 hold end fields are invalid' USING ERRCODE='22023';
  END IF;
  SELECT h.* INTO v_hold FROM private.fm1_holds h
  JOIN private.fm1_tickets t ON t.id=h.ticket_id
  WHERE h.id=p_hold_id AND t.workspace_id=p_workspace_id FOR UPDATE OF h;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 hold was not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_existing FROM private.fm1_ticket_events
  WHERE ticket_id=v_hold.ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('hold',to_jsonb(v_hold),'idempotent_replay',true); END IF;
  IF v_hold.validation_state<>'validated' THEN
    RAISE EXCEPTION 'Only a validated FM1 hold can be ended' USING ERRCODE='40001';
  END IF;
  UPDATE private.fm1_holds SET validation_state='ended',resumed_at=v_now,
    ended_by=v_actor,end_reason=btrim(p_end_reason)
  WHERE id=p_hold_id RETURNING * INTO v_hold;
  UPDATE private.fm1_tickets SET revision=revision+1,updated_at=v_now
  WHERE id=v_hold.ticket_id RETURNING * INTO v_ticket;
  PERFORM private.fm1_recalculate_obligation_due(v_hold.ticket_id,v_hold.metric,v_now);
  PERFORM private.fm1_append_ticket_event(
    v_hold.ticket_id,p_workspace_id,v_actor,'HoldEnded',v_now,'crm',p_idempotency_key,
    jsonb_build_object('hold_id',v_hold.id,'metric',v_hold.metric,
      'resumed_at',v_now,'end_reason',v_hold.end_reason),p_idempotency_key
  );
  RETURN jsonb_build_object('hold',to_jsonb(v_hold),'ticket_revision',v_ticket.revision);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_activate_pending_obligations(p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_ticket record;
  v_metric text;
  v_activated integer:=0;
  v_active_count integer;
  v_pending_before integer;
  v_pending_after integer;
  v_next_activation_state text;
BEGIN
  IF NOT private.fm1_activate_service_if_ready(p_now) THEN RETURN 0; END IF;
  FOR v_ticket IN
    SELECT t.id,t.workspace_id,t.received_at,t.ticket_number,t.sla_activation_state
    FROM private.fm1_tickets t
    WHERE t.received_at < (SELECT c.term_end_exclusive FROM private.fm1_service_config c
      WHERE c.service_key=t.service_key)
      AND t.received_at >= (SELECT c.term_start FROM private.fm1_service_config c
      WHERE c.service_key=t.service_key)
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')
      AND (
        t.sla_activation_state IN ('NOT_ACTIVE','PENDING_READINESS')
        OR EXISTS (SELECT 1 FROM private.fm1_obligations pending
          WHERE pending.ticket_id=t.id
            AND (
              pending.decision_state IN ('pending_activation','pending_calendar','needs_review')
              OR (pending.decision_state='pending_d02' AND private.fm1_decision_approved('D02'))
              OR (pending.decision_state='pending_d03' AND private.fm1_decision_approved('D03'))
            ))
      )
    ORDER BY t.received_at,t.id
    FOR UPDATE SKIP LOCKED
    LIMIT 100
  LOOP
    SELECT count(*) INTO v_pending_before FROM private.fm1_obligations o
    WHERE o.ticket_id=v_ticket.id
      AND o.decision_state IN ('pending_activation','pending_calendar','pending_d02','pending_d03','needs_review');
    FOR v_metric IN
      SELECT DISTINCT o.metric FROM private.fm1_obligations o
      WHERE o.ticket_id=v_ticket.id
        AND o.status NOT IN ('met','breached','not_applicable')
        AND (o.decision_state<>'ready' OR o.due_at IS NULL)
    LOOP
      PERFORM private.fm1_recalculate_obligation_due(v_ticket.id,v_metric,p_now);
    END LOOP;
    SELECT count(*) INTO v_active_count FROM private.fm1_obligations o
    WHERE o.ticket_id=v_ticket.id AND o.status IN ('running','paused_where_permitted');
    SELECT count(*) INTO v_pending_after FROM private.fm1_obligations o
    WHERE o.ticket_id=v_ticket.id
      AND o.decision_state IN ('pending_activation','pending_calendar','pending_d02','pending_d03','needs_review');
    v_next_activation_state:=CASE WHEN v_active_count>0 THEN 'ACTIVE' ELSE 'NEEDS_REVIEW' END;
    UPDATE private.fm1_tickets SET
      sla_activation_state=v_next_activation_state,
      updated_at=CASE WHEN sla_activation_state IS DISTINCT FROM v_next_activation_state
        OR v_pending_after<v_pending_before THEN p_now ELSE updated_at END,
      revision=revision+CASE WHEN sla_activation_state IS DISTINCT FROM v_next_activation_state
        OR v_pending_after<v_pending_before THEN 1 ELSE 0 END
    WHERE id=v_ticket.id;
    IF v_ticket.sla_activation_state IS DISTINCT FROM v_next_activation_state
       OR v_pending_after<v_pending_before THEN
      PERFORM private.fm1_append_audit_event(
        v_ticket.id,v_ticket.workspace_id,NULL,
        CASE WHEN v_active_count>0 THEN 'SlaObligationsActivated' ELSE 'SlaActivationNeedsReview' END,
        p_now,jsonb_build_object('ticket_number',v_ticket.ticket_number,
          'received_at',v_ticket.received_at,'activated_at',p_now,
          'active_obligations',v_active_count,'pending_obligations',v_pending_after),NULL
      );
    END IF;
    v_activated:=v_activated+1;
  END LOOP;
  RETURN v_activated;
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_process_due_obligations(p_now timestamptz DEFAULT clock_timestamp())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz:=coalesce(p_now,clock_timestamp());
  v_ready boolean:=false;
  v_obligation record;
  v_scanned integer:=0;
  v_breached integer:=0;
  v_run_id uuid;
BEGIN
  v_ready:=private.fm1_activate_service_if_ready(v_now);
  INSERT INTO private.fm1_worker_runs(worker_name,started_at,skipped_reason)
  VALUES('fm1-sla-deadline-processor',v_now,
    CASE WHEN NOT v_ready THEN 'contract_or_readiness_not_active_or_outside_term' ELSE NULL END)
  RETURNING id INTO v_run_id;
  IF NOT v_ready THEN
    UPDATE private.fm1_worker_runs SET completed_at=clock_timestamp() WHERE id=v_run_id;
    RETURN jsonb_build_object('status','SKIPPED','reason','CONTRACT_OR_READINESS_NOT_ACTIVE',
      'scanned',0,'breached',0,'run_id',v_run_id);
  END IF;

  PERFORM private.fm1_activate_pending_obligations(v_now);
  FOR v_obligation IN
    SELECT o.id,o.ticket_id,o.metric,o.due_at,t.workspace_id,t.ticket_number
    FROM private.fm1_obligations o
    JOIN private.fm1_tickets t ON t.id=o.ticket_id
    WHERE o.status='running' AND o.due_at IS NOT NULL AND o.due_at<=v_now
    ORDER BY o.due_at,o.id
    FOR UPDATE OF o,t SKIP LOCKED
    LIMIT 100
  LOOP
    v_scanned:=v_scanned+1;
    UPDATE private.fm1_obligations SET status='breached',breached_at=v_obligation.due_at,
      last_evaluated_at=v_now,updated_at=v_now
    WHERE id=v_obligation.id AND status='running';
    IF FOUND THEN
      v_breached:=v_breached+1;
      PERFORM private.fm1_append_audit_event(
        v_obligation.ticket_id,v_obligation.workspace_id,NULL,'SlaObligationBreached',
        v_obligation.due_at,jsonb_build_object(
          'obligation_id',v_obligation.id,'metric',v_obligation.metric,
          'ticket_number',v_obligation.ticket_number,'due_at',v_obligation.due_at,
          'evaluated_at',v_now,'worker_run_id',v_run_id
        ),v_run_id
      );
      INSERT INTO private.fm1_notification_outbox(
        ticket_id,obligation_id,event_type,delivery_key,recipient_scope,payload,delivery_state
      ) VALUES (
        v_obligation.ticket_id,v_obligation.id,'SlaObligationBreached',
        'breach:'||v_obligation.id::text,'internal',
        jsonb_build_object('ticket_id',v_obligation.ticket_id,'ticket_number',v_obligation.ticket_number,
          'obligation_id',v_obligation.id,'metric',v_obligation.metric,
          'due_at',v_obligation.due_at,'evaluated_at',v_now),'pending_configuration'
      ) ON CONFLICT(delivery_key) DO NOTHING;
    END IF;
  END LOOP;
  UPDATE private.fm1_worker_runs SET completed_at=clock_timestamp(),
    scanned_count=v_scanned,breached_count=v_breached WHERE id=v_run_id;
  RETURN jsonb_build_object('status','COMPLETED','run_id',v_run_id,
    'scanned',v_scanned,'breached',v_breached);
END
$function$;

-- Public PostgREST wrappers are invoker-security and reuse the CRM session/workspace.
CREATE OR REPLACE FUNCTION public.fm1_service_status_v1(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$ SELECT private.fm1_service_status_impl(p_workspace_id) $function$;

CREATE OR REPLACE FUNCTION public.fm1_create_ticket_v1(
  p_workspace_id uuid,p_idempotency_key uuid,p_requester_name text,p_callback_number text,
  p_subject text,p_description text,p_priority text,p_production_impact text,
  p_production_stopped boolean,p_safety_concern boolean,p_channel text,
  p_asset_reference text DEFAULT NULL,p_reported_occurred_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_create_ticket_impl(p_workspace_id,p_idempotency_key,p_requester_name,
    p_callback_number,p_subject,p_description,p_priority,p_production_impact,
    p_production_stopped,p_safety_concern,p_channel,p_asset_reference,p_reported_occurred_at)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_list_tickets_v1(
  p_workspace_id uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,p_status text DEFAULT NULL,p_priority text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$ SELECT private.fm1_list_tickets_impl(p_workspace_id,p_limit,p_offset,p_search,p_status,p_priority) $function$;

CREATE OR REPLACE FUNCTION public.fm1_ticket_detail_v1(p_workspace_id uuid,p_ticket_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$ SELECT private.fm1_ticket_detail_impl(p_workspace_id,p_ticket_id) $function$;

CREATE OR REPLACE FUNCTION public.fm1_transition_ticket_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_next_status text,
  p_reason text,p_idempotency_key uuid,p_client_operator text DEFAULT NULL,p_evidence text DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_transition_ticket_impl(p_workspace_id,p_ticket_id,p_expected_revision,
    p_next_status,p_reason,p_idempotency_key,p_client_operator,p_evidence)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_record_milestone_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_metric text,
  p_channel text,p_evidence text,p_idempotency_key uuid,p_human_confirmed boolean DEFAULT false,
  p_client_operator text DEFAULT NULL,p_occurred_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_record_milestone_impl(p_workspace_id,p_ticket_id,p_expected_revision,
    p_metric,p_channel,p_evidence,p_idempotency_key,p_human_confirmed,p_client_operator,p_occurred_at)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_record_priority_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,p_requested_priority text,
  p_effective_priority text,p_confirmed_priority text,p_reason text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_record_priority_impl(p_workspace_id,p_ticket_id,p_expected_revision,
    p_requested_priority,p_effective_priority,p_confirmed_priority,p_reason,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_request_hold_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_metric text,p_reason text,p_external_owner text,
  p_required_action text,p_evidence text,p_expected_review_at timestamptz DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_request_hold_impl(p_workspace_id,p_ticket_id,p_metric,p_reason,
    p_external_owner,p_required_action,p_evidence,p_expected_review_at,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_validate_hold_v1(
  p_workspace_id uuid,p_hold_id uuid,p_decision text,p_evidence text,
  p_remote_and_guided_diagnosis_blocked boolean DEFAULT false,p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_validate_hold_impl(p_workspace_id,p_hold_id,p_decision,p_evidence,
    p_remote_and_guided_diagnosis_blocked,p_idempotency_key)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_end_hold_v1(
  p_workspace_id uuid,p_hold_id uuid,p_end_reason text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_end_hold_impl(p_workspace_id,p_hold_id,p_end_reason,p_idempotency_key)
$function$;

REVOKE ALL ON FUNCTION private.fm1_assert_workspace(uuid),
  private.fm1_decision_approved(text),private.fm1_service_ready(),
  private.fm1_append_audit_event(uuid,uuid,uuid,text,timestamptz,jsonb,uuid),
  private.fm1_append_ticket_event(uuid,uuid,uuid,text,timestamptz,text,uuid,jsonb,uuid),
  private.fm1_next_ticket_number(timestamptz),private.fm1_create_obligations(private.fm1_tickets),
  private.fm1_recalculate_obligation_due(uuid,text,timestamptz),
  private.fm1_service_status_impl(uuid),
  private.fm1_activate_service_if_ready(timestamptz),
  private.fm1_activate_pending_obligations(timestamptz),
  private.fm1_create_ticket_impl(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz),
  private.fm1_list_tickets_impl(uuid,integer,integer,text,text,text),
  private.fm1_ticket_detail_impl(uuid,uuid),
  private.fm1_transition_ticket_impl(uuid,uuid,bigint,text,text,uuid,text,text),
  private.fm1_record_milestone_impl(uuid,uuid,bigint,text,text,text,uuid,boolean,text,timestamptz),
  private.fm1_record_priority_impl(uuid,uuid,bigint,text,text,text,text,uuid),
  private.fm1_request_hold_impl(uuid,uuid,text,text,text,text,text,timestamptz,uuid),
  private.fm1_validate_hold_impl(uuid,uuid,text,text,boolean,uuid),
  private.fm1_end_hold_impl(uuid,uuid,text,uuid)
FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION
  private.fm1_service_status_impl(uuid),
  private.fm1_create_ticket_impl(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz),
  private.fm1_list_tickets_impl(uuid,integer,integer,text,text,text),
  private.fm1_ticket_detail_impl(uuid,uuid),
  private.fm1_transition_ticket_impl(uuid,uuid,bigint,text,text,uuid,text,text),
  private.fm1_record_milestone_impl(uuid,uuid,bigint,text,text,text,uuid,boolean,text,timestamptz),
  private.fm1_record_priority_impl(uuid,uuid,bigint,text,text,text,text,uuid),
  private.fm1_request_hold_impl(uuid,uuid,text,text,text,text,text,timestamptz,uuid),
  private.fm1_validate_hold_impl(uuid,uuid,text,text,boolean,uuid),
  private.fm1_end_hold_impl(uuid,uuid,text,uuid)
TO authenticated;

REVOKE ALL ON FUNCTION private.fm1_activate_service_if_ready(timestamptz),
  private.fm1_activate_pending_obligations(timestamptz),
  private.fm1_process_due_obligations(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.fm1_process_due_obligations(timestamptz) TO postgres;

REVOKE ALL ON FUNCTION
  public.fm1_service_status_v1(uuid),
  public.fm1_create_ticket_v1(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz),
  public.fm1_list_tickets_v1(uuid,integer,integer,text,text,text),
  public.fm1_ticket_detail_v1(uuid,uuid),
  public.fm1_transition_ticket_v1(uuid,uuid,bigint,text,text,uuid,text,text),
  public.fm1_record_milestone_v1(uuid,uuid,bigint,text,text,text,uuid,boolean,text,timestamptz),
  public.fm1_record_priority_v1(uuid,uuid,bigint,text,text,text,text,uuid),
  public.fm1_request_hold_v1(uuid,uuid,text,text,text,text,text,timestamptz,uuid),
  public.fm1_validate_hold_v1(uuid,uuid,text,text,boolean,uuid),
  public.fm1_end_hold_v1(uuid,uuid,text,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
  public.fm1_service_status_v1(uuid),
  public.fm1_create_ticket_v1(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz),
  public.fm1_list_tickets_v1(uuid,integer,integer,text,text,text),
  public.fm1_ticket_detail_v1(uuid,uuid),
  public.fm1_transition_ticket_v1(uuid,uuid,bigint,text,text,uuid,text,text),
  public.fm1_record_milestone_v1(uuid,uuid,bigint,text,text,text,uuid,boolean,text,timestamptz),
  public.fm1_record_priority_v1(uuid,uuid,bigint,text,text,text,text,uuid),
  public.fm1_request_hold_v1(uuid,uuid,text,text,text,text,text,timestamptz,uuid),
  public.fm1_validate_hold_v1(uuid,uuid,text,text,boolean,uuid),
  public.fm1_end_hold_v1(uuid,uuid,text,uuid)
TO authenticated;

DO $cron_setup$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';
  END IF;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA cron TO postgres;
      IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='fm1-sla-deadline-processor') THEN
      PERFORM cron.schedule('fm1-sla-deadline-processor','30 seconds',
        'select private.fm1_process_due_obligations();');
    END IF;
    IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='fm1-cron-history-cleanup') THEN
      PERFORM cron.schedule('fm1-cron-history-cleanup','0 2 * * *',
        $command$delete from cron.job_run_details
          where jobid in (select jobid from cron.job
            where jobname in ('fm1-sla-deadline-processor','fm1-cron-history-cleanup'))
            and end_time < now()-interval '7 days';$command$);
    END IF;
  END IF;
END
$cron_setup$;

DO $postflight$
BEGIN
  IF NOT has_function_privilege('authenticated',
      'public.fm1_create_ticket_v1(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz)','EXECUTE')
     OR has_function_privilege('anon',
      'public.fm1_create_ticket_v1(uuid,uuid,text,text,text,text,text,text,boolean,boolean,text,text,timestamptz)','EXECUTE')
     OR to_regclass('private.fm1_tickets') IS NULL
     OR to_regclass('private.fm1_obligations') IS NULL
     OR to_regclass('private.fm1_audit_events') IS NULL
     OR to_regclass('private.fm1_notification_outbox') IS NULL THEN
    RAISE EXCEPTION 'CP-FM1-CORE-02 postflight checks failed' USING ERRCODE='55000';
  END IF;
END
$postflight$;
COMMIT;
