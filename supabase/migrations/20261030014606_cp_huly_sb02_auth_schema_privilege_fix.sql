begin;
alter policy huly_documents_read on huly_rewrite.documents using (
  public.work_board_access(board_id,'view') and workspace_id = public.current_workspace_id()
);
alter policy huly_documents_insert on huly_rewrite.documents with check (
  public.work_board_access(board_id,'edit') and workspace_id = public.current_workspace_id()
);
alter policy huly_documents_update on huly_rewrite.documents
  using (public.work_board_access(board_id,'edit') and workspace_id = public.current_workspace_id())
  with check (public.work_board_access(board_id,'edit') and workspace_id = public.current_workspace_id());
commit;;
