\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);

DO $workflow$
DECLARE
  v_status jsonb;
  v_created jsonb;
  v_ticket_id uuid;
  v_ticket jsonb;
  v_assigned jsonb;
  v_replay jsonb;
  v_message jsonb;
  v_detail jsonb;
  v_bad uuid:='10000000-0000-4000-8000-000000000099';
  v_inbox jsonb;
  v_notification_id uuid;
BEGIN
  v_status:=public.fm1_service_status_v1('00000000-0000-4000-8000-000000000001');
  IF jsonb_array_length(v_status->'assignees')<>2 THEN
    RAISE EXCEPTION 'workspace assignee roster did not return both active members';
  END IF;

  v_created:=public.fm1_create_ticket_v1(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000010',
    'CP03 Runtime Operator','09171234567',
    'Feed conveyor PLC alarm',
    'The feed conveyor PLC reports repeated communication loss during production.',
    'P2','degraded',false,false,'portal','PLC-FEED-01',NULL
  );
  v_ticket:=v_created->'ticket';
  v_ticket_id:=(v_ticket->>'id')::uuid;
  IF v_ticket->>'ticket_number' !~ '^FM1-[0-9]{4}-[0-9]{6}$'
     OR v_ticket->>'received_at' IS NULL THEN
    RAISE EXCEPTION 'server ticket reference or receipt timestamp missing';
  END IF;

  v_assigned:=public.fm1_assign_ticket_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000011'
  );
  IF v_assigned->'ticket'->>'assigned_to'<>'00000000-0000-4000-8000-000000000003'
     OR (v_assigned->'ticket'->>'revision')::int<>2 THEN
    RAISE EXCEPTION 'ticket assignment was not persisted';
  END IF;

  v_replay:=public.fm1_assign_ticket_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000011'
  );
  IF (v_replay->>'idempotent_replay')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'assignment idempotency replay failed';
  END IF;

  BEGIN
    PERFORM public.fm1_assign_ticket_v1(
      '00000000-0000-4000-8000-000000000001',v_ticket_id,2,
      '00000000-0000-4000-8000-000000000004',v_bad
    );
    RAISE EXCEPTION 'assignment accepted a profile outside the workspace';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;

  BEGIN
    PERFORM public.fm1_assign_ticket_v1(
      '00000000-0000-4000-8000-000000000001',v_ticket_id,1,
      NULL,'10000000-0000-4000-8000-000000000012'
    );
    RAISE EXCEPTION 'stale assignment revision was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;

  v_message:=public.fm1_add_conversation_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,2,'internal',
    'Technician acknowledged the issue and started PLC diagnostics.',
    '10000000-0000-4000-8000-000000000013'
  );
  IF (v_message->>'idempotent_replay')::boolean IS TRUE THEN
    RAISE EXCEPTION 'new conversation was incorrectly treated as replay';
  END IF;

  v_replay:=public.fm1_add_conversation_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,2,'internal',
    'Technician acknowledged the issue and started PLC diagnostics.',
    '10000000-0000-4000-8000-000000000013'
  );
  IF (v_replay->>'idempotent_replay')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'conversation idempotency replay failed';
  END IF;

  v_message:=public.fm1_add_conversation_v1(
    '00000000-0000-4000-8000-000000000001',v_ticket_id,3,'customer_update',
    'We have acknowledged the conveyor alarm and are checking the PLC communication path.',
    '10000000-0000-4000-8000-000000000014'
  );
  IF v_message->>'external_delivery'<>'NOT_CONFIGURED' THEN
    RAISE EXCEPTION 'customer update incorrectly claimed external delivery';
  END IF;

  v_detail:=public.fm1_ticket_detail_v1('00000000-0000-4000-8000-000000000001',v_ticket_id);
  IF jsonb_array_length(v_detail->'conversations')<>2
     OR jsonb_array_length(v_detail->'events')<>4
     OR jsonb_array_length(v_detail->'audit')<>4
     OR v_detail->'ticket'->>'assigned_to'<>'00000000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'ticket detail did not return assignment, conversations, events and audit';
  END IF;

  v_status:=public.fm1_service_status_v1('00000000-0000-4000-8000-000000000001');
  IF (v_status->'metrics'->>'total_tickets')::int<>1
     OR (v_status->'metrics'->>'p1p2_tickets')::int<>1
     OR (v_status->'metrics'->>'unassigned_p1p2')::int<>0
     OR v_status->'metrics'->>'approaching_deadline_policy'<>'NOT_CONFIGURED'
     OR (v_status->'notification_delivery'->>'queued')::int<>4 THEN
    RAISE EXCEPTION 'FM1 service/duty dashboard metrics are not authoritative';
  END IF;

  v_inbox:=public.fm1_notification_inbox_v1('00000000-0000-4000-8000-000000000001',50,0);
  IF jsonb_array_length(v_inbox->'items')<>0 OR (v_inbox->>'unread_total')::int<>0 THEN
    RAISE EXCEPTION 'notifications were exposed before outbox delivery';
  END IF;

  RAISE NOTICE 'CP-FM1-CORE-03 incident assignment and conversation workflow passed: %',
    v_ticket->>'ticket_number';
