\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);
DO $test$
DECLARE
 c jsonb; t jsonb; tid uuid; m jsonb; d jsonb; replay jsonb;
 k uuid:='10000000-0000-4000-8000-000000000001';
 mk uuid:='10000000-0000-4000-8000-000000000002';
BEGIN
 c:=public.fm1_service_status_v1('00000000-0000-4000-8000-000000000001');
 IF c->>'sla_activation_state'<>'PENDING_ACCEPTANCE_AND_READINESS' THEN RAISE EXCEPTION 'unexpected activation'; END IF;
 c:=public.fm1_create_ticket_v1(
 '00000000-0000-4000-8000-000000000001',k,'Runtime Test Operator','09171234567',
 'PLC communication alarm','Production line reports intermittent PLC communication loss.',
 'P1','degraded',false,false,'portal','PLC-01',NULL);
 t:=c->'ticket'; tid:=(t->>'id')::uuid;
 IF t->>'ticket_number' !~ '^FM1-[0-9]{4}-[0-9]{6}$' THEN RAISE EXCEPTION 'bad ticket ref'; END IF;
 IF t->>'sla_activation_state'<>'NOT_ACTIVE' THEN RAISE EXCEPTION 'SLA activated early'; END IF;
 IF (c->>'obligation_count')::int<>4 THEN RAISE EXCEPTION 'expected four obligations'; END IF;
 c:=public.fm1_create_ticket_v1(
 '00000000-0000-4000-8000-000000000001',k,'Runtime Test Operator','09171234567',
 'PLC communication alarm','Production line reports intermittent PLC communication loss.',
 'P1','degraded',false,false,'portal','PLC-01',NULL);
 IF (c->>'idempotent_replay')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ticket replay failed'; END IF;
 c:=public.fm1_transition_ticket_v1(
 '00000000-0000-4000-8000-000000000001',tid,1,'Triaged',
 'Initial technical triage','10000000-0000-4000-8000-000000000003',NULL,NULL);
 IF c->'ticket'->>'status'<>'Triaged' THEN RAISE EXCEPTION 'transition failed'; END IF;
 m:=public.fm1_record_milestone_v1(
 '00000000-0000-4000-8000-000000000001',tid,2,'human_response','portal',
 'Technician acknowledged the incident and contacted the requester.',mk,true,NULL,NULL);
 replay:=public.fm1_record_milestone_v1(
 '00000000-0000-4000-8000-000000000001',tid,2,'human_response','portal',
 'Technician acknowledged the incident and contacted the requester.',mk,true,NULL,NULL);
 IF (replay->>'idempotent_replay')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'milestone replay failed'; END IF;
 d:=public.fm1_ticket_detail_v1('00000000-0000-4000-8000-000000000001',tid);
 IF jsonb_array_length(d->'events')<>3 OR jsonb_array_length(d->'audit')<>3
    OR jsonb_array_length(d->'obligations')<>4 THEN RAISE EXCEPTION 'readback mismatch'; END IF;
 RAISE NOTICE 'CP-FM1-CORE-02 runtime acceptance passed: %',t->>'ticket_number';
END
$test$;
RESET ROLE;
DO $audit$
DECLARE tid uuid; n int;
BEGIN
 SELECT id INTO tid FROM private.fm1_tickets WHERE idempotency_key='10000000-0000-4000-8000-000000000001';
 SELECT count(*) INTO n FROM private.fm1_audit_events WHERE ticket_id=tid;
 IF n<>3 THEN RAISE EXCEPTION 'audit count mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM private.fm1_audit_events a WHERE a.ticket_id=tid AND
  ((a.sequence=1 AND a.previous_hash IS NOT NULL) OR
   (a.sequence>1 AND a.previous_hash IS DISTINCT FROM
    (SELECT p.event_hash FROM private.fm1_audit_events p WHERE p.ticket_id=tid AND p.sequence=a.sequence-1))))
 THEN RAISE EXCEPTION 'audit chain links invalid'; END IF;
 BEGIN UPDATE private.fm1_ticket_events SET payload='{}'::jsonb WHERE ticket_id=tid;
  RAISE EXCEPTION 'append-only update allowed'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 BEGIN DELETE FROM private.fm1_audit_events WHERE ticket_id=tid;
  RAISE EXCEPTION 'append-only delete allowed'; EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
 RAISE NOTICE 'Audit chain and append-only enforcement passed';
END $audit$;
ROLLBACK;
