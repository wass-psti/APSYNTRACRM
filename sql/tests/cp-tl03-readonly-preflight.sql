-- CP-TL-03A pre-activation evidence: read-only and safe on the live project.
-- Expected until separate approval: target document tables and RPCs ABSENT.
SELECT b.id AS board_id,b.name,b.workspace_id,b.status,
 (SELECT count(*) FROM public.work_board_groups g WHERE g.board_id=b.id) AS group_count,
 (SELECT count(*) FROM public.work_board_columns c WHERE c.board_id=b.id) AS column_count,
 (SELECT count(*) FROM public.work_board_items i WHERE i.board_id=b.id) AS board_item_count,
 to_regclass('public.tradelink_documents') AS document_table,
 to_regclass('public.tradelink_document_events') AS event_table,
 to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') AS command_rpc,
 to_regprocedure('public.tl03_document_read(uuid,uuid)') AS read_rpc,
 to_regprocedure('public.tl03_documents_list(uuid,integer)') AS list_rpc
FROM public.work_boards b
WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid;
