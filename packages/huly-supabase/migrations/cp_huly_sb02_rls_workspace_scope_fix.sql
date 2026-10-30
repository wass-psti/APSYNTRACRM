-- Historical SB02 policy correction: qualify outer document columns.
begin;
alter policy huly_documents_read on huly_rewrite.documents using (
 public.work_board_access(board_id,'view')
 and exists (select 1 from public.work_boards b where b.id=documents.board_id and b.workspace_id=documents.workspace_id));
alter policy huly_documents_insert on huly_rewrite.documents with check (
 public.work_board_access(board_id,'edit')
 and exists (select 1 from public.work_boards b where b.id=documents.board_id and b.workspace_id=documents.workspace_id));
alter policy huly_documents_update on huly_rewrite.documents
 using (public.work_board_access(board_id,'edit')
  and exists (select 1 from public.work_boards b where b.id=documents.board_id and b.workspace_id=documents.workspace_id))
 with check (public.work_board_access(board_id,'edit')
  and exists (select 1 from public.work_boards b where b.id=documents.board_id and b.workspace_id=documents.workspace_id));
commit;
