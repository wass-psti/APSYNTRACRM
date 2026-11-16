\set ON_ERROR_STOP on
\echo 'CP-FM1-CORE-02 — disposable server lifecycle acceptance'

SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SET request.jwt.claim.workspace_id='00000000-0000-4000-8000-000000000001';
SET ROLE authenticated;

DO $test$
DECLARE
  v_workspace uuid:='00000000-0000-4000-8000-000000000001';
  v_key uuid:='00000000-0000-4000-8000-000000000010';
  v_receipt jsonb;
  v_replay jsonb;
  v_status jsonb;
  v_ticket_id uuid;
  v_detail jsonb;
  v_queue jsonb;
  v_transition jsonb;
  v_transition_replay jsonb;
  v_milestone jsonb;
  v_milestone_replay jsonb;
  v_revision bigint;
BEGIN
  v_status:=public.fm1_service_status_v1(v_workspace);
  IF coalesce((v_status->>'contract_active')::boolean,true) THEN
    RAISE EXCEPTION 'Contract must remain inactive before acceptance/readiness';
  END IF;
  IF coalesce((v_status->>'external_notifications_enabled')::boolean,true) THEN
    RAISE EXCEPTION 'External notifications must remain disabled';
  END IF;

  v_receipt:=public.fm1_create_ticket_v1(
    v_workspace,v_key,'Test Requester','09171234567','PLC alarm test',
    'Production line reports an intermittent PLC communication alarm.',
    'P1','degraded',false,false,'portal',null,null
  );
  v_ticket_id:=(v_receipt->'ticket'->>'id')::uuid;
  IF v_receipt->'ticket'->>'ticket_number' !~ '^FM1-[0-9]{4}-[0-9]{6}$'
     OR v_receipt->>'sla_activation_state'<>'NOT_ACTIVE'
     OR (v_receipt->>'obligation_count')::integer<>4
     OR coalesce((v_receipt->>'idempotent_replay')::boolean,true) THEN
    RAISE EXCEPTION 'Server intake receipt did not satisfy the ticket contract: %',v_receipt;
  END IF;

  v_replay:=public.fm1_create_ticket_v1(
    v_workspace,v_key,'Test Requester','09171234567','PLC alarm test',
    'Production line reports an intermittent PLC communication alarm.',
    'P1','degraded',false,false,'portal',null,null
  );
  IF (v_replay->>'idempotent_replay')::boolean IS DISTINCT FROM true
     OR v_replay->'ticket'->>'id' IS DISTINCT FROM v_ticket_id::text THEN
    RAISE EXCEPTION 'Ticket intake idempotency replay failed';
  END IF;

  BEGIN
    PERFORM public.fm1_create_ticket_v1(
      v_workspace,v_key,'Different Requester','09171234567','PLC alarm test',
      'Production line reports an intermittent PLC communication alarm.',
      'P1','degraded',false,false,'portal',null,null
    );
    RAISE EXCEPTION 'Conflicting idempotency payload was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  v_transition:=public.fm1_transition_ticket_v1(
    v_workspace,v_ticket_id,1,'Triaged','Initial technical triage',
    '00000000-0000-4000-8000-000000000011',null,null
  );
  IF v_transition->'ticket'->>'status'<>'Triaged'
     OR (v_transition->'ticket'->>'revision')::bigint<>2 THEN
    RAISE EXCEPTION 'Ticket transition did not persist';
  END IF;
  v_transition_replay:=public.fm1_transition_ticket_v1(
    v_workspace,v_ticket_id,1,'Triaged','Initial technical triage',
    '00000000-0000-4000-8000-000000000011',null,null
  );
  IF (v_transition_replay->>'idempotent_replay')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Transition idempotency replay failed';
  END IF;

  v_milestone:=public.fm1_record_milestone_v1(
    v_workspace,v_ticket_id,2,'human_response','portal',
    'Technician acknowledged the incident and contacted the requester.',
    '00000000-0000-4000-8000-000000000012',true,null,null
  );
  IF v_milestone->'milestone'->>'metric'<>'human_response'
     OR (v_milestone->>'ticket_revision')::bigint<>3 THEN
    RAISE EXCEPTION 'Human response milestone did not persist';
  END IF;
  v_milestone_replay:=public.fm1_record_milestone_v1(
    v_workspace,v_ticket_id,2,'human_response','portal',
    'Technician acknowledged the incident and contacted the requester.',
    '00000000-0000-4000-8000-000000000012',true,null,null
  );
  IF (v_milestone_replay->>'idempotent_replay')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Milestone replay after revision advancement failed';
  END IF;

  v_queue:=public.fm1_list_tickets_v1(v_workspace,50,0,null,null,null);
  IF jsonb_array_length(v_queue->'items')<>1
     OR v_queue->'items'->0->>'workspace_id' IS DISTINCT FROM v_workspace::text THEN
    RAISE EXCEPTION 'Server ticket queue omitted the workspace-scoped ticket identity';
  END IF;

  v_detail:=public.fm1_ticket_detail_v1(v_workspace,v_ticket_id);
  IF jsonb_array_length(v_detail->'events')<>3
     OR jsonb_array_length(v_detail->'audit')<>3
     OR jsonb_array_length(v_detail->'obligations')<>4 THEN
    RAISE EXCEPTION 'Ticket detail did not return lifecycle, audit and SLA records';
  END IF;
