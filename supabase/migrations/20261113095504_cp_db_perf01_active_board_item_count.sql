-- CP-DB-PERF-01: accelerate active item counts used by wm_list_boards.
-- This table is approximately 13 MB as checked on 2026-11-13.
-- Fail rather than waiting on production locks or sustaining an expensive build.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
CREATE INDEX IF NOT EXISTS work_board_items_active_board_count_idx
  ON public.work_board_items (board_id)
  WHERE archived_at IS NULL;
