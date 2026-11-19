import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  new URL(
    "../../scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs",
    import.meta.url,
  ),
  "utf8",
);
const includes = (value) =>
  assert.ok(script.includes(value), "Missing acceptance contract: " + value);

test("02C browser acceptance defaults to read-only and requires two explicit production-write signals", () => {
  includes('process.argv.includes("--create-approved-qa-drafts")');
  includes('CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED === "YES"');
  includes('productionWriteOutcome: "NOT_STARTED"');
  includes("productionDataWriteAttempted: false");
  includes("writeMode && !writeApproved");
  includes("read-only-signed-user-preflight");
});

test("02C verifies the existing signed TradeLink User and canonical board for all six modules", () => {
  for (const type of [
    "esi",
    "quotation",
    "packing",
    "delivery",
    "payment",
    "po",
  ])
    includes('type: "' + type + '"');
  includes('context?.role, "User"');
  includes("context?.board?.id");
  includes("context?.board?.workspace_id");
  includes("form[data-tradelink-draft-form]");
});

test("02C verifies server numbering, atomic create, exact read, All Documents and Board linkage", () => {
  for (const rpc of [
    "tl03_document_create",
    "tl03_document_read",
    "tl03_documents_list",
    "tl03_documents_page",
    "tl03_board_projection",
  ])
    includes('"' + rpc + '"');
  includes("receipt.documentNumber?.startsWith(module.prefix)");
  includes("record?.board_item_id");
  includes("allDocumentsPage.rows.some");
  includes("projection?.item?.title");
});

test("02C verifies refresh/reopen and revision-two Draft update persistence for each module", () => {
  includes('"#/tradelink/drafts/edit/" + documentId');
  includes("page.reload(");
  includes('"tl03_document_save"');
  includes("updateReceipt?.revision,");
  includes("revised?.revision,");
  includes("updatedDocumentsPage.rows.some");
  includes("refresh/reopen verified");
});

test("02C never automates login, inspects browser secrets, changes roles or cleans up production records", () => {
  includes("sign in manually");
  includes("rolesOrPermissionsChanged: false");
  assert.match(script, /never automates login/i);
  assert.doesNotMatch(
    script,
    /localStorage|sessionStorage|document\.cookie|accessToken|service_role|SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.doesNotMatch(
    script,
    /DELETE FROM|\.delete\(|tl03_document_archive|tl03_document_delete/,
  );
  includes("never retries a create/update");
});