END
$test$;

RESET ROLE;

DO $audit_test$
DECLARE
  v_ticket uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_ticket FROM private.fm1_tickets
  WHERE idempotency_key='00000000-0000-4000-8000-000000000010';
  SELECT count(*) INTO v_count FROM private.fm1_audit_events
  WHERE ticket_id=v_ticket;
  IF v_count<>3 THEN RAISE EXCEPTION 'Unexpected audit event count: %',v_count; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT sequence,previous_hash,lag(event_hash) OVER (ORDER BY sequence) AS expected_previous
      FROM private.fm1_audit_events WHERE ticket_id=v_ticket
    ) chain
    WHERE sequence>1 AND previous_hash IS DISTINCT FROM expected_previous
  ) THEN RAISE EXCEPTION 'Audit hash chain does not link correctly'; END IF;

  BEGIN
    UPDATE private.fm1_audit_events SET event_type='tampered'
    WHERE ticket_id=v_ticket AND sequence=1;
    RAISE EXCEPTION 'Audit event mutation was accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END
$audit_test$;

DO $worker_skip$
DECLARE v_result jsonb;
BEGIN
  v_result:=private.fm1_process_due_obligations(clock_timestamp());
  IF v_result->>'status'<>'SKIPPED' OR (v_result->>'breached')::integer<>0 THEN
    RAISE EXCEPTION 'SLA worker must remain inactive before service readiness: %',v_result;
  END IF;
END
$worker_skip$;

-- Move the disposable fixture term into the present solely to exercise the
-- server activation/deadline path; this does not alter the actual FM1 project.
UPDATE private.fm1_calendar_versions
SET approval_state='approved',holiday_dates=ARRAY[]::date[],approved_at=clock_timestamp()
WHERE calendar_key='BIOTECH-FM1-2027-UNCONFIGURED';
UPDATE private.fm1_decisions
SET approval_state='approved',approved_at=clock_timestamp(),
    approved_by='00000000-0000-4000-8000-000000000002'
WHERE decision_key IN ('D01','D08','D09');
UPDATE private.fm1_service_config
SET term_start=clock_timestamp()-interval '1 day',
    term_end_exclusive=clock_timestamp()+interval '365 days',
    execution_state='active',readiness_state='ready',activated_at=NULL;

DO $activation$
DECLARE
  v_result jsonb;
  v_ticket uuid;
  v_state text;
  v_running integer;
  v_pending integer;
BEGIN
  v_result:=private.fm1_process_due_obligations(clock_timestamp());
  IF v_result->>'status'<>'COMPLETED' THEN
    RAISE EXCEPTION 'Ready disposable service did not run the SLA worker: %',v_result;
  END IF;
  SELECT id,sla_activation_state INTO v_ticket,v_state FROM private.fm1_tickets
  WHERE idempotency_key='00000000-0000-4000-8000-000000000010';
  SELECT count(*) INTO v_running FROM private.fm1_obligations
  WHERE ticket_id=v_ticket AND status='running';
  SELECT count(*) INTO v_pending FROM private.fm1_obligations
  WHERE ticket_id=v_ticket AND decision_state<>'ready';
  IF v_state<>'ACTIVE' OR v_running<>3 OR v_pending<>1 THEN
    RAISE EXCEPTION 'SLA activation should start three obligations and leave D02 public update pending; state %, running %, pending %',
      v_state,v_running,v_pending;
  END IF;
