-- CP-DB-PERF-01: targeted active-item count index for wm_list_boards.
-- Live EXPLAIN showed a sequential scan filtering board_id and archived_at.
-- Deploy in a controlled window: standard CREATE INDEX may briefly block writes.
CREATE INDEX IF NOT EXISTS work_board_items_active_board_count_idx
  ON public.work_board_items (board_id)
  WHERE archived_at IS NULL;
