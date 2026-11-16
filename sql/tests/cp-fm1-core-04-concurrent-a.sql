\set ON_ERROR_STOP on
\set VERBOSITY verbose
BEGIN;
SELECT id AS ticket_id FROM private.fm1_tickets
WHERE idempotency_key='20000000-0000-4000-8000-000000000010' \gset
SELECT id FROM private.fm1_tickets WHERE id=:'ticket_id'::uuid FOR UPDATE;
SELECT pg_sleep(1.5);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.workspace_id','00000000-0000-4000-8000-000000000001',true);
SELECT public.fm1_update_ticket_v1(
  '00000000-0000-4000-8000-000000000001',:'ticket_id'::uuid,2,
  'Concurrency Winner','09171111111',
  'Concurrent update winner',
  'The first transaction commits this authoritative incident detail update.',
  'critical',true,true,'PLC-CONCURRENCY',
  '20000000-0000-4000-8000-000000000013'
);
COMMIT;
