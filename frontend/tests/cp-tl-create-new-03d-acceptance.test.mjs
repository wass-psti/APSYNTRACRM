import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(
  new URL("../../scripts/cp-tl-create-new-03d-signed-qa.mjs", import.meta.url),
  "utf8",
);

test("requires the two previously approved independent production write gates", () => {
  assert.match(
    source,
    /CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED\s*===\s*["']YES["']/,
  );
  assert.match(
    source,
    /process\.argv\.includes\(["']--create-approved-qa-drafts["']\)/,
  );
  assert.match(source, /!approved\s*\|\|/);
});
test("single module and operation per invocation with exact update ID", () => {
  assert.match(source, /--module=/);
  assert.match(source, /--action=/);
  assert.match(source, /--document-id=/);
  assert.match(
    source,
    /\[["']create["'],\s*["']update["']\]\.includes\(action\)/,
  );
  assert.match(source, /action\s*===\s*["']update["']/);
});
test("waits for route settlement and validates HTML and QA marker before write", () => {
  assert.match(source, /Route\/render startup is asynchronous/);
  assert.match(source, /await page\.waitForTimeout\(1800\)/);
  assert.match(source, /browserValidity\.remarks\.includes\(MARK\)/);
  assert.match(source, /browserValidity\.valid/);
});
test("requires distinct existing reviewer accounts in Supplier PO QA flow", () => {
  assert.match(source, /name\s*===\s*["']verifiedBy["']/);
  assert.match(source, /assert\.notEqual\(\s*primary,\s*secondary/);
  assert.match(source, /po:\s*\[["']approvedBy["'],\s*["']verifiedBy["']\]/);
});
test("performs no automatic retry, deletion, privilege override or secret access", () => {
  for (const forbidden of [
    "service_role",
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "tl03_document_delete",
    "delete from",
    "grant execute",
    "disable row level security",
  ])
    assert.ok(
      !source.toLowerCase().includes(forbidden.toLowerCase()),
      forbidden,
    );
  assert.doesNotMatch(source, /for\s*\(let attempt|while\s*\(.+retry/);
  assert.match(source, /PARTIAL_OR_UNCERTAIN/);
});
test("verifies server numbering, signed mutation receipt, reopened draft and reload", () => {
  assert.match(source, /tl03_document_create/);
  assert.match(source, /tl03_document_save/);
  assert.match(source, /receipt\.documentId/);
  assert.match(source, /receipt\.boardItemId/);
  assert.match(source, /page\.reload/);
  assert.match(source, /result\.status\s*=\s*["']PASS["']/);
});
