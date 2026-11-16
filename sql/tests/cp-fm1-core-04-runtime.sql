\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);

DO $workflow$
DECLARE
  v_created jsonb;
  v_ticket jsonb;
  v_ticket_id uuid;
  v_updated jsonb;
  v_replay jsonb;
  v_report jsonb;
  v_policy jsonb;
  v_detail jsonb;
  v_queue jsonb;
  v_ticket_number text;
  v_received_at timestamptz;
  v_warning_count integer;
  v_event_count integer;
  v_audit_count integer;
BEGIN
  v_created:=public.fm1_create_ticket_v1(
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000010',
    'CP04 Runtime Operator','09171234567',
    'Feed conveyor sensor failure',
    'The feed conveyor sensor reports intermittent signal loss during production.',
    'P2','degraded',false,false,'portal','PLC-FEED-04',NULL
  );
  v_ticket:=v_created->'ticket';
  v_ticket_id:=(v_ticket->>'id')::uuid;
  v_ticket_number:=v_ticket->>'ticket_number';
  v_received_at:=(v_ticket->>'received_at')::timestamptz;

  v_queue:=public.fm1_list_tickets_v1(
    '00000000-0000-4000-8000-000000000001',50,0,'Feed conveyor sensor failure',NULL,NULL
  );
  IF (v_queue->>'total')::int<>1 OR jsonb_array_length(v_queue->'items')<>1 THEN
    RAISE EXCEPTION 'server-side subject search did not return the incident';
  END IF;
  v_queue:=public.fm1_list_tickets_v1(
    '00000000-0000-4000-8000-000000000001',50,0,v_ticket_number,NULL,NULL
  );
  IF (v_queue->>'total')::int<>1 OR jsonb_array_length(v_queue->'items')<>1 THEN
    RAISE EXCEPTION 'server-side ticket-number search did not return the incident';
  END IF;
  v_queue:=public.fm1_list_tickets_v1(
    '00000000-0000-4000-8000-000000000001',50,0,'CP04 Runtime Operator','New','P2'
  );
  IF (v_queue->>'total')::int<>1 OR jsonb_array_length(v_queue->'items')<>1 THEN
    RAISE EXCEPTION 'combined requester/status/priority filters did not return the incident';
  END IF;
  v_queue:=public.fm1_list_tickets_v1(
    '00000000-0000-4000-8000-000000000001',1,1,NULL,NULL,NULL
  );
  IF (v_queue->>'total')::int<>2 OR jsonb_array_length(v_queue->'items')<>1
     OR (v_queue->>'offset')::int<>1 THEN
    RAISE EXCEPTION 'server-side ticket pagination did not return the expected second page';
  END IF;

  v_updated:=public.fm1_update_ticket_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
    'Updated FM1 Operator','09179876543',
    'Feed conveyor sensor failure - confirmed',
    'The technician confirmed intermittent signal loss at the feed conveyor sensor and is collecting diagnostic evidence.',
    'critical',true,true,'PLC-FEED-04A',
    '20000000-0000-4000-8000-000000000011'
  );
  IF (v_updated->'ticket'->>'revision')::int<>2
     OR v_updated->'ticket'->>'requester_name'<>'Updated FM1 Operator'
     OR v_updated->'ticket'->>'subject'<>'Feed conveyor sensor failure - confirmed'
     OR (v_updated->'ticket'->>'production_stopped')::boolean IS NOT TRUE
     OR v_updated->'ticket'->>'ticket_number'<>v_ticket_number
     OR (v_updated->'ticket'->>'received_at')::timestamptz<>v_received_at
     OR (v_updated->>'changed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'revision-safe incident edit did not persist the expected fields';
  END IF;

  v_replay:=public.fm1_update_ticket_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
    'Updated FM1 Operator','09179876543',
    'Feed conveyor sensor failure - confirmed',
    'The technician confirmed intermittent signal loss at the feed conveyor sensor and is collecting diagnostic evidence.',
    'critical',true,true,'PLC-FEED-04A',
    '20000000-0000-4000-8000-000000000011'
  );
  IF (v_replay->>'idempotent_replay')::boolean IS NOT TRUE
     OR (v_replay->'ticket'->>'revision')::int<>2 THEN
    RAISE EXCEPTION 'incident edit idempotent replay failed';
  END IF;

  BEGIN
    PERFORM public.fm1_update_ticket_v1(
      '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
      'Stale Operator','09170000000',
      'Stale incident edit',
      'This stale request must not overwrite the newer incident revision.',
      'degraded',false,false,NULL,
      '20000000-0000-4000-8000-000000000012'
    );
    RAISE EXCEPTION 'stale incident revision was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;

  BEGIN
    PERFORM public.fm1_update_ticket_v1(
      '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
      'Different Operator','09170000000',
      'Different payload',
      'The same idempotency key must not be reused for a different update.',
      'degraded',false,false,NULL,
      '20000000-0000-4000-8000-000000000011'
    );
    RAISE EXCEPTION 'incident edit idempotency key reuse was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  v_detail:=public.fm1_ticket_detail_v1('00000000-0000-4000-8000-000000000001',v_ticket_id);
  IF jsonb_array_length(v_detail->'events')<>2
     OR jsonb_array_length(v_detail->'audit')<>2
     OR v_detail->'events'->1->>'event_type'<>'IncidentDetailsUpdated'
     OR v_detail->'events'->1->'payload'->'before'->>'subject'<>'Feed conveyor sensor failure'
     OR v_detail->'events'->1->'payload'->'after'->>'subject'<>'Feed conveyor sensor failure - confirmed' THEN
    RAISE EXCEPTION 'incident edit event and immutable audit history were not appended';
  END IF;

  v_policy:=public.fm1_deadline_warning_policy_v1('00000000-0000-4000-8000-000000000001');
  IF v_policy->>'policy_state'<>'NOT_CONFIGURED'
     OR (v_policy->>'enabled')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'warning policy must start inactive and unconfigured';
  END IF;

  v_policy:=public.fm1_update_deadline_warning_policy_v1(
    '00000000-0000-4000-8000-000000000001',true,900,1800,3600
  );
  IF v_policy->>'policy_state'<>'ACTIVE'
     OR (v_policy->>'human_response_before_seconds')::int<>900 THEN
    RAISE EXCEPTION 'explicit warning policy configuration did not persist';
  END IF;

  v_report:=public.fm1_operational_report_v1('00000000-0000-4000-8000-000000000001');
  IF (v_report->'metrics'->>'total_tickets')::int<2
     OR (v_report->'metrics'->>'closed_tickets')::int<>0
     OR v_report->'metrics'->'status_breakdown' IS NULL
     OR v_report->'metrics'->'priority_breakdown' IS NULL
     OR v_report->'metrics'->'assignment_breakdown' IS NULL
     OR v_report->'metrics'->'obligation_breakdown' IS NULL
     OR v_report->'metrics'->'milestone_breakdown' IS NULL
     OR v_report->'notification_delivery' IS NULL
     OR jsonb_array_length(v_report->'unassigned_urgent')<1 THEN
    RAISE EXCEPTION 'operational report aggregate contract is incomplete';
  END IF;

  RAISE NOTICE 'CP-FM1-CORE-04 edit, revision, audit, policy and report contract passed for %',v_ticket_number;
