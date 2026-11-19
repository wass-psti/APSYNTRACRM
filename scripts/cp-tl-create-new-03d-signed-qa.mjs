#!/usr/bin/env node
/** One signed UI production-QA mutation per invocation. No automatic retries. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { prepareTradeLinkDraftCommand } from "../frontend/tradelink-draft-workspace.js";
const ROOT = "https://wass-psti.github.io/APSYNTRACRM/";
const MARK = "CP-TL-CREATE-NEW-02C QA ONLY";
const modules = {
  quotation: {
    prefix: "Q-",
    fields: {
      customerEmail: "qa-only@example.test",
      validity: "1 day - QA only",
      deliveryCommitment: "No delivery - QA only",
      paymentTerms: "No payment obligation - QA only",
      lineDescription: MARK + " quotation item",
      lineQuantity: "1",
      lineUnitPrice: "1.00",
    },
  },
  packing: {
    prefix: "PL-",
    fields: {
      lineDescription: MARK + " packing item",
      lineQuantity: "1",
      lineUnit: "unit",
    },
  },
  delivery: {
    prefix: "DR-",
    fields: {
      lineDescription: MARK + " delivery item",
      lineQuantity: "1",
      lineUnit: "unit",
    },
  },
  payment: {
    prefix: "AR-",
    fields: {
      paymentParticulars: MARK + " no actual payment received",
      cashAmount: "1.00",
    },
  },
  po: {
    prefix: "PO-",
    fields: {
      targetDeliveryDate: new Date(Date.now() + 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      paymentTerms: "No purchase/payment obligation - QA only",
      lineDescription: MARK + " PO item",
      lineQuantity: "1",
      lineUnitPrice: "1.00",
    },
  },
};
const action = process.argv.find((x) => x.startsWith("--action="))?.slice(9);
const type = process.argv.find((x) => x.startsWith("--module="))?.slice(9);
const existingId = process.argv
  .find((x) => x.startsWith("--document-id="))
  ?.slice(14);
const approved =
  process.env.CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED === "YES" &&
  process.argv.includes("--create-approved-qa-drafts");
if (
  !approved ||
  !["create", "update"].includes(action) ||
  !modules[type] ||
  (action === "update" && !/^[0-9a-f-]{36}$/.test(existingId || ""))
) {
  console.error(
    "BLOCKED: explicit existing QA approval, valid module, action and document id required",
  );
  process.exit(2);
}
const result = {
  action,
  module: type,
  status: "PENDING",
  writeAttempted: false,
  receipt: null,
  network: [],
  reason: null,
};
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().startsWith(ROOT));
const observe = (name) => {
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith("/rest/v1/rpc/" + name),
    { timeout: 25000 },
  );
  void pending.catch(() => {});
  return pending;
};
async function fill(form, name, value) {
  const q = form.locator('[name="' + name + '"]:not([type="hidden"])').first();
  if ((await q.count()) && (await q.isVisible()) && (await q.isEditable()))
    await q.fill(value);
}
async function selectAccount(form, name) {
  const sel = form.locator('select[name="' + name + '"]');
  if (await sel.count()) {
    const options = await sel
      .locator("option")
      .evaluateAll((xs) =>
        xs.filter((x) => !x.disabled && x.value.trim()).map((x) => x.value),
      );
    assert.ok(options.length, "Account option missing for " + name);
    await sel.selectOption(
      type === "po" &&
        name === "verifiedBy" &&
        options.includes("aacsenagan@watchdogautomation.com.ph")
        ? "aacsenagan@watchdogautomation.com.ph"
        : options[0],
    );
    return;
  }
  const input = form.locator('input[name="' + name + '"]');
  if ((await input.count()) && (await input.isEditable()))
    await input.fill(
      ["approvedBy", "approvedByEmail"].includes(name)
        ? "asenagan@watchdogautomation.com.ph"
        : "msenagan@watchdogautomation.com.ph",
    );
}
try {
  assert.ok(page, "No existing signed CRM QA browser");
  const listener = (r) => {
    const n = new URL(r.url()).pathname.split("/").at(-1);
    if (
      [
        "tl03_document_create",
        "tl03_document_save",
        "tl03_document_read",
        "tl03_documents_list",
        "tl03_board_projection",
        "tl03_documents_page",
      ].includes(n)
    )
      result.network.push({ rpc: n, status: r.status() });
  };
  page.on("response", listener);
  await page.goto(
    ROOT +
      "#/tradelink/" +
      (action === "create" ? "drafts/" + type : "drafts/edit/" + existingId),
    { waitUntil: "domcontentloaded", timeout: 45000 },
  );
  const form = page.locator("form[data-tradelink-draft-form]");
  await form.waitFor({ timeout: 45000 });
  // Route/render startup is asynchronous; form presence precedes full native-context settlement.
  await page.waitForTimeout(1800);
  const typeValue = await form
    .locator('[name="documentType"]')
    .last()
    .inputValue();
  assert.equal(typeValue, type);
  let expectedNumber = "";
  if (action === "create") {
    assert.equal(
      await form.locator('[name="documentNumber"]').inputValue(),
      "",
      "must be new document",
    );
    const data = {
      customerName:
        MARK +
        " " +
        type.toUpperCase() +
        " - QA only, no commercial obligation, no dispatch, no funds received",
      referenceNumber: "CP-TL-CREATE-NEW-02C-" + type.toUpperCase(),
      remarks:
        MARK +
        " - " +
        type.toUpperCase() +
        " QA only; no commercial obligation, no dispatch, no funds received",
      ...modules[type].fields,
    };
    for (const [name, value] of Object.entries(data))
      await fill(form, name, value);
    await form.locator('[name="documentStatus"]').selectOption("draft");
    const assigned =
      {
        packing: ["verifiedBy", "approvedBy"],
        delivery: ["checkedBy", "deliveredBy"],
        payment: ["receivedBy", "verifiedBy"],
        po: ["approvedBy", "verifiedBy"],
      }[type] || [];
    for (const name of assigned) await selectAccount(form, name);
    if (type === "po") {
      const primary = await form.locator("[name=verifiedBy]").inputValue();
      const secondary = await form.locator("[name=approvedBy]").inputValue();
      assert.notEqual(
        primary,
        secondary,
        "Two distinct existing PO reviewers are required",
      );
    }
    const pairs = await form.evaluate((f) =>
      [...new FormData(f).entries()].map(([k, v]) => [k, String(v)]),
    );
    const parsed = prepareTradeLinkDraftCommand(
      { mode: "create" },
      new URLSearchParams(pairs),
    );
    assert.ok(parsed.draft.remarks?.includes(MARK));
  } else {
    expectedNumber = await form.locator('[name="documentNumber"]').inputValue();
    assert.ok(
      expectedNumber.startsWith(modules[type].prefix),
      "wrong document number",
    );
    assert.equal(
      await form.locator('[name="documentStatus"]').inputValue(),
      "draft",
    );
    assert.ok(
      (await form.locator('[name="remarks"]').inputValue()).includes(MARK),
      "not QA document",
    );
    await fill(form, "remarks", MARK + " - revision 2 refresh/reopen verified");
  }
  await page.waitForTimeout(750);
  const browserValidity = await form.evaluate((f) => ({
    valid: f.checkValidity(),
    invalid: [...f.querySelectorAll(":invalid")]
      .filter((x) => x.name)
      .map((x) => x.name),
    remarks: f.querySelector("[name=remarks]")?.value || "",
    type: f.querySelector("[name=documentType]")?.value || "",
  }));
  assert.equal(
    browserValidity.type,
    type,
    "module route must remain unchanged",
  );
  assert.ok(
    browserValidity.remarks.includes(MARK),
    "QA form must survive route settle",
  );
  assert.ok(
    browserValidity.valid,
    "Browser form invalid: " + browserValidity.invalid.join(","),
  );
  assert.equal(
    await page.locator('[data-action="tradelink-draft-submit"]').isEnabled(),
    true,
  );
  await page.evaluate(() => {
    window.__cp03dSubmitCount = 0;
    document.addEventListener(
      "submit",
      (e) => {
        if (e.target.matches?.("[data-tradelink-draft-form]"))
          window.__cp03dSubmitCount++;
      },
      { capture: true, once: true },
    );
  });
  const response = observe(
    action === "create" ? "tl03_document_create" : "tl03_document_save",
  );
  result.writeAttempted = true;
  await page.locator('[data-action="tradelink-draft-submit"]').click();
  const received = await response;
  assert.equal(received.status(), 200, "signed mutation response");
  const json = await received.json();
  const receipt = Array.isArray(json) ? json[0] : json;
  assert.ok(
    receipt?.documentId && receipt?.boardItemId,
    "must have canonical IDs",
  );
  assert.equal(
    receipt.revision,
    action === "create" ? 1 : 2,
    "revision receipt",
  );
  if (action === "create")
    assert.ok(
      receipt.documentNumber?.startsWith(modules[type].prefix),
      "server numbering",
    );
  if (action === "update" && receipt.documentNumber != null)
    assert.equal(receipt.documentNumber, expectedNumber, "number immutability");
  result.receipt = {
    documentId: receipt.documentId,
    boardItemId: receipt.boardItemId,
    documentNumber: receipt.documentNumber || expectedNumber,
    revision: receipt.revision,
  };
  console.log("RECEIPT", JSON.stringify(result.receipt));
  await page
    .getByText(result.receipt.documentNumber, { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 30000 });
  await page.goto(ROOT + "#/tradelink/drafts/edit/" + receipt.documentId, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  const reopened = page.locator("form[data-tradelink-draft-form]");
  await reopened.waitFor({ timeout: 45000 });
  assert.equal(
    await reopened.locator('[name="documentNumber"]').inputValue(),
    result.receipt.documentNumber,
  );
  assert.equal(
    await reopened.locator('[name="documentStatus"]').inputValue(),
    "draft",
  );
  assert.ok(
    (await reopened.locator('[name="remarks"]').inputValue()).includes(MARK),
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  const refreshed = page.locator("form[data-tradelink-draft-form]");
  await refreshed.waitFor({ timeout: 45000 });
  assert.equal(
    await refreshed.locator('[name="documentNumber"]').inputValue(),
    result.receipt.documentNumber,
  );
  assert.ok(
    (await refreshed.locator('[name="remarks"]').inputValue()).includes(
      action === "update" ? "revision 2 refresh/reopen verified" : MARK,
    ),
  );
  result.status = "PASS";
  await page.goto(ROOT + "#/tradelink/documents", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
} catch (e) {
  if (page) {
    result.submitCount = await page
      .evaluate(() => window.__cp03dSubmitCount ?? null)
      .catch(() => null);
    result.currentUrl = page.url();
    result.currentForm = await page
      .locator("form[data-tradelink-draft-form]")
      .evaluate((f) => ({
        remarks: f.querySelector("[name=remarks]")?.value?.slice(0, 80) || "",
        valid: f.checkValidity(),
      }))
      .catch(() => null);
  }
  result.status = result.writeAttempted ? "PARTIAL_OR_UNCERTAIN" : "BLOCKED";
  result.reason = { name: e.name, message: String(e.message).slice(0, 250) };
  process.exitCode = 1;
} finally {
  console.log("RESULT", JSON.stringify(result));
  await browser.close().catch(() => {});
}
