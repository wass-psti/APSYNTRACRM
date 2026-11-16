-- CP-FM1-CORE-03 — operational assignment, conversations and in-app notification delivery.
-- This migration is additive to CP-FM1-CORE-02. It does not activate the 2027
-- service contract, external notification channels, or alter CRM role policy.

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('private.fm1_tickets') IS NULL
     OR to_regclass('private.fm1_ticket_events') IS NULL
     OR to_regclass('private.fm1_audit_events') IS NULL
     OR to_regclass('private.fm1_notification_outbox') IS NULL
     OR to_regclass('public.workspace_members') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regprocedure('private.fm1_assert_workspace(uuid)') IS NULL
     OR to_regprocedure('private.fm1_append_ticket_event(uuid,uuid,uuid,text,timestamptz,text,uuid,jsonb,uuid)') IS NULL
     OR to_regprocedure('private.fm1_reject_append_only_mutation()') IS NULL
     OR to_regprocedure('private.fm1_reject_append_only_truncate()') IS NULL THEN
    RAISE EXCEPTION 'CP-FM1-CORE-03 prerequisites are not installed'
      USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workspace_members'
      AND column_name IN ('workspace_id','user_id','active')
    GROUP BY table_schema,table_name
    HAVING count(*)=3
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND column_name IN ('id','email','display_name','status')
    GROUP BY table_schema,table_name
    HAVING count(*)=4
  ) THEN
    RAISE EXCEPTION 'CP-FM1-CORE-03 workspace member/profile contract is incompatible'
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

ALTER TABLE private.fm1_notification_outbox
  DROP CONSTRAINT IF EXISTS fm1_notification_outbox_channel_check;
ALTER TABLE private.fm1_notification_outbox
  ADD CONSTRAINT fm1_notification_outbox_channel_check
  CHECK (channel IN ('unconfigured','in_app','email','sms','paging','manual_call'));

