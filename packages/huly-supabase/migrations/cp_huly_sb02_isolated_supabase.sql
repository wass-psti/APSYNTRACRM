-- CP-HULY-SB02 additive initial schema, RLS and updatable API view.
-- Existing Supabase migrations include subsequent corrective migrations; see README.
begin;
create schema if not exists huly_rewrite;
revoke all on schema huly_rewrite from public;
grant usage on schema huly_rewrite to authenticated;
create table if not exists huly_rewrite.documents (
  board_id uuid not null references public.work_boards(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_id text not null check (document_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$'),
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  primary key(board_id,document_id)
);
create index if not exists huly_documents_workspace_board_idx on huly_rewrite.documents(workspace_id,board_id);
create or replace function huly_rewrite.stamp_document()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op='INSERT' then new.revision := 1; new.created_at := now();
  else new.revision := old.revision + 1; new.created_at := old.created_at; end if;
  return new;
end;
$$;
revoke all on function huly_rewrite.stamp_document() from public;
create trigger huly_sb02_stamp_document before insert or update on huly_rewrite.documents
  for each row execute function huly_rewrite.stamp_document();
alter table huly_rewrite.documents enable row level security;
alter table huly_rewrite.documents force row level security;
create policy huly_documents_read on huly_rewrite.documents for select to authenticated
using (public.work_board_access(board_id,'view') and workspace_id=public.current_workspace_id());
create policy huly_documents_insert on huly_rewrite.documents for insert to authenticated
with check (public.work_board_access(board_id,'edit') and workspace_id=public.current_workspace_id());
create policy huly_documents_update on huly_rewrite.documents for update to authenticated
using (public.work_board_access(board_id,'edit') and workspace_id=public.current_workspace_id())
with check (public.work_board_access(board_id,'edit') and workspace_id=public.current_workspace_id());
revoke all on huly_rewrite.documents from public,anon;
grant select,insert,update(payload) on huly_rewrite.documents to authenticated;
create or replace view public.huly_sb02_documents with (security_invoker = true) as
select board_id,workspace_id,document_id,payload,revision,created_at,updated_at,updated_by
from huly_rewrite.documents;
revoke all on public.huly_sb02_documents from public,anon;
grant select,insert,update(payload) on public.huly_sb02_documents to authenticated;
comment on view public.huly_sb02_documents is 'Huly SB02 authorized Supabase API (security_invoker, underlying RLS)';
commit;