END
$activation$;

UPDATE private.fm1_obligations
SET due_at=now()-interval '1 minute',
    proposed_due_at=now()-interval '1 minute'
WHERE ticket_id=(SELECT id FROM private.fm1_tickets
  WHERE idempotency_key='00000000-0000-4000-8000-000000000010')
  AND status='running';

DO $breach$
DECLARE v_result jsonb; v_breached integer;
BEGIN
  v_result:=private.fm1_process_due_obligations(clock_timestamp());
  v_breached:=(v_result->>'breached')::integer;
  IF v_result->>'status'<>'COMPLETED' OR v_breached<>3 THEN
    RAISE EXCEPTION 'Due processor should breach exactly three due obligations: %',v_result;
  END IF;
  IF (SELECT count(*) FROM private.fm1_notification_outbox
      WHERE event_type='SlaObligationBreached' AND delivery_state='pending_configuration')<>3 THEN
    RAISE EXCEPTION 'Breach outbox records were not created exactly once';
  END IF;
END
$breach$;

-- Release the D02 public-update decision and verify pending obligations recalculate.
UPDATE private.fm1_decisions
SET approval_state='approved',approved_at=clock_timestamp(),
    approved_by='00000000-0000-4000-8000-000000000002'
WHERE decision_key='D02';
SELECT private.fm1_activate_pending_obligations(clock_timestamp());

DO $support_clock$
DECLARE
  v_due timestamptz;
  v_calendar uuid;
BEGIN
  SELECT id INTO v_calendar FROM private.fm1_calendar_versions
  WHERE calendar_key='BIOTECH-FM1-2027-UNCONFIGURED';
  v_due:=private.fm1_support_deadline(
    timestamptz '2026-11-16 16:00:00+08',7200,v_calendar
  );
  IF v_due IS DISTINCT FROM timestamptz '2026-11-17 09:00:00+08' THEN
    RAISE EXCEPTION 'Support-calendar deadline calculation mismatch: %',v_due;
  END IF;
END
$support_clock$;


SET ROLE authenticated;

DO $hold_priority$
DECLARE
  v_workspace uuid:='00000000-0000-4000-8000-000000000001';
  v_receipt jsonb;
  v_ticket uuid;
  v_detail jsonb;
  v_hold jsonb;
  v_hold_id uuid;
  v_due_before timestamptz;
  v_due_after timestamptz;
  v_priority jsonb;
  v_priority_replay jsonb;
