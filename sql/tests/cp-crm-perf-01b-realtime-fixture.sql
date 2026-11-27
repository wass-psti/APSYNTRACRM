-- CP-CRM-PERF-01B controlled Realtime fixture.
-- This SQL is executed only in a disposable local Supabase CI stack.
BEGIN;

CREATE TABLE public.cp_crm_perf_01b_realtime_probe (
  board_id uuid PRIMARY KEY,
  revision bigint NOT NULL CHECK (revision > 0)
);

INSERT INTO public.cp_crm_perf_01b_realtime_probe(board_id, revision)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1);

ALTER TABLE public.cp_crm_perf_01b_realtime_probe ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_crm_perf_01b_probe_read
ON public.cp_crm_perf_01b_realtime_probe
FOR SELECT TO authenticated
USING (board_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);

CREATE POLICY cp_crm_perf_01b_probe_update
ON public.cp_crm_perf_01b_realtime_probe
FOR UPDATE TO authenticated
USING (board_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid)
WITH CHECK (board_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);

GRANT SELECT, UPDATE ON public.cp_crm_perf_01b_realtime_probe TO authenticated;

CREATE OR REPLACE FUNCTION public.cp_crm_perf_01b_realtime_probe_read(p_board_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $probe$
  SELECT pg_catalog.jsonb_build_object(
    'board_id', board_id::text,
    'revision', revision
  )
  FROM public.cp_crm_perf_01b_realtime_probe
  WHERE board_id = p_board_id;
$probe$;

GRANT EXECUTE ON FUNCTION public.cp_crm_perf_01b_realtime_probe_read(uuid)
TO authenticated;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY cp_crm_perf_01b_realtime_receive
ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() = 'realtime:board:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND extension = 'broadcast'
);

CREATE POLICY cp_crm_perf_01b_realtime_send
ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = 'realtime:board:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND extension = 'broadcast'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
