#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="cp-tl-document-creator-01-$$"
PASSWORD="creator-test-only-$$"
MIGRATION="$ROOT/supabase/migrations/20261125071129_cp_tl_document_creator_identification_01.sql"
TEMP_MIGRATION="$(mktemp)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$TEMP_MIGRATION"
}
trap cleanup EXIT

docker run --rm -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  postgres:17-alpine >/dev/null

for attempt in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;

CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email text,
 email_confirmed_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;

CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,
 display_name text,
 email text
);
CREATE TABLE public.tradelink_documents(
 id uuid PRIMARY KEY,
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 board_item_id uuid NOT NULL,
 document_type text NOT NULL,
 document_number text NOT NULL,
 workflow_state text NOT NULL,
 revision bigint NOT NULL,
 content jsonb NOT NULL,
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 hidden_at timestamptz,
 deleted_at timestamptz
);
CREATE TABLE private.tradelink_document_revision_snapshots(
 document_id uuid NOT NULL,
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 board_item_id uuid NOT NULL,
 document_type text NOT NULL,
 document_number text NOT NULL,
 workflow_state text NOT NULL,
 revision bigint NOT NULL,
 content jsonb NOT NULL,
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 revision_at timestamptz NOT NULL,
 snapshot_source text NOT NULL,
 captured_at timestamptz NOT NULL
);
CREATE TABLE private.tradelink_document_reviews(
 document_id uuid NOT NULL,
 document_revision bigint NOT NULL,
 stage text NOT NULL,
 recorded_at timestamptz,
 actor_id uuid
);

CREATE FUNCTION public.current_workspace_id(uuid) RETURNS uuid
 LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION private.wm_board_config_session_active() RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.tl03_can_manage(uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.tl03_can_create_draft(uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.tl03_can_review(uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION private.tl03_can_read_own_document(uuid,uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION private.tl03_review_assignee(text,jsonb,text) RETURNS text
 LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE FUNCTION private.tl03_revision_approval_policy(uuid,bigint) RETURNS text
 LANGUAGE sql STABLE AS $$ SELECT 'standard-dual-v1'::text $$;
CREATE FUNCTION private.tl03_approval_evidence_complete(uuid,bigint) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE FUNCTION private.tl03_documents_page(
 p_board_id uuid,p_search text,p_document_type text,p_workflow_state text,
 p_archive_mode text,p_visibility_mode text,p_before_at timestamptz,
 p_before_id uuid,p_limit integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;

CREATE FUNCTION public.tl03_document_read(p_board_id uuid,p_document_id uuid)
 RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$ SELECT '{}'::jsonb $$;

CREATE FUNCTION public.tl03_document_revision_bundle(
 p_board_id uuid,p_document_id uuid,p_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;

REVOKE ALL ON FUNCTION private.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)
 TO authenticated;
REVOKE ALL ON FUNCTION public.tl03_document_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_read(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_revision_bundle(uuid,uuid,bigint)
 TO authenticated;
SQL

# The disposable fixture stubs the baseline RPCs instead of replaying the full
# application schema. Remove only the live-definition MD5 preflight comparisons
# from this temporary test copy; production migration retains all three guards.
python3 - "$MIGRATION" "$TEMP_MIGRATION" <<'PY_MIGRATION'
import sys
from pathlib import Path
source=Path(sys.argv[1]).read_text().splitlines()
output=[]
skip=False
removed=0
for line in source:
 if "OR md5(pg_get_functiondef(" in line:
  if skip: raise SystemExit("Unexpected nested MD5 preflight")
  skip=True
  continue
 if skip:
  if "IS DISTINCT FROM '" not in line:
   raise SystemExit("Unexpected MD5 preflight formatting")
  skip=False
  removed+=1
  continue
 output.append(line)
if skip or removed!=3:
 raise SystemExit(f"Expected to remove three disposable-only baseline checks, removed {removed}")
Path(sys.argv[2]).write_text("\n".join(output)+"\n")
PY_MIGRATION

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$TEMP_MIGRATION"

docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
INSERT INTO public.profiles(id,display_name,email) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Original Creator','creator@example.test');
INSERT INTO public.tradelink_documents(
 id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by,created_at,updated_at
) VALUES (
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '00000000-0000-4000-8000-000000000001',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'quotation','Q-CREATOR-01','draft',1,
 '{"documentType":"quotation","documentNumber":"Q-CREATOR-01"}',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),now()
);
INSERT INTO private.tradelink_document_revision_snapshots(
 document_id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by,created_at,updated_at,
 revision_at,snapshot_source,captured_at
) SELECT id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by,created_at,updated_at,
 now(),'captured',now()
 FROM public.tradelink_documents WHERE document_number='Q-CREATOR-01';

DO $acceptance$
DECLARE
 board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc_id uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 original_creator uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 later_editor uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 page jsonb;
 doc jsonb;
 history jsonb;
BEGIN
 page:=private.tl03_documents_page(board_id,'','all','all','active','visible',NULL,NULL,50);
 IF page#>>'{rows,0,createdByName}' IS DISTINCT FROM 'Original Creator'
  OR page#>>'{rows,0,createdBy}' IS DISTINCT FROM original_creator::text
 THEN RAISE EXCEPTION 'All Documents creator projection failed: %',page; END IF;

 doc:=public.tl03_document_read(board_id,doc_id);
 IF doc->>'created_by_name' IS DISTINCT FROM 'Original Creator'
  OR doc->>'created_by' IS DISTINCT FROM original_creator::text
 THEN RAISE EXCEPTION 'Signed document read creator projection failed: %',doc; END IF;

 history:=public.tl03_document_revision_bundle(board_id,doc_id,1);
 IF history#>>'{selected,created_by_name}' IS DISTINCT FROM 'Original Creator'
  OR history#>>'{selected,created_by}' IS DISTINCT FROM original_creator::text
 THEN RAISE EXCEPTION 'Revision bundle creator projection failed: %',history; END IF;

 UPDATE public.tradelink_documents
 SET updated_by=later_editor,updated_at=now()
 WHERE id=doc_id;
 doc:=public.tl03_document_read(board_id,doc_id);
 IF doc->>'created_by' IS DISTINCT FROM original_creator::text
  OR doc->>'updated_by' IS DISTINCT FROM later_editor::text
  OR doc->>'created_by_name' IS DISTINCT FROM 'Original Creator'
 THEN RAISE EXCEPTION 'Creator changed after another user edited the document: %',doc; END IF;

 RAISE NOTICE 'PASS: page, document read, revision read and later-editor preservation';
END
$acceptance$;
SQL

echo "PASS: CP-TL-DOCUMENT-CREATOR-01 disposable PostgreSQL 17 acceptance."
