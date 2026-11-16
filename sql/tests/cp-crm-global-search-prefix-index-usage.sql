DO $$
BEGIN
  IF (SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname='work_board_items_search_prefix_idx') = 0 THEN
    RAISE EXCEPTION 'two-character item prefix search did not use its B-tree index';
  END IF;
  IF (SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname='work_board_item_values_search_prefix_idx') = 0 THEN
    RAISE EXCEPTION 'two-character cell prefix search did not use its B-tree index';
  END IF;
END $$;
SELECT indexrelname,idx_scan,idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname IN ('work_board_items_search_prefix_idx','work_board_item_values_search_prefix_idx')
ORDER BY indexrelname;
