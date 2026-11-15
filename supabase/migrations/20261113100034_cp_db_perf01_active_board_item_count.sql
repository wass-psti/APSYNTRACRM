SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
CREATE INDEX IF NOT EXISTS work_board_items_active_board_count_idx ON public.work_board_items (board_id) WHERE archived_at IS NULL;;