END
$workflow$;
COMMIT;
RESET ROLE;

DO $seed_warning_obligation$
DECLARE
  v_ticket_id uuid;
BEGIN
  SELECT id INTO v_ticket_id FROM private.fm1_tickets
  WHERE idempotency_key='20000000-0000-4000-8000-000000000010';
  UPDATE private.fm1_obligations SET
    status='running',
    due_at=now()+interval '10 minutes',
    proposed_due_at=now()+interval '10 minutes',
    updated_at=clock_timestamp()
  WHERE ticket_id=v_ticket_id AND metric='human_response' AND sequence=1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'test incident did not create a human-response obligation';
  END IF;
END
$seed_warning_obligation$;

DO $warning_worker$
DECLARE
  v_ticket_id uuid;
  v_warning jsonb;
  v_replay jsonb;
  v_warning_count integer;
  v_outbox_count integer;
  v_audit_count integer;
BEGIN
  SELECT id INTO v_ticket_id FROM private.fm1_tickets
  WHERE idempotency_key='20000000-0000-4000-8000-000000000010';

  v_warning:=private.fm1_process_deadline_warnings(clock_timestamp(),100);
  IF (v_warning->>'warnings_created')::int<>1 THEN
    RAISE EXCEPTION 'deadline warning worker did not create one approaching warning: %',v_warning;
  END IF;

  v_replay:=private.fm1_process_deadline_warnings(clock_timestamp(),100);
  IF (v_replay->>'warnings_created')::int<>0 THEN
    RAISE EXCEPTION 'deadline warning worker did not suppress duplicate warnings: %',v_replay;
  END IF;

  SELECT count(*) INTO v_warning_count FROM private.fm1_deadline_warning_events
  WHERE ticket_id=v_ticket_id AND metric='human_response';
  SELECT count(*) INTO v_outbox_count FROM private.fm1_notification_outbox
  WHERE ticket_id=v_ticket_id AND event_type='SlaDeadlineApproaching';
  SELECT count(*) INTO v_audit_count FROM private.fm1_audit_events
  WHERE ticket_id=v_ticket_id AND event_type='SlaDeadlineApproaching';
  IF v_warning_count<>1 OR v_outbox_count<>1 OR v_audit_count<>1 THEN
    RAISE EXCEPTION 'approaching warning persistence, outbox or audit deduplication failed';
  END IF;

  PERFORM private.fm1_process_notification_outbox(clock_timestamp(),100);
  IF NOT EXISTS (
    SELECT 1 FROM private.fm1_notifications n
    JOIN private.fm1_notification_outbox o ON o.id=n.outbox_id
    WHERE o.ticket_id=v_ticket_id AND o.event_type='SlaDeadlineApproaching'
      AND n.title='SLA deadline approaching'
      AND n.message LIKE 'The human response deadline%'
  ) THEN
    RAISE EXCEPTION 'approaching deadline notification was not delivered to the in-app inbox';
  END IF;

  RAISE NOTICE 'CP-FM1-CORE-04 approaching deadline warning, duplicate suppression and in-app delivery passed';
END
$warning_worker$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);
DO $report_after_warning$
DECLARE
  v_report jsonb;
  v_status jsonb;
BEGIN
  v_report:=public.fm1_operational_report_v1('00000000-0000-4000-8000-000000000001');
  IF (v_report->'metrics'->>'approaching_deadlines')::int<>1
     OR jsonb_array_length(v_report->'approaching_deadlines')<>1
     OR jsonb_array_length(v_report->'recent_escalations')<1 THEN
    RAISE EXCEPTION 'operational report does not expose the persisted warning event';
  END IF;
  v_status:=public.fm1_service_status_v1('00000000-0000-4000-8000-000000000001');
  IF v_status->'metrics'->>'approaching_deadline_policy'<>'ACTIVE'
     OR (v_status->'metrics'->>'approaching_deadlines')::int<>1
     OR jsonb_array_length(v_status->'unassigned_urgent')<1 THEN
    RAISE EXCEPTION 'service status did not expose the active warning policy, warning count or urgent queue';
  END IF;
  RAISE NOTICE 'CP-FM1-CORE-04 operational report and service status reflect warning, escalation and urgent queue records';
END
$report_after_warning$;
COMMIT;
RESET ROLE;
