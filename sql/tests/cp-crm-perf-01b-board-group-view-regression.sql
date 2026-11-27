\set ON_ERROR_STOP on

-- Synthetic PostgreSQL 17 fixture. No production data or credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $uid$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$uid$;

CREATE OR REPLACE FUNCTION private.wm_board_config_session_active()
RETURNS boolean
LANGUAGE sql
STABLE
AS $session$
  SELECT true;
$session$;

CREATE TABLE public.work_boards (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.work_board_groups (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
  position integer NOT NULL
);

CREATE OR REPLACE FUNCTION public.work_board_access(p_board_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $access$
  SELECT true;
$access$;

INSERT INTO auth.users(id)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.work_boards(id, workspace_id, status)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'active'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'active');

INSERT INTO public.work_board_groups(id, board_id, position)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1),
  ('00000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2),
  ('00000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 3),
  ('00000000-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 4),
  ('00000000-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 5),
  ('00000000-0000-4000-8000-000000000006', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 6),
  ('00000000-0000-4000-8000-000000000101', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1),
  ('00000000-0000-4000-8000-000000000102', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 2),
  ('00000000-0000-4000-8000-000000000103', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 3),
  ('00000000-0000-4000-8000-000000000104', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 4),
  ('00000000-0000-4000-8000-000000000105', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 5);

-- Reproduce the production failure before applying the correction.
\i supabase/migrations/20261120194000_cp_board_group_view_01_user_prefs.sql

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;

DO $reproduce$
DECLARE
  failure_caught boolean := false;
BEGIN
  BEGIN
    PERFORM public.wm_board_group_view_read('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  EXCEPTION
    WHEN undefined_function THEN
      failure_caught := true;
  END;

  IF NOT failure_caught THEN
    RAISE EXCEPTION 'Expected SQLSTATE 42883 from the original pg_catalog.coalesce call';
  END IF;
END;
$reproduce$;

RESET ROLE;

-- Apply the forward-only fix, then exercise both RPCs as an authenticated actor.
\i supabase/migrations/20261127130720_cp_board_group_view_coalesce_fix.sql

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;

DO $acceptance$
DECLARE
  board_six uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  board_five uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  board_empty uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  group_two uuid := '00000000-0000-4000-8000-000000000002';
  initial_state jsonb;
  repeated_state jsonb;
  updated_state jsonb;
  collapsed_state jsonb;
  expanded_state jsonb;
  five_state jsonb;
  empty_state jsonb;
  group_state jsonb;
BEGIN
  initial_state := public.wm_board_group_view_read(board_six);

  IF jsonb_array_length(initial_state->'groups') <> 6 THEN
    RAISE EXCEPTION 'Six-group first read returned an incorrect group count';
  END IF;
  IF (initial_state->'groups'->0->>'collapsed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'First group must start expanded';
  END IF;
  IF (initial_state->'groups'->1->>'collapsed')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Groups after the first must start collapsed when count exceeds five';
  END IF;

  repeated_state := public.wm_board_group_view_read(board_six);
  IF repeated_state IS DISTINCT FROM initial_state THEN
    RAISE EXCEPTION 'Repeated read changed persisted first-visit preferences';
  END IF;

  PERFORM public.wm_board_group_view_set(board_six, group_two, false, 1);
  updated_state := public.wm_board_group_view_read(board_six);
  SELECT value INTO group_state
  FROM jsonb_array_elements(updated_state->'groups') AS element(value)
  WHERE value->>'group_id' = group_two::text;

  IF group_state IS NULL
     OR (group_state->>'collapsed')::boolean IS DISTINCT FROM false
     OR (group_state->>'revision')::bigint <> 2 THEN
    RAISE EXCEPTION 'Individual preference update or revision increment failed';
  END IF;

  collapsed_state := public.wm_board_group_view_set_all(board_six, true);
  IF jsonb_array_length(collapsed_state->'groups') <> 6
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(collapsed_state->'groups') AS element(value)
       WHERE (value->>'collapsed')::boolean IS DISTINCT FROM true
     ) THEN
    RAISE EXCEPTION 'Bulk collapse did not update every group';
  END IF;

  expanded_state := public.wm_board_group_view_set_all(board_six, false);
  IF jsonb_array_length(expanded_state->'groups') <> 6
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(expanded_state->'groups') AS element(value)
       WHERE (value->>'collapsed')::boolean IS DISTINCT FROM false
     ) THEN
    RAISE EXCEPTION 'Bulk expand did not update every group';
  END IF;

  five_state := public.wm_board_group_view_read(board_five);
  IF jsonb_array_length(five_state->'groups') <> 5
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(five_state->'groups') AS element(value)
       WHERE (value->>'collapsed')::boolean IS DISTINCT FROM false
     ) THEN
    RAISE EXCEPTION 'Boards with five or fewer groups must initialize expanded';
  END IF;

  empty_state := public.wm_board_group_view_read(board_empty);
  IF jsonb_array_length(empty_state->'groups') <> 0 THEN
    RAISE EXCEPTION 'Empty board read must return an empty JSON array';
  END IF;

  empty_state := public.wm_board_group_view_set_all(board_empty, true);
  IF jsonb_array_length(empty_state->'groups') <> 0 THEN
    RAISE EXCEPTION 'Empty board bulk update must return an empty JSON array';
  END IF;
END;
$acceptance$;

RESET ROLE;

-- A group created after first initialization must start expanded.
INSERT INTO public.work_board_groups(id, board_id, position)
VALUES (
  '00000000-0000-4000-8000-000000000007',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  7
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SET ROLE authenticated;

DO $new_group$
DECLARE
  state jsonb;
  added_group jsonb;
  group_seven uuid := '00000000-0000-4000-8000-000000000007';
BEGIN
  state := public.wm_board_group_view_read('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  SELECT value INTO added_group
  FROM jsonb_array_elements(state->'groups') AS element(value)
  WHERE value->>'group_id' = group_seven::text;

  IF added_group IS NULL
     OR (added_group->>'collapsed')::boolean IS DISTINCT FROM false
     OR (added_group->>'revision')::bigint <> 1 THEN
    RAISE EXCEPTION 'New groups after initialization must start expanded at revision one';
  END IF;
END;
$new_group$;

RESET ROLE;

SELECT 'PASS: original 42883 reproduced; corrected read/set-all RPCs, grants, defaults, revisions and empty arrays verified' AS result;
