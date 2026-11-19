import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261119080635_cp_tl_create_new_02_user_board_projection_insert.sql",
    import.meta.url,
  ),
  "utf8",
);
const fixture = readFileSync(
  new URL(
    "../../sql/tests/cp-tl-create-new-02-user-fixture.sql",
    import.meta.url,
  ),
  "utf8",
);
const acceptance = readFileSync(
  new URL(
    "../../sql/tests/cp-tl-create-new-02-user-six-module-disposable.sql",
    import.meta.url,
  ),
  "utf8",
);
const runner = readFileSync(
  new URL(
    "../../scripts/cp-tl-create-new-02-user-draft-disposable.sh",
    import.meta.url,
  ),
  "utf8",
);

test("TradeLink User Board projection is created inside the existing signed domain transaction", () => {
  assert.match(
    migration,
    /private\.tl03_can_create_draft\(p_board_id\) IS DISTINCT FROM TRUE/,
  );
  assert.match(
    migration,
    /IF private\.tl03_can_manage\(p_board_id\) IS TRUE THEN/,
  );
  assert.match(
    migration,
    /item_id:=public\.wm_add_board_item\(p_board_id,group_id,payload->>'documentNumber'\);/,
  );
  assert.match(migration, /INSERT INTO public\.work_board_items/);
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /public\.work_board_log\(/);
  assert.match(migration, /UPDATE public\.work_boards/);
  assert.match(
    migration,
    /SET updated_at=pg_catalog\.now\(\),updated_by=actor/,
  );
  assert.match(migration, /USING ERRCODE='55000'/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.wm_add_board_item/,
  );
  assert.doesNotMatch(
    migration,
    /GRANT .*work_board_access|INSERT INTO public\.work_board_members|UPDATE public\.work_board_members/,
  );
});

test("Generic Board insert and manager behavior remain unchanged", () => {
  assert.match(migration, /-- Preserve the existing manager path exactly\./);
  assert.match(
    migration,
    /public\.wm_add_board_item\(p_board_id,group_id,payload->>'documentNumber'\)/,
  );
  assert.match(migration, /work_board_access\(p_board_id,''edit''\)/);
  assert.match(
    migration,
    /private\.tl03_can_manage\(p_board_id\) IS DISTINCT FROM TRUE/,
  );
});

test("disposable fixture proves the existing TradeLink User has Viewer membership only", () => {
  assert.match(fixture, /SET role='viewer'/);
  assert.match(fixture, /'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'/);
  assert.match(fixture, /CREATE OR REPLACE FUNCTION public\.has_module_access/);
  assert.match(fixture, /asenagan@watchdogautomation\.com\.ph/);
  assert.match(fixture, /dsenagan@watchdogautomation\.com\.ph/);
});

test("six-module acceptance covers numbering, creator readback, Board, list, page, revision and idempotency", () => {
  for (const type of [
    "esi",
    "quotation",
    "packing",
    "delivery",
    "payment",
    "po",
  ]) {
    assert.match(acceptance, new RegExp("'" + type + "'"));
  }
  assert.match(acceptance, /public\.tl03_document_create/);
  assert.match(acceptance, /public\.tl03_document_read/);
  assert.match(acceptance, /public\.tl03_document_save/);
  assert.match(acceptance, /public\.tl03_board_projection/);
  assert.match(acceptance, /public\.tl03_documents_list/);
  assert.match(acceptance, /public\.tl03_documents_page/);
  assert.match(acceptance, /public\.tl03_document_revision_bundle/);
  assert.match(acceptance, /idempotent/);
  assert.match(acceptance, /ROLLBACK;/);
  assert.match(
    acceptance,
    /work_board_access\(board,'edit'\) IS DISTINCT FROM FALSE/,
  );
  assert.match(acceptance, /workflow_state='draft'/);
});

test("runner uses isolated PostgreSQL 17 with no network or production credentials", () => {
  assert.match(runner, /postgres:17/);
  assert.match(runner, /--network none/);
  assert.match(runner, /disposable_only/);
  assert.doesNotMatch(
    runner,
    /SUPABASE_URL|SERVICE_ROLE_KEY|POSTGRES_URL|jtlusodorfnyzgyuewkz\.supabase\.co/,
  );
  assert.match(
    runner,
    /20261119080635_cp_tl_create_new_02_user_board_projection_insert\.sql/,
  );
});