CREATE TABLE IF NOT EXISTS private.fm1_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  visibility text NOT NULL CHECK (visibility IN ('internal','customer_update')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (ticket_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS private.fm1_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  ticket_id uuid NOT NULL REFERENCES private.fm1_tickets(id) ON DELETE RESTRICT,
  outbox_id uuid NOT NULL REFERENCES private.fm1_notification_outbox(id) ON DELETE RESTRICT,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  UNIQUE (outbox_id,recipient_id)
);

ALTER TABLE private.fm1_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.fm1_notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fm1_conversations_ticket_created_idx
  ON private.fm1_conversations(ticket_id,created_at,id);
CREATE INDEX IF NOT EXISTS fm1_notifications_recipient_created_idx
  ON private.fm1_notifications(workspace_id,recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS fm1_notifications_unread_idx
  ON private.fm1_notifications(workspace_id,recipient_id,created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS fm1_outbox_in_app_ready_idx
  ON private.fm1_notification_outbox(available_at,created_at,id)
  WHERE channel='in_app' AND delivery_state IN ('queued','failed');

DROP TRIGGER IF EXISTS fm1_conversations_append_only ON private.fm1_conversations;
CREATE TRIGGER fm1_conversations_append_only
BEFORE UPDATE OR DELETE ON private.fm1_conversations
FOR EACH ROW EXECUTE FUNCTION private.fm1_reject_append_only_mutation();
DROP TRIGGER IF EXISTS fm1_conversations_no_truncate ON private.fm1_conversations;
CREATE TRIGGER fm1_conversations_no_truncate
BEFORE TRUNCATE ON private.fm1_conversations
FOR EACH STATEMENT EXECUTE FUNCTION private.fm1_reject_append_only_truncate();

CREATE OR REPLACE FUNCTION private.fm1_enqueue_ticket_event_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_ticket private.fm1_tickets%ROWTYPE;
  v_scope text := 'workspace';
BEGIN
  SELECT * INTO v_ticket FROM private.fm1_tickets WHERE id=NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.event_type='AssignmentChanged'
     AND nullif(NEW.payload->>'assigned_to','') IS NOT NULL THEN
    v_scope := 'assignee';
  END IF;

  INSERT INTO private.fm1_notification_outbox(
    ticket_id,event_type,delivery_key,channel,recipient_scope,payload,delivery_state
  ) VALUES (
    NEW.ticket_id,NEW.event_type,'inapp:event:'||NEW.event_id::text,
    'in_app',v_scope,
    jsonb_build_object(
      'ticket_event_id',NEW.event_id,
      'ticket_number',v_ticket.ticket_number,
      'subject',v_ticket.subject,
      'event_payload',NEW.payload,
      'assigned_to',NEW.payload->>'assigned_to'
    ),
    'queued'
  ) ON CONFLICT(delivery_key) DO NOTHING;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS fm1_ticket_event_notification_outbox ON private.fm1_ticket_events;
CREATE TRIGGER fm1_ticket_event_notification_outbox
AFTER INSERT ON private.fm1_ticket_events
FOR EACH ROW EXECUTE FUNCTION private.fm1_enqueue_ticket_event_notification();

CREATE OR REPLACE FUNCTION private.fm1_enqueue_sla_breach_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NEW.event_type='SlaObligationBreached'
     AND NEW.channel='unconfigured'
     AND NEW.delivery_state='pending_configuration' THEN
    INSERT INTO private.fm1_notification_outbox(
      ticket_id,obligation_id,event_type,delivery_key,channel,recipient_scope,payload,delivery_state
    ) VALUES (
      NEW.ticket_id,NEW.obligation_id,NEW.event_type,
      'inapp:'||NEW.delivery_key,'in_app','workspace',NEW.payload,'queued'
    ) ON CONFLICT(delivery_key) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS fm1_sla_breach_notification_outbox ON private.fm1_notification_outbox;
CREATE TRIGGER fm1_sla_breach_notification_outbox
AFTER INSERT ON private.fm1_notification_outbox
FOR EACH ROW EXECUTE FUNCTION private.fm1_enqueue_sla_breach_notification();

CREATE OR REPLACE FUNCTION private.fm1_service_status_impl(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_service jsonb;
  v_decisions jsonb;
  v_assignees jsonb;
  v_metrics jsonb;
  v_unassigned_urgent jsonb;
  v_notification_delivery jsonb;
BEGIN
  SELECT to_jsonb(c) INTO v_service FROM private.fm1_service_config c
  WHERE service_key='BIOTECH-FM1-2027';
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.decision_key),'[]'::jsonb)
    INTO v_decisions FROM private.fm1_decisions d;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,
      'display_name',coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'CRM member'),
      'email',p.email
    ) ORDER BY coalesce(nullif(btrim(p.display_name),''),p.email),p.id),'[]'::jsonb)
    INTO v_assignees
  FROM public.workspace_members m
  JOIN public.profiles p ON p.id=m.user_id
  WHERE m.workspace_id=p_workspace_id AND m.active IS TRUE AND p.status='active';

  SELECT jsonb_build_object(
    'total_tickets',count(*),
    'open_tickets',count(*) FILTER (WHERE t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'p1p2_tickets',count(*) FILTER (WHERE t.priority_effective IN ('P1','P2') AND t.status NOT IN ('Closed','Cancelled','Duplicate')),
    'unassigned_p1p2',count(*) FILTER (
      WHERE t.priority_effective IN ('P1','P2') AND t.assigned_to IS NULL
        AND t.status NOT IN ('Closed','Cancelled','Duplicate')
    ),
    'sla_active_tickets',count(*) FILTER (WHERE t.sla_activation_state='ACTIVE'),
    'breached_obligations',(
      SELECT count(*) FROM private.fm1_obligations o
      JOIN private.fm1_tickets ot ON ot.id=o.ticket_id
      WHERE ot.workspace_id=p_workspace_id AND o.status='breached'
    ),
    'approaching_deadlines',NULL,
    'approaching_deadline_policy','NOT_CONFIGURED'
  ) INTO v_metrics
  FROM private.fm1_tickets t WHERE t.workspace_id=p_workspace_id;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.received_at DESC,q.id),'[]'::jsonb)
    INTO v_unassigned_urgent
  FROM (
    SELECT t.id,t.ticket_number,t.subject,t.priority_effective,t.status,t.received_at
    FROM private.fm1_tickets t
    WHERE t.workspace_id=p_workspace_id AND t.assigned_to IS NULL
      AND t.priority_effective IN ('P1','P2')
      AND t.status NOT IN ('Closed','Cancelled','Duplicate')
    ORDER BY t.received_at DESC,t.id
    LIMIT 20
  ) q;

  SELECT jsonb_build_object(
    'queued',count(*) FILTER (WHERE o.delivery_state='queued'),
    'failed',count(*) FILTER (WHERE o.delivery_state='failed'),
    'delivered',count(*) FILTER (WHERE o.delivery_state='delivered')
  ) INTO v_notification_delivery
  FROM private.fm1_notification_outbox o
  JOIN private.fm1_tickets t ON t.id=o.ticket_id
  WHERE t.workspace_id=p_workspace_id AND o.channel='in_app';

  RETURN jsonb_build_object(
    'service',v_service,'decisions',v_decisions,'assignees',v_assignees,
    'metrics',v_metrics,'unassigned_urgent',v_unassigned_urgent,
    'notification_delivery',v_notification_delivery,
    'contract_active',private.fm1_service_ready(),
    'sla_activation_state','PENDING_ACCEPTANCE_AND_READINESS',
    'external_notifications_enabled',false,
    'internal_notifications_enabled',true
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_assign_ticket_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,
  p_assignee_id uuid,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_existing private.fm1_ticket_events%ROWTYPE;
  v_previous_assignee uuid;
  v_assignee_name text;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_idempotency_key IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'FM1 assignment request is invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_existing FROM private.fm1_ticket_events
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',true,'changed',false);
  END IF;
  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;

  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    JOIN public.profiles p ON p.id=m.user_id
    WHERE m.workspace_id=p_workspace_id AND m.user_id=p_assignee_id
      AND m.active IS TRUE AND p.status='active'
  ) THEN
    RAISE EXCEPTION 'FM1 assignee must be an active member of this workspace'
      USING ERRCODE='23503';
  END IF;

  IF v_ticket.assigned_to IS NOT DISTINCT FROM p_assignee_id THEN
    RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',false,'changed',false);
  END IF;

  v_previous_assignee:=v_ticket.assigned_to;
  IF p_assignee_id IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(display_name),''),nullif(btrim(email),''),'CRM member')
      INTO v_assignee_name FROM public.profiles WHERE id=p_assignee_id;
  END IF;

  UPDATE private.fm1_tickets SET assigned_to=p_assignee_id,
    revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'AssignmentChanged',v_now,'crm',p_idempotency_key,
    jsonb_build_object(
      'previous_assigned_to',v_previous_assignee,
      'assigned_to',p_assignee_id,
      'assignee_display_name',v_assignee_name
    ),p_idempotency_key
  );
  RETURN jsonb_build_object('ticket',to_jsonb(v_ticket),'idempotent_replay',false,'changed',true);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_add_conversation_impl(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,
  p_visibility text,p_body text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_ticket private.fm1_tickets%ROWTYPE;
  v_conversation private.fm1_conversations%ROWTYPE;
  v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_idempotency_key IS NULL
     OR p_visibility IS NULL OR p_visibility NOT IN ('internal','customer_update')
     OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'FM1 conversation fields are invalid' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_ticket FROM private.fm1_tickets
  WHERE id=p_ticket_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 ticket was not found' USING ERRCODE='P0002'; END IF;

  SELECT * INTO v_conversation FROM private.fm1_conversations
  WHERE ticket_id=p_ticket_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('conversation',to_jsonb(v_conversation),'idempotent_replay',true);
  END IF;
  IF v_ticket.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'FM1 ticket revision changed; refresh before retrying' USING ERRCODE='40001';
  END IF;

  INSERT INTO private.fm1_conversations(
    ticket_id,workspace_id,actor_id,visibility,body,idempotency_key,created_at
  ) VALUES (
    p_ticket_id,p_workspace_id,v_actor,p_visibility,btrim(p_body),p_idempotency_key,v_now
  ) RETURNING * INTO v_conversation;

  UPDATE private.fm1_tickets SET revision=revision+1,updated_at=v_now
  WHERE id=p_ticket_id RETURNING * INTO v_ticket;

  PERFORM private.fm1_append_ticket_event(
    p_ticket_id,p_workspace_id,v_actor,'ConversationAdded',v_now,'crm',p_idempotency_key,
    jsonb_build_object(
      'conversation_id',v_conversation.id,
      'visibility',v_conversation.visibility,
      'content_length',char_length(v_conversation.body)
    ),p_idempotency_key
  );
  RETURN jsonb_build_object(
    'conversation',to_jsonb(v_conversation),
    'ticket_revision',v_ticket.revision,
    'idempotent_replay',false,
    'external_delivery','NOT_CONFIGURED'
  );
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
  v_conversations jsonb;
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
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'ticket_id',c.ticket_id,'workspace_id',c.workspace_id,
      'actor_id',c.actor_id,
      'actor_display_name',coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.email),''),'CRM member'),
      'visibility',c.visibility,'body',c.body,'created_at',c.created_at
    ) ORDER BY c.created_at,c.id),'[]'::jsonb)
    INTO v_conversations
  FROM private.fm1_conversations c
  LEFT JOIN public.profiles p ON p.id=c.actor_id
  WHERE c.ticket_id=p_ticket_id AND c.workspace_id=p_workspace_id;
  RETURN jsonb_build_object(
    'ticket',v_ticket,'obligations',v_obligations,'events',v_events,
    'milestones',v_milestones,'holds',v_holds,'audit',v_audit,
    'conversations',v_conversations
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_process_notification_outbox(
  p_now timestamptz DEFAULT clock_timestamp(),p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_outbox record;
  v_title text;
  v_message text;
  v_attempt integer;
  v_existing integer;
  v_error text;
  v_processed integer:=0;
  v_delivered integer:=0;
  v_failed integer:=0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'FM1 notification batch limit is invalid' USING ERRCODE='22023';
  END IF;

  FOR v_outbox IN
    SELECT o.id,o.ticket_id,o.event_type,o.delivery_key,o.payload,o.recipient_scope,o.attempts,
      t.workspace_id,t.ticket_number,t.subject
    FROM private.fm1_notification_outbox o
    JOIN private.fm1_tickets t ON t.id=o.ticket_id
    WHERE o.channel='in_app'
      AND o.delivery_state IN ('queued','failed')
      AND o.attempts<8 AND o.available_at<=coalesce(p_now,clock_timestamp())
    ORDER BY o.available_at,o.created_at,o.id
    FOR UPDATE OF o SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_processed:=v_processed+1;
    v_title:=CASE v_outbox.event_type
      WHEN 'TicketReceived' THEN 'New FM1 incident'
      WHEN 'TicketTransitioned' THEN 'Incident status updated'
      WHEN 'PriorityChanged' THEN 'Incident priority updated'
      WHEN 'AssignmentChanged' THEN 'Incident assignment updated'
      WHEN 'ConversationAdded' THEN 'New incident conversation'
      WHEN 'HoldRequested' THEN 'SLA dependency hold requested'
      WHEN 'HoldValidated' THEN 'SLA dependency hold validated'
      WHEN 'HoldRejected' THEN 'SLA dependency hold rejected'
      WHEN 'HoldEnded' THEN 'SLA dependency hold ended'
      WHEN 'SlaObligationBreached' THEN 'SLA breach escalation'
      ELSE 'FM1 incident update'
    END;
    v_message:=CASE v_outbox.event_type
      WHEN 'TicketReceived' THEN 'A new incident was received: '||v_outbox.subject
      WHEN 'TicketTransitioned' THEN 'Ticket status changed to '||coalesce(v_outbox.payload->>'next_status','an updated status')||'.'
      WHEN 'PriorityChanged' THEN 'Ticket priority changed to '||coalesce(v_outbox.payload->>'effective_priority','an updated priority')||'.'
      WHEN 'AssignmentChanged' THEN CASE
        WHEN nullif(v_outbox.payload->>'assigned_to','') IS NULL THEN 'Ticket assignment was cleared.'
        ELSE 'Ticket assigned to '||coalesce(v_outbox.payload->>'assignee_display_name','a workspace member')||'.' END
      WHEN 'ConversationAdded' THEN 'A new '||coalesce(v_outbox.payload->>'visibility','internal')||' conversation was recorded.'
      WHEN 'HoldRequested' THEN 'A dependency hold was requested for this incident.'
      WHEN 'HoldValidated' THEN 'A dependency hold was validated for this incident.'
      WHEN 'HoldRejected' THEN 'A dependency hold was rejected for this incident.'
      WHEN 'HoldEnded' THEN 'A dependency hold ended and its eligible clock was resumed.'
      WHEN 'SlaObligationBreached' THEN 'The '||coalesce(v_outbox.payload->>'metric','SLA')||' obligation has breached.'
      ELSE 'The incident has a new operational update.'
    END;

    BEGIN
      INSERT INTO private.fm1_notifications(
        workspace_id,ticket_id,outbox_id,recipient_id,event_type,title,message,payload
      )
      SELECT v_outbox.workspace_id,v_outbox.ticket_id,v_outbox.id,p.id,
        v_outbox.event_type,v_title,v_message,
        jsonb_build_object(
          'ticket_number',v_outbox.ticket_number,
          'subject',v_outbox.subject,
          'event_payload',v_outbox.payload
        )
      FROM public.workspace_members m
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.workspace_id=v_outbox.workspace_id
        AND m.active IS TRUE AND p.status='active'
        AND (
          v_outbox.recipient_scope<>'assignee'
          OR p.id::text=v_outbox.payload->>'assigned_to'
        )
      ON CONFLICT(outbox_id,recipient_id) DO NOTHING;

      SELECT count(*) INTO v_existing FROM private.fm1_notifications
      WHERE outbox_id=v_outbox.id;

      IF v_existing>0 THEN
        UPDATE private.fm1_notification_outbox SET
          delivery_state='delivered',
          attempts=attempts+1,
          last_attempt_at=coalesce(p_now,clock_timestamp()),
          delivered_at=coalesce(delivered_at,coalesce(p_now,clock_timestamp())),
          last_error=NULL
        WHERE id=v_outbox.id;
        v_delivered:=v_delivered+1;
      ELSE
        v_attempt:=v_outbox.attempts+1;
        UPDATE private.fm1_notification_outbox SET
          delivery_state='failed',attempts=v_attempt,
          last_attempt_at=coalesce(p_now,clock_timestamp()),
          available_at=coalesce(p_now,clock_timestamp())
            + make_interval(secs=>least(3600::numeric,15*power(2,least(v_attempt,8)))::double precision),
          last_error='No active workspace notification recipients'
        WHERE id=v_outbox.id;
        v_failed:=v_failed+1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_attempt:=v_outbox.attempts+1;
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      UPDATE private.fm1_notification_outbox SET
        delivery_state='failed',attempts=v_attempt,
        last_attempt_at=coalesce(p_now,clock_timestamp()),
        available_at=coalesce(p_now,clock_timestamp())
          + make_interval(secs=>least(3600::numeric,15*power(2,least(v_attempt,8)))::double precision),
        last_error=left(coalesce(v_error,'Unknown notification delivery error'),1000)
      WHERE id=v_outbox.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status','COMPLETED','processed',v_processed,
    'delivered',v_delivered,'failed',v_failed,'batch_limit',p_limit
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_notification_inbox_impl(
  p_workspace_id uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_items jsonb;
  v_unread bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'FM1 notification inbox filters are invalid' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_unread FROM private.fm1_notifications n
  WHERE n.workspace_id=p_workspace_id AND n.recipient_id=v_actor AND n.read_at IS NULL;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
    INTO v_items
  FROM (
    SELECT n.id,n.workspace_id,n.ticket_id,n.event_type,n.title,n.message,n.payload,
      n.created_at,n.read_at,t.ticket_number,t.subject
    FROM private.fm1_notifications n
    JOIN private.fm1_tickets t ON t.id=n.ticket_id
    WHERE n.workspace_id=p_workspace_id AND n.recipient_id=v_actor
    ORDER BY n.created_at DESC,n.id DESC
    LIMIT p_limit OFFSET p_offset
  ) q;
  RETURN jsonb_build_object('items',v_items,'unread_total',v_unread,'limit',p_limit,'offset',p_offset);
END
$function$;

CREATE OR REPLACE FUNCTION private.fm1_notification_mark_read_impl(
  p_workspace_id uuid,p_notification_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid:=private.fm1_assert_workspace(p_workspace_id);
  v_notification private.fm1_notifications%ROWTYPE;
  v_was_read boolean;
BEGIN
  SELECT * INTO v_notification FROM private.fm1_notifications
  WHERE id=p_notification_id AND workspace_id=p_workspace_id
    AND recipient_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FM1 notification was not found' USING ERRCODE='P0002'; END IF;
  v_was_read:=v_notification.read_at IS NOT NULL;
  UPDATE private.fm1_notifications SET read_at=coalesce(read_at,clock_timestamp())
  WHERE id=p_notification_id RETURNING * INTO v_notification;
  RETURN jsonb_build_object(
    'notification',jsonb_build_object('id',v_notification.id,'read_at',v_notification.read_at),
    'idempotent_replay',v_was_read
  );
END
$function$;

-- Public PostgREST wrappers reuse the existing signed CRM session and active workspace.
CREATE OR REPLACE FUNCTION public.fm1_assign_ticket_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,
  p_assignee_id uuid,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_assign_ticket_impl(
    p_workspace_id,p_ticket_id,p_expected_revision,p_assignee_id,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.fm1_add_conversation_v1(
  p_workspace_id uuid,p_ticket_id uuid,p_expected_revision bigint,
  p_visibility text,p_body text,p_idempotency_key uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_add_conversation_impl(
    p_workspace_id,p_ticket_id,p_expected_revision,p_visibility,p_body,p_idempotency_key
  )
$function$;

CREATE OR REPLACE FUNCTION public.fm1_notification_inbox_v1(
  p_workspace_id uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_notification_inbox_impl(p_workspace_id,p_limit,p_offset)
$function$;

CREATE OR REPLACE FUNCTION public.fm1_notification_mark_read_v1(
  p_workspace_id uuid,p_notification_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.fm1_notification_mark_read_impl(p_workspace_id,p_notification_id)
$function$;

REVOKE ALL ON FUNCTION private.fm1_enqueue_ticket_event_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.fm1_enqueue_sla_breach_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.fm1_assign_ticket_impl(uuid,uuid,bigint,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_assign_ticket_impl(uuid,uuid,bigint,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_add_conversation_impl(uuid,uuid,bigint,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_add_conversation_impl(uuid,uuid,bigint,text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_notification_inbox_impl(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_notification_inbox_impl(uuid,integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_notification_mark_read_impl(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.fm1_notification_mark_read_impl(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.fm1_process_notification_outbox(timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.fm1_process_notification_outbox(timestamptz,integer) TO postgres;

REVOKE ALL ON FUNCTION public.fm1_assign_ticket_v1(uuid,uuid,bigint,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_add_conversation_v1(uuid,uuid,bigint,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_notification_inbox_v1(uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fm1_notification_mark_read_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_assign_ticket_v1(uuid,uuid,bigint,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_add_conversation_v1(uuid,uuid,bigint,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_notification_inbox_v1(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fm1_notification_mark_read_v1(uuid,uuid) TO authenticated;

DO $cron_setup$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname='fm1-notification-outbox-processor'
    ) THEN
      PERFORM cron.schedule(
        'fm1-notification-outbox-processor','30 seconds',
        'select private.fm1_process_notification_outbox();'
      );
    END IF;
  END IF;
END
$cron_setup$;

DO $postflight$
BEGIN
  IF to_regclass('private.fm1_conversations') IS NULL
     OR to_regclass('private.fm1_notifications') IS NULL
     OR NOT has_function_privilege('authenticated',
       'public.fm1_assign_ticket_v1(uuid,uuid,bigint,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.fm1_add_conversation_v1(uuid,uuid,bigint,text,text,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.fm1_notification_inbox_v1(uuid,integer,integer)','EXECUTE')
     OR has_function_privilege('anon',
       'public.fm1_notification_inbox_v1(uuid,integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated',
       'private.fm1_process_notification_outbox(timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'CP-FM1-CORE-03 postflight checks failed' USING ERRCODE='55000';
  END IF;
END
$postflight$;

COMMIT;
