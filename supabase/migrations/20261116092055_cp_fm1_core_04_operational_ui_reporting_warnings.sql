-- CP-FM1-CORE-04 — revision-safe incident editing, operational reporting and configurable SLA warnings.
-- Additive to CP-FM1-CORE-02/03. Warning policies default disabled and thresholds remain unset.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('private.fm1_tickets') IS NULL
     OR to_regclass('private.fm1_ticket_events') IS NULL
     OR to_regclass('private.fm1_audit_events') IS NULL
     OR to_regclass('private.fm1_obligations') IS NULL
     OR to_regclass('private.fm1_notification_outbox') IS NULL
     OR to_regclass('private.fm1_notifications') IS NULL
     OR to_regclass('private.fm1_worker_runs') IS NULL
     OR to_regprocedure('private.fm1_assert_workspace(uuid)') IS NULL
     OR to_regprocedure('private.fm1_append_ticket_event(uuid,uuid,uuid,text,timestamptz,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('private.fm1_append_audit_event(uuid,uuid,uuid,text,timestamptz,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'CP-FM1-CORE-04 prerequisites are not installed'
      USING ERRCODE='55000';
  END IF;
END
$preflight$;

ALTER TABLE private.fm1_worker_runs
  ADD COLUMN IF NOT EXISTS warning_count integer NOT NULL DEFAULT 0
  CHECK (warning_count >= 0);

CREATE TABLE IF NOT EXISTS private.fm1_deadline_warning_policies (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  human_response_before_seconds bigint,
  engineering_start_before_seconds bigint,
  restoration_before_seconds bigint,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (human_response_before_seconds IS NULL OR human_response_before_seconds BETWEEN 60 AND 2592000),
  CHECK (engineering_start_before_seconds IS NULL OR engineering_start_before_seconds BETWEEN 60 AND 2592000),
  CHECK (restoration_before_seconds IS NULL OR restoration_before_seconds BETWEEN 60 AND 2592000),
  CHECK (NOT enabled OR num_nonnulls(
    human_response_before_seconds,
    engineering_start_before_seconds,
    restoration_before_seconds
  ) > 0)
);

CREATE TABLE IF NOT EXISTS private.fm1_deadline_warning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  obligation_id uuid NOT NULL UNIQUE REFERENCES private.fm1_obligations(id) ON DELETE RESTRICT,
  metric text NOT NULL CHECK (metric IN ('human_response','engineering_start','restoration')),
  due_at timestamptz NOT NULL,
  threshold_seconds bigint NOT NULL CHECK (threshold_seconds BETWEEN 60 AND 2592000),
  detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notification_outbox_id uuid REFERENCES private.fm1_notification_outbox(id) ON DELETE RESTRICT
);

ALTER TABLE private.fm1_deadline_warning_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fm1_deadline_warning_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fm1_deadline_warning_events_workspace_detected_idx
  ON private.fm1_deadline_warning_events(workspace_id,detected_at DESC,id);
CREATE INDEX IF NOT EXISTS fm1_deadline_warning_events_obligation_idx
  ON private.fm1_deadline_warning_events(obligation_id,detected_at DESC);
CREATE INDEX IF NOT EXISTS fm1_obligations_warning_due_idx
  ON private.fm1_obligations(status,due_at,metric)
  WHERE status='running' AND due_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.fm1_update_ticket_impl(
  p_workspace_id uuid,
  p_ticket_id uuid,
  p_expected_revision bigint,
  p_requester_name text,
  p_callback_number text,
  p_subject text,
  p_description text,
  p_production_impact text,
  p_production_stopped boolean,
  p_safety_concern boolean,
  p_asset_reference text,
  p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_existing private.fm1_ticket_events%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision<1 OR p_idempotency_key IS NULL
     OR p_requester_name IS NULL OR char_length(btrim(p_requester_name)) NOT BETWEEN 2 AND 120
     OR p_callback_number IS NULL OR char_length(btrim(p_callback_number)) NOT BETWEEN 7 AND 32
     OR p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 4 AND 160
     OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 4000
     OR p_production_impact IS NULL OR p_production_impact NOT IN ('critical','degraded','no-impact')
     OR p_production_stopped IS NULL OR p_safety_concern IS NULL
     OR (p_asset_reference IS NOT NULL AND char_length(btrim(p_asset_reference))>160) THEN
    RAISE EXCEPTION 'FM1 incident details are invalid' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;

  v_after:=jsonb_build_object(
    'requester_name',btrim(p_requester_name),
    'callback_number',btrim(p_callback_number),
    'subject',btrim(p_subject),
    'description',btrim(p_description),
    'production_impact',p_production_impact,
    'production_stopped',p_production_stopped,
    'safety_concern',p_safety_concern,
    'asset_reference',nullif(btrim(coalesce(p_asset_reference,'')),'')
  );

  SELECT * INTO v_existing FROM private.fm1_ticket_events
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.event_type<>'IncidentDetailsUpdated'
       OR v_existing.payload->'after' IS DISTINCT FROM v_after THEN
      RAISE EXCEPTION 'FM1 idempotency key was already used for a different operation'
        USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'ticket',to_jsonb(v_ticket),
      'idempotent_replay',true,
      'changed',false
    );
  END IF;

  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;

  v_before:=jsonb_build_object(
    'requester_name',v_ticket.requester_name,
    'callback_number',v_ticket.callback_number,
    'subject',v_ticket.subject,
    'description',v_ticket.description,
    'production_impact',v_ticket.production_impact,
    'production_stopped',v_ticket.production_stopped,
    'safety_concern',v_ticket.safety_concern,
    'asset_reference',v_ticket.asset_reference
  );

  IF v_before IS NOT DISTINCT FROM v_after THEN
    RETURN jsonb_build_object(
      'ticket',to_jsonb(v_ticket),
      'idempotent_replay',false,
      'changed',false
    );
  END IF;

  UPDATE private.fm1_tickets SET
    requester_name=v_after->>'requester_name',
    callback_number=v_after->>'callback_number',
    subject=v_after->>'subject',
    description=v_after->>'description',
    production_impact=v_after->>'production_impact',
    production_stopped=(v_after->>'production_stopped')::boolean,
    safety_concern=(v_after->>'safety_concern')::boolean,
    asset_reference=v_after->>'asset_reference',
    revision=revision+1,
    updated_at=v_now
  WHERE id=p_ticket_id
  RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'IncidentDetailsUpdated',v_now,'crm',p_idempotency_key,
    jsonb_build_object(
      'before',v_before,
      'after',v_after,
      'changed_fields',(
        SELECT coalesce(jsonb_agg(k ORDER BY k),'[]'::jsonb)
        FROM jsonb_object_keys(v_after) AS keys(k)
        WHERE v_before->k IS DISTINCT FROM v_after->k
      )
    ),p_idempotency_key
  );

  RETURN jsonb_build_object(
    'ticket',to_jsonb(v_ticket),
    'idempotent_replay',false,
    'changed',true
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_deadline_warning_policy_impl(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_policy private.fm1_deadline_warning_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_policy FROM private.fm1_deadline_warning_policies
  WHERE workspace_id=p_workspace_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'workspace_id',p_workspace_id,
      'enabled',false,
      'human_response_before_seconds',NULL,
      'engineering_start_before_seconds',NULL,
      'restoration_before_seconds',NULL,
      'revision',0,
      'updated_at',NULL,
      'policy_state','NOT_CONFIGURED'
    );
  END IF;
  RETURN to_jsonb(v_policy)||jsonb_build_object(
    'policy_state',CASE WHEN v_policy.enabled THEN 'ACTIVE' ELSE 'INACTIVE' END
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_update_deadline_warning_policy_impl(
  p_workspace_id uuid,
  p_enabled boolean,
  p_human_response_before_seconds bigint,
  p_engineering_start_before_seconds bigint,
  p_restoration_before_seconds bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_policy private.fm1_deadline_warning_policies%ROWTYPE;
BEGIN
  IF p_enabled IS NULL
     OR (p_human_response_before_seconds IS NOT NULL AND p_human_response_before_seconds NOT BETWEEN 60 AND 2592000)
     OR (p_engineering_start_before_seconds IS NOT NULL AND p_engineering_start_before_seconds NOT BETWEEN 60 AND 2592000)
     OR (p_restoration_before_seconds IS NOT NULL AND p_restoration_before_seconds NOT BETWEEN 60 AND 2592000)
     OR (p_enabled AND num_nonnulls(
       p_human_response_before_seconds,
       p_engineering_start_before_seconds,
       p_restoration_before_seconds
     )=0) THEN
    RAISE EXCEPTION 'FM1 warning policy requires valid per-metric thresholds before activation'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO private.fm1_deadline_warning_policies(
    workspace_id,enabled,human_response_before_seconds,
    engineering_start_before_seconds,restoration_before_seconds,
    revision,updated_by,updated_at
  ) VALUES (
    p_workspace_id,p_enabled,p_human_response_before_seconds,
    p_engineering_start_before_seconds,p_restoration_before_seconds,
    1,v_actor,clock_timestamp()
  )
  ON CONFLICT(workspace_id) DO UPDATE SET
    enabled=EXCLUDED.enabled,
    human_response_before_seconds=EXCLUDED.human_response_before_seconds,
    engineering_start_before_seconds=EXCLUDED.engineering_start_before_seconds,
    restoration_before_seconds=EXCLUDED.restoration_before_seconds,
    revision=private.fm1_deadline_warning_policies.revision+1,
    updated_by=EXCLUDED.updated_by,
    updated_at=EXCLUDED.updated_at
  RETURNING * INTO v_policy;

  RETURN to_jsonb(v_policy)||jsonb_build_object(
    'policy_state',CASE WHEN v_policy.enabled THEN 'ACTIVE' ELSE 'INACTIVE' END
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_operational_report_impl(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_metrics jsonb;
  v_assignee_breakdown jsonb;
  v_unassigned_urgent jsonb;
  v_notification_delivery jsonb;
  v_current_assignments jsonb;
  v_sla_active_incidents jsonb;
  v_approaching_deadlines jsonb;
  v_breached_obligations jsonb;
  v_recent_escalations jsonb;
  v_recent_lifecycle_history jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_tickets',count(*),
    'open_tickets',count(*) FILTER (WHERE t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'closed_tickets',count(*) FILTER (WHERE t.status='Closed'),
    'cancelled_tickets',count(*) FILTER (WHERE t.status='Cancelled'),
    'p1p2_tickets',count(*) FILTER (WHERE t.priority_effective IN ('P1','P2')
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'unassigned_p1p2',count(*) FILTER (WHERE t.priority_effective IN ('P1','P2')
      AND t.assigned_to IS NULL AND t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'assigned_open_tickets',count(*) FILTER (WHERE t.assigned_to IS NOT NULL
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'sla_active_tickets',count(*) FILTER (WHERE t.sla_activation_state='ACTIVE'),
    'status_breakdown',(
      SELECT coalesce(jsonb_object_agg(q.status,q.total),'{}'::jsonb)
      FROM (SELECT x.status,count(*)::integer AS total
        FROM private.fm1_tickets x WHERE x.workspace_id=p_workspace_id GROUP BY x.status) q
    ),
    'priority_breakdown',(
      SELECT coalesce(jsonb_object_agg(q.priority,q.total),'{}'::jsonb)
      FROM (SELECT x.priority_effective AS priority,count(*)::integer AS total
        FROM private.fm1_tickets x WHERE x.workspace_id=p_workspace_id GROUP BY x.priority_effective) q
    ),
    'assignment_breakdown',(
      SELECT jsonb_build_object(
        'assigned',count(*) FILTER (WHERE x.assigned_to IS NOT NULL),
        'unassigned',count(*) FILTER (WHERE x.assigned_to IS NULL)
      ) FROM private.fm1_tickets x WHERE x.workspace_id=p_workspace_id
    ),
    'obligation_breakdown',(
      SELECT coalesce(jsonb_object_agg(q.status,q.total),'{}'::jsonb)
      FROM (SELECT o.status,count(*)::integer AS total
        FROM private.fm1_obligations o JOIN private.fm1_tickets x ON x.id=o.ticket_id
        WHERE x.workspace_id=p_workspace_id GROUP BY o.status) q
    ),
    'breached_obligations',(
      SELECT count(*) FROM private.fm1_obligations o
      JOIN private.fm1_tickets x ON x.id=o.ticket_id
      WHERE x.workspace_id=p_workspace_id AND o.status='breached'
    ),
    'milestone_breakdown',(
      SELECT coalesce(jsonb_object_agg(q.metric,q.total),'{}'::jsonb)
      FROM (SELECT m.metric,count(*)::integer AS total
        FROM private.fm1_milestones m JOIN private.fm1_tickets x ON x.id=m.ticket_id
        WHERE x.workspace_id=p_workspace_id GROUP BY m.metric) q
    ),
    'approaching_deadlines',(
      SELECT count(*) FROM private.fm1_deadline_warning_events w
      JOIN private.fm1_obligations o ON o.id=w.obligation_id
      WHERE w.workspace_id=p_workspace_id AND o.status='running' AND o.due_at>statement_timestamp()
    )
  ) INTO v_metrics
  FROM private.fm1_tickets t
  WHERE t.workspace_id=p_workspace_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'assignee_id',q.assigned_to,
    'assignee_name',q.assignee_name,
    'ticket_count',q.ticket_count
  ) ORDER BY q.ticket_count DESC,q.assignee_name),'[]'::jsonb)
  INTO v_assignee_breakdown
  FROM (
    SELECT t.assigned_to,
      coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'Unassigned') AS assignee_name,
      count(*)::integer AS ticket_count
    FROM private.fm1_tickets t
    LEFT JOIN public.profiles p ON p.id=t.assigned_to
    WHERE t.workspace_id=p_workspace_id
    GROUP BY t.assigned_to,p.display_name,p.email
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.priority_effective,q.received_at DESC,q.id),'[]'::jsonb)
  INTO v_unassigned_urgent
  FROM (
    SELECT t.id,t.ticket_number,t.subject,t.status,t.priority_effective,t.received_at
    FROM private.fm1_tickets t
    WHERE t.workspace_id=p_workspace_id AND t.assigned_to IS NULL
      AND t.priority_effective IN ('P1','P2')
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')
    ORDER BY t.priority_effective,t.received_at DESC,t.id
    LIMIT 50
  ) q;

  SELECT jsonb_build_object(
    'queued',count(*) FILTER (WHERE o.delivery_state='queued'),
    'failed',count(*) FILTER (WHERE o.delivery_state='failed'),
    'delivered',count(*) FILTER (WHERE o.delivery_state='delivered'),
    'pending_configuration',count(*) FILTER (WHERE o.delivery_state='pending_configuration'),
    'retrying',count(*) FILTER (WHERE o.delivery_state='failed' AND o.attempts>0)
  ) INTO v_notification_delivery
  FROM private.fm1_notification_outbox o
  JOIN private.fm1_tickets t ON t.id=o.ticket_id
  WHERE t.workspace_id=p_workspace_id;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.id),'[]'::jsonb)
  INTO v_current_assignments
  FROM (
    SELECT t.id,t.ticket_number,t.subject,t.status,t.priority_effective,t.assigned_to,
      coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'CRM member') AS assignee_name,
      t.received_at
    FROM private.fm1_tickets t
    LEFT JOIN public.profiles p ON p.id=t.assigned_to
    WHERE t.workspace_id=p_workspace_id AND t.assigned_to IS NOT NULL
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')
    ORDER BY t.received_at DESC,t.id
    LIMIT 50
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.id),'[]'::jsonb)
  INTO v_sla_active_incidents
  FROM (
    SELECT t.id,t.ticket_number,t.subject,t.status,t.priority_effective,t.assigned_to,t.received_at
    FROM private.fm1_tickets t
    WHERE t.workspace_id=p_workspace_id AND t.sla_activation_state='ACTIVE'
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')
    ORDER BY t.received_at DESC,t.id
    LIMIT 50
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.due_at,q.ticket_number),'[]'::jsonb)
  INTO v_approaching_deadlines
  FROM (
    SELECT w.id,w.ticket_id,w.obligation_id,w.metric,w.due_at,w.threshold_seconds,w.detected_at,
      t.ticket_number,t.subject,t.priority_effective,o.status AS obligation_status
    FROM private.fm1_deadline_warning_events w
    JOIN private.fm1_tickets t ON t.id=w.ticket_id
    JOIN private.fm1_obligations o ON o.id=w.obligation_id
    WHERE w.workspace_id=p_workspace_id AND o.status='running' AND o.due_at>statement_timestamp()
    ORDER BY o.due_at,t.ticket_number
    LIMIT 50
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.due_at,q.ticket_number),'[]'::jsonb)
  INTO v_breached_obligations
  FROM (
    SELECT o.id AS obligation_id,o.ticket_id,o.metric,o.priority,o.due_at,o.breached_at,
      t.ticket_number,t.subject,t.priority_effective,t.status
    FROM private.fm1_obligations o
    JOIN private.fm1_tickets t ON t.id=o.ticket_id
    WHERE t.workspace_id=p_workspace_id AND o.status='breached'
    ORDER BY o.breached_at DESC NULLS LAST,t.ticket_number
    LIMIT 50
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
  INTO v_recent_escalations
  FROM (
    SELECT o.id,o.ticket_id,o.event_type,o.delivery_key,o.delivery_state,o.attempts,
      o.last_attempt_at,o.delivered_at,o.last_error,o.created_at,
      t.ticket_number,t.subject,t.priority_effective
    FROM private.fm1_notification_outbox o
    JOIN private.fm1_tickets t ON t.id=o.ticket_id
    WHERE t.workspace_id=p_workspace_id
      AND o.event_type IN ('SlaObligationBreached','SlaDeadlineApproaching')
    ORDER BY o.created_at DESC,o.id DESC
    LIMIT 50
  ) q;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.recorded_at DESC,q.event_id DESC),'[]'::jsonb)
  INTO v_recent_lifecycle_history
  FROM (
    SELECT e.event_id,e.ticket_id,e.event_type,e.actor_id,e.occurred_at,e.recorded_at,e.payload,
      t.ticket_number,t.subject
    FROM private.fm1_ticket_events e
    JOIN private.fm1_tickets t ON t.id=e.ticket_id
    WHERE e.workspace_id=p_workspace_id
    ORDER BY e.recorded_at DESC,e.event_id DESC
    LIMIT 50
  ) q;

  RETURN jsonb_build_object(
    'metrics',v_metrics,
    'assignee_breakdown',v_assignee_breakdown,
    'unassigned_urgent',v_unassigned_urgent,
    'notification_delivery',v_notification_delivery,
    'current_assignments',v_current_assignments,
    'sla_active_incidents',v_sla_active_incidents,
    'approaching_deadlines',v_approaching_deadlines,
    'breached_obligations',v_breached_obligations,
    'recent_escalations',v_recent_escalations,
    'recent_lifecycle_history',v_recent_lifecycle_history
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_process_deadline_warnings(
  p_now timestamptz DEFAULT clock_timestamp(),
  p_limit integer DEFAULT 200
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz:=coalesce(p_now,clock_timestamp());
  v_item record;
  v_warning_id uuid;
  v_outbox_id uuid;
  v_scanned integer:=0;
  v_warned integer:=0;
  v_run_id uuid;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'FM1 warning worker batch limit is invalid' USING ERRCODE='22023';
  END IF;

  INSERT INTO private.fm1_worker_runs(worker_name,started_at,skipped_reason)
  VALUES('fm1-sla-approaching-warning-processor',v_now,NULL)
  RETURNING id INTO v_run_id;

  FOR v_item IN
    SELECT o.id AS obligation_id,o.ticket_id,o.metric,o.due_at,
      t.workspace_id,t.ticket_number,t.subject,t.priority_effective,
      CASE o.metric
        WHEN 'human_response' THEN p.human_response_before_seconds
        WHEN 'engineering_start' THEN p.engineering_start_before_seconds
        WHEN 'restoration' THEN p.restoration_before_seconds
      END AS threshold_seconds
    FROM private.fm1_obligations o
    JOIN private.fm1_tickets t ON t.id=o.ticket_id
    JOIN private.fm1_deadline_warning_policies p ON p.workspace_id=t.workspace_id
    WHERE p.enabled IS TRUE
      AND o.status='running'
      AND o.metric IN ('human_response','engineering_start','restoration')
      AND o.due_at IS NOT NULL
      AND o.due_at>v_now
      AND CASE o.metric
        WHEN 'human_response' THEN p.human_response_before_seconds
        WHEN 'engineering_start' THEN p.engineering_start_before_seconds
        WHEN 'restoration' THEN p.restoration_before_seconds
      END IS NOT NULL
      AND o.due_at<=v_now+make_interval(secs=>(
        CASE o.metric
          WHEN 'human_response' THEN p.human_response_before_seconds
          WHEN 'engineering_start' THEN p.engineering_start_before_seconds
          WHEN 'restoration' THEN p.restoration_before_seconds
        END
      )::double precision)
    ORDER BY o.due_at,o.id
    FOR UPDATE OF o SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_scanned:=v_scanned+1;
    v_warning_id:=NULL;
    v_outbox_id:=NULL;

    INSERT INTO private.fm1_deadline_warning_events(
      workspace_id,ticket_id,obligation_id,metric,due_at,threshold_seconds,detected_at
    ) VALUES (
      v_item.workspace_id,v_item.ticket_id,v_item.obligation_id,v_item.metric,
      v_item.due_at,v_item.threshold_seconds,v_now
    )
    ON CONFLICT(obligation_id) DO NOTHING
    RETURNING id INTO v_warning_id;

    IF v_warning_id IS NOT NULL THEN
      v_warned:=v_warned+1;
      PERFORM private.fm1_append_audit_event(
        v_item.ticket_id,v_item.workspace_id,NULL,'SlaDeadlineApproaching',v_now,
        jsonb_build_object(
          'warning_id',v_warning_id,
          'obligation_id',v_item.obligation_id,
          'metric',v_item.metric,
          'due_at',v_item.due_at,
          'threshold_seconds',v_item.threshold_seconds,
          'detected_at',v_now,
          'worker_run_id',v_run_id
        ),v_run_id
      );

      INSERT INTO private.fm1_notification_outbox(
        ticket_id,obligation_id,event_type,delivery_key,channel,recipient_scope,payload,
        delivery_state,available_at
      ) VALUES (
        v_item.ticket_id,v_item.obligation_id,'SlaDeadlineApproaching',
        'approach:'||v_item.obligation_id::text,'in_app','workspace',
        jsonb_build_object(
          'warning_id',v_warning_id,
          'ticket_number',v_item.ticket_number,
          'subject',v_item.subject,
          'priority',v_item.priority_effective,
          'metric',v_item.metric,
          'due_at',v_item.due_at,
          'threshold_seconds',v_item.threshold_seconds
        ),'queued',v_now
      )
      ON CONFLICT(delivery_key) DO NOTHING
      RETURNING id INTO v_outbox_id;

      IF v_outbox_id IS NULL THEN
        SELECT id INTO v_outbox_id FROM private.fm1_notification_outbox
        WHERE delivery_key='approach:'||v_item.obligation_id::text;
      END IF;

      UPDATE private.fm1_deadline_warning_events
      SET notification_outbox_id=v_outbox_id
      WHERE id=v_warning_id;
    END IF;
  END LOOP;

  UPDATE private.fm1_worker_runs SET
    completed_at=clock_timestamp(),
    scanned_count=v_scanned,
    warning_count=v_warned
  WHERE id=v_run_id;

  RETURN jsonb_build_object(
    'status','COMPLETED',
    'run_id',v_run_id,
    'scanned',v_scanned,
    'warnings_created',v_warned,
    'batch_limit',p_limit
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_format_deadline_warning_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_event_type text;
  v_payload jsonb;
  v_metric text;
  v_due_at timestamptz;
BEGIN
  SELECT o.event_type,o.payload INTO v_event_type,v_payload
  FROM private.fm1_notification_outbox o WHERE o.id=NEW.outbox_id;
  IF v_event_type='SlaDeadlineApproaching' THEN
    v_metric:=coalesce(v_payload->>'metric','SLA');
    v_due_at:=nullif(v_payload->>'due_at','')::timestamptz;
    NEW.title:='SLA deadline approaching';
    NEW.message:='The '||replace(v_metric,'_',' ')||
      ' deadline for this incident is approaching. Due: '||
      coalesce(to_char(v_due_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI'),'time unavailable')||
      ' Asia/Manila.';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS fm1_deadline_warning_notification_message ON private.fm1_notifications;
CREATE TRIGGER fm1_deadline_warning_notification_message
BEFORE INSERT ON private.fm1_notifications
FOR EACH ROW EXECUTE FUNCTION private.fm1_format_deadline_warning_notification();

CREATE OR REPLACE FUNCTION private.fm1_approaching_deadline_count_impl(p_workspace_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM private.fm1_deadline_warning_events w
  JOIN private.fm1_obligations o ON o.id=w.obligation_id
  WHERE w.workspace_id=p_workspace_id AND o.status='running' AND o.due_at>statement_timestamp();
  RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION public.fm1_service_status_v1(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $function$
DECLARE
  v_status jsonb;
  v_policy jsonb;
  v_approaching bigint;
BEGIN
  v_status:=private.fm1_service_status_impl(p_workspace_id);
  v_policy:=private.fm1_deadline_warning_policy_impl(p_workspace_id);
  v_approaching:=private.fm1_approaching_deadline_count_impl(p_workspace_id);
  v_status:=jsonb_set(v_status,'{metrics,approaching_deadline_policy}',
    to_jsonb(v_policy->>'policy_state'),true);
  v_status:=jsonb_set(v_status,'{metrics,approaching_deadlines}',
    to_jsonb(v_approaching),true);
  RETURN v_status;
END
$function$;

CREATE OR REPLACE FUNCTION public.fm1_update_ticket_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,
  p_requester_name text,p_callback_number text,p_subject text,p_description text,
  p_production_impact text,p_production_stopped boolean,p_safety_concern boolean,
  p_asset_reference text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_update_ticket_impl(
    p_workspace_id,p_ticket_id,p_expected_revision,p_requester_name,p_callback_number,
    p_subject,p_description,p_production_impact,p_production_stopped,p_safety_concern,
    p_asset_reference,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.fm1_deadline_warning_policy_v1(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_deadline_warning_policy_impl(p_workspace_id)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_update_deadline_warning_policy_v1(
  p_workspace_id uuid,p_enabled boolean,
  p_human_response_before_seconds bigint,
  p_engineering_start_before_seconds bigint,
  p_restoration_before_seconds bigint
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_update_deadline_warning_policy_impl(
    p_workspace_id,p_enabled,p_human_response_before_seconds,
    p_engineering_start_before_seconds,p_restoration_before_seconds
  )
$function$;

CREATE OR REPLACE FUNCTION public.fm1_operational_report_v1(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_operational_report_impl(p_workspace_id)
$function$;

REVOKE ALL ON FUNCTION private.fm1_approaching_deadline_count_impl(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_approaching_deadline_count_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_update_ticket_impl(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_update_ticket_impl(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_deadline_warning_policy_impl(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_deadline_warning_policy_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_update_deadline_warning_policy_impl(uuid,boolean,bigint,bigint,bigint)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_update_deadline_warning_policy_impl(uuid,boolean,bigint,bigint,bigint)
  TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_operational_report_impl(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_operational_report_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_process_deadline_warnings(timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.fm1_process_deadline_warnings(timestamptz,integer) TO postgres;
REVOKE ALL ON FUNCTION private.fm1_format_deadline_warning_notification() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fm1_update_ticket_v1(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_deadline_warning_policy_v1(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_update_deadline_warning_policy_v1(uuid,boolean,bigint,bigint,bigint)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_operational_report_v1(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_update_ticket_v1(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_deadline_warning_policy_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_update_deadline_warning_policy_v1(uuid,boolean,bigint,bigint,bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_operational_report_v1(uuid) TO authenticated;

DO $cron_setup$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname='fm1-sla-approaching-warning-processor'
    ) THEN
      PERFORM cron.schedule(
        'fm1-sla-approaching-warning-processor','30 seconds',
        'select private.fm1_process_deadline_warnings();'
      );
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname='fm1-warning-cron-history-cleanup'
    ) THEN
      PERFORM cron.schedule(
        'fm1-warning-cron-history-cleanup','10 2 * * *',
        $cleanup$delete from cron.job_run_details
          where jobid in (select jobid from cron.job
            where jobname='fm1-sla-approaching-warning-processor')
            and end_time < now()-interval '7 days';$cleanup$
      );
    END IF;
  END IF;
END
$cron_setup$;

DO $postflight$
DECLARE
  v_cron_job boolean;
BEGIN
  IF to_regprocedure('public.fm1_update_ticket_v1(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)') IS NULL
     OR to_regprocedure('public.fm1_operational_report_v1(uuid)') IS NULL
     OR to_regprocedure('public.fm1_deadline_warning_policy_v1(uuid)') IS NULL
     OR to_regprocedure('public.fm1_update_deadline_warning_policy_v1(uuid,boolean,bigint,bigint,bigint)') IS NULL
     OR NOT has_function_privilege('authenticated',
       'public.fm1_update_ticket_v1(uuid,uuid,bigint,text,text,text,text,text,boolean,boolean,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.fm1_operational_report_v1(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'private.fm1_approaching_deadline_count_impl(uuid)','EXECUTE')
     OR has_function_privilege('anon',
       'public.fm1_operational_report_v1(uuid)','EXECUTE')
     OR to_regclass('private.fm1_deadline_warning_policies') IS NULL
     OR to_regclass('private.fm1_deadline_warning_events') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_attribute
       WHERE attrelid='private.fm1_worker_runs'::regclass
         AND attname='warning_count' AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION 'CP-FM1-CORE-04 postflight verification failed'
      USING ERRCODE='55000';
  END IF;

  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=$1)'
      INTO v_cron_job USING 'fm1-sla-approaching-warning-processor';
    IF NOT v_cron_job THEN
      RAISE EXCEPTION 'FM1 approaching-deadline warning cron job was not scheduled'
        USING ERRCODE='55000';
    END IF;
  END IF;
END
$postflight$;

COMMIT;