END
$workflow$;
COMMIT;
RESET ROLE;

DO $append_only$
DECLARE
  v_ticket_id uuid;
  v_conversation_id uuid;
  v_events integer;
  v_audit integer;
BEGIN
  SELECT id INTO v_ticket_id FROM private.fm1_tickets
  WHERE idempotency_key='10000000-0000-4000-8000-000000000010';
  SELECT id INTO v_conversation_id FROM private.fm1_conversations
  WHERE ticket_id=v_ticket_id ORDER BY created_at LIMIT 1;
  SELECT count(*) INTO v_events FROM private.fm1_ticket_events WHERE ticket_id=v_ticket_id;
  SELECT count(*) INTO v_audit FROM private.fm1_audit_events WHERE ticket_id=v_ticket_id;
  IF v_events<>4 OR v_audit<>4 THEN
    RAISE EXCEPTION 'ticket event/audit count mismatch: events %, audit %',v_events,v_audit;
  END IF;
  BEGIN
    UPDATE private.fm1_conversations SET body='tampered' WHERE id=v_conversation_id;
    RAISE EXCEPTION 'conversation update was allowed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM private.fm1_conversations WHERE id=v_conversation_id;
    RAISE EXCEPTION 'conversation delete was allowed';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.fm1_notifications'::regclass) THEN
    RAISE EXCEPTION 'notification inbox table RLS is not enabled';
  END IF;
  RAISE NOTICE 'Conversation immutability and audit/event persistence passed';
END
$append_only$;

-- The outbox worker is an internal database worker. Run it as postgres, never
-- through the browser or an authenticated user RPC.
SELECT private.fm1_process_notification_outbox(clock_timestamp(),100);

DO $delivery$
DECLARE
  v_ticket_id uuid;
  v_count integer;
  v_result jsonb;
  v_inbox jsonb;
  v_notification_id uuid;
  v_read jsonb;
  v_outbox_id uuid;