BEGIN
  v_receipt:=public.fm1_create_ticket_v1(
    v_workspace,'00000000-0000-4000-8000-000000000020',
    'Second Requester','09179876543','Conveyor sensor fault',
    'Conveyor station reports intermittent sensor loss and degraded operation.',
    'P1','degraded',false,false,'portal','CV-04',null
  );
  v_ticket:=(v_receipt->'ticket'->>'id')::uuid;

  -- A verified public update completes the current obligation and creates
  -- the next recurring update obligation.
  PERFORM public.fm1_record_milestone_v1(
    v_workspace,v_ticket,1,'public_update','portal',
    'Client received the latest investigation update and current work plan.',
    '00000000-0000-4000-8000-000000000021',true,null,null
  );
  v_detail:=public.fm1_ticket_detail_v1(v_workspace,v_ticket);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_detail->'obligations') o
    WHERE o->>'metric'='public_update' AND (o->>'sequence')::integer=1 AND o->>'status'='met'
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_detail->'obligations') o
    WHERE o->>'metric'='public_update' AND (o->>'sequence')::integer=2 AND o->>'status'='running'
  ) THEN
    RAISE EXCEPTION 'Recurring public-update obligation was not created';
  END IF;

  SELECT (o->>'due_at')::timestamptz INTO v_due_before
  FROM jsonb_array_elements(v_detail->'obligations') o
  WHERE o->>'metric'='engineering_start' AND (o->>'sequence')::integer=1;

  v_hold:=public.fm1_request_hold_v1(
    v_workspace,v_ticket,'engineering_start','missing_access','Client maintenance',
    'Restore safe access to the controller cabinet',
    'The cabinet was inaccessible during the scheduled service visit.',
    clock_timestamp()+interval '1 hour',
    '00000000-0000-4000-8000-000000000022'
  );
  v_hold_id:=(v_hold->'hold'->>'id')::uuid;
  v_detail:=public.fm1_ticket_detail_v1(v_workspace,v_ticket);
  SELECT (o->>'due_at')::timestamptz INTO v_due_after
  FROM jsonb_array_elements(v_detail->'obligations') o
  WHERE o->>'metric'='engineering_start' AND (o->>'sequence')::integer=1;
  IF v_due_after IS DISTINCT FROM v_due_before THEN
    RAISE EXCEPTION 'Pending hold changed the SLA deadline before validation';
  END IF;

  PERFORM public.fm1_validate_hold_v1(
    v_workspace,v_hold_id,'validated',
    'Client maintenance confirmed the access dependency and blocked guided diagnosis.',
    true,'00000000-0000-4000-8000-000000000023'
  );
  v_detail:=public.fm1_ticket_detail_v1(v_workspace,v_ticket);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_detail->'obligations') o
    WHERE o->>'metric'='engineering_start' AND o->>'status'='paused_where_permitted'
  ) THEN
    RAISE EXCEPTION 'Validated engineering-start hold did not pause its eligible obligation';
  END IF;

  PERFORM public.fm1_end_hold_v1(
    v_workspace,v_hold_id,'Client access restored and engineering work may resume.',
    '00000000-0000-4000-8000-000000000024'
  );
  v_detail:=public.fm1_ticket_detail_v1(v_workspace,v_ticket);
  SELECT (o->>'due_at')::timestamptz INTO v_due_after
  FROM jsonb_array_elements(v_detail->'obligations') o
  WHERE o->>'metric'='engineering_start' AND (o->>'sequence')::integer=1;
  IF v_due_after<=v_due_before OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_detail->'obligations') o
    WHERE o->>'metric'='engineering_start' AND o->>'status'='running'
  ) THEN
    RAISE EXCEPTION 'Ended hold did not resume and extend the eligible engineering-start clock';
  END IF;

  v_priority:=public.fm1_record_priority_v1(
    v_workspace,v_ticket,5,'P2','P2',null,
    'Priority revised after updated production impact assessment.',
    '00000000-0000-4000-8000-000000000025'
  );
  IF v_priority->>'sla_recalculation'<>'NEEDS_REVIEW_PENDING_D03' THEN
    RAISE EXCEPTION 'Unapproved D03 priority change was not held for review';
  END IF;
  v_priority_replay:=public.fm1_record_priority_v1(
    v_workspace,v_ticket,5,'P2','P2',null,
    'Priority revised after updated production impact assessment.',
    '00000000-0000-4000-8000-000000000025'
  );
  IF (v_priority_replay->>'idempotent_replay')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Priority idempotency replay after revision change failed';
  END IF;
END
$hold_priority$;

RESET ROLE;

UPDATE private.fm1_decisions
SET approval_state='approved',approved_at=clock_timestamp(),
    approved_by='00000000-0000-4000-8000-000000000002'
WHERE decision_key='D03';
SELECT private.fm1_activate_pending_obligations(clock_timestamp());

DO $priority_release$
DECLARE
  v_ticket uuid;
  v_state text;
  v_decision text;
  v_running integer;
BEGIN
  SELECT id,sla_activation_state INTO v_ticket,v_state
  FROM private.fm1_tickets
  WHERE idempotency_key='00000000-0000-4000-8000-000000000020';
  SELECT decision_state INTO v_decision
  FROM private.fm1_priority_events
  WHERE ticket_id=v_ticket AND sequence=2;
  SELECT count(*) INTO v_running
  FROM private.fm1_obligations
  WHERE ticket_id=v_ticket AND status='running' AND priority='P2';
  IF v_state<>'ACTIVE' OR v_decision<>'pending_d03' OR v_running<>4 THEN
    RAISE EXCEPTION 'Approved D03 did not recalculate P2 obligations while preserving the immutable priority event: state %, decision %, running %',
      v_state,v_decision,v_running;
  END IF;
END
$priority_release$;

\echo 'CP-FM1-CORE-02 DISPOSABLE ACCEPTANCE PASS'