BEGIN
  SELECT id INTO v_ticket_id FROM private.fm1_tickets
  WHERE idempotency_key='10000000-0000-4000-8000-000000000010';
  SELECT count(*) INTO v_count FROM private.fm1_notifications WHERE ticket_id=v_ticket_id;
  IF v_count<>7 THEN
    RAISE EXCEPTION 'expected 7 internal notifications after initial delivery; got %',v_count;
  END IF;

  v_result:=private.fm1_process_notification_outbox(clock_timestamp(),100);
  IF (v_result->>'processed')::int<>0 THEN
    RAISE EXCEPTION 'a delivered outbox row was processed again';
  END IF;
  SELECT count(*) INTO v_count FROM private.fm1_notifications WHERE ticket_id=v_ticket_id;
  IF v_count<>7 THEN RAISE EXCEPTION 'duplicate notifications were created on worker replay'; END IF;

  INSERT INTO private.fm1_notification_outbox(
    ticket_id,event_type,delivery_key,payload,delivery_state
  ) VALUES (
    v_ticket_id,'SlaObligationBreached','breach:cp-fm1-core-03-runtime',
    jsonb_build_object('metric','human_response','ticket_number','FM1-TEST'),
    'pending_configuration'
  ) ON CONFLICT(delivery_key) DO NOTHING;

  SELECT count(*) INTO v_count FROM private.fm1_notification_outbox
  WHERE delivery_key='inapp:breach:cp-fm1-core-03-runtime'
    AND channel='in_app' AND delivery_state='queued';
  IF v_count<>1 THEN RAISE EXCEPTION 'SLA breach did not enqueue an internal escalation'; END IF;

  PERFORM private.fm1_process_notification_outbox(clock_timestamp(),100);
  SELECT count(*) INTO v_count FROM private.fm1_notifications
  WHERE ticket_id=v_ticket_id AND event_type='SlaObligationBreached'
    AND title='SLA breach escalation';
  IF v_count<>2 THEN RAISE EXCEPTION 'SLA breach escalation was not delivered to workspace members'; END IF;

  INSERT INTO private.fm1_notification_outbox(
    ticket_id,event_type,delivery_key,channel,recipient_scope,payload,delivery_state
  ) VALUES (
    v_ticket_id,'RetryAcceptance','retry:cp-fm1-core-03-runtime','in_app','workspace',
    jsonb_build_object('ticket_number','FM1-TEST'),'queued'
  ) RETURNING id INTO v_outbox_id;

  UPDATE public.workspace_members SET active=false
  WHERE workspace_id='00000000-0000-4000-8000-000000000001';
  PERFORM private.fm1_process_notification_outbox(clock_timestamp()+interval '1 second',100);
  IF NOT EXISTS (
    SELECT 1 FROM private.fm1_notification_outbox
    WHERE id=v_outbox_id AND delivery_state='failed' AND attempts=1
  ) THEN RAISE EXCEPTION 'notification failure was not retained for retry'; END IF;

  UPDATE public.workspace_members SET active=true
  WHERE workspace_id='00000000-0000-4000-8000-000000000001';
  PERFORM private.fm1_process_notification_outbox(clock_timestamp()+interval '2 minutes',100);
  IF NOT EXISTS (
    SELECT 1 FROM private.fm1_notification_outbox
    WHERE id=v_outbox_id AND delivery_state='delivered' AND attempts=2
  ) THEN RAISE EXCEPTION 'notification retry did not recover after recipients returned'; END IF;
  SELECT count(*) INTO v_count FROM private.fm1_notifications WHERE outbox_id=v_outbox_id;
  IF v_count<>2 THEN RAISE EXCEPTION 'retry generated duplicate or missing recipient notifications'; END IF;

  RAISE NOTICE 'Outbox delivery, SLA escalation, duplicate suppression and retry recovery passed';
END
$delivery$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);
DO $inbox$
DECLARE
  v_inbox jsonb;
  v_id uuid;
  v_mark jsonb;
BEGIN
  v_inbox:=public.fm1_notification_inbox_v1('00000000-0000-4000-8000-000000000001',50,0);
  IF (v_inbox->>'unread_total')::int<>5 THEN
    RAISE EXCEPTION 'operator notification unread total mismatch: %',v_inbox->>'unread_total';
  END IF;
  v_id:=(v_inbox->'items'->0->>'id')::uuid;
  v_mark:=public.fm1_notification_mark_read_v1('00000000-0000-4000-8000-000000000001',v_id);
  IF v_mark->'notification'->>'read_at' IS NULL THEN
    RAISE EXCEPTION 'notification mark-read did not persist';
  END IF;
  v_inbox:=public.fm1_notification_inbox_v1('00000000-0000-4000-8000-000000000001',50,0);
  IF (v_inbox->>'unread_total')::int<>4 THEN
    RAISE EXCEPTION 'notification unread count did not decrement';
  END IF;
END
$inbox$;
COMMIT;
RESET ROLE;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);
DO $assignee_inbox$
DECLARE v_inbox jsonb;
BEGIN
  v_inbox:=public.fm1_notification_inbox_v1('00000000-0000-4000-8000-000000000001',50,0);
  IF (v_inbox->>'unread_total')::int<>6 THEN
    RAISE EXCEPTION 'assignee notification unread total mismatch: %',v_inbox->>'unread_total';
  END IF;
END
$assignee_inbox$;
COMMIT;
RESET ROLE;

SELECT 'CP-FM1-CORE-03-DISPOSABLE-ACCEPTANCE-PASS' AS result;
