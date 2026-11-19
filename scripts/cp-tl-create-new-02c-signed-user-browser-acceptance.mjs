#!/usr/bin/env node
/**
 * CP-TL-CREATE-NEW-02C — genuine existing TradeLink User browser acceptance.
 *
 * Read-only preflight (default):
 *   node scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs --cdp-url=http://127.0.0.1:9222
 *
 * Production QA create/update (requires separate explicit approval):
 *   CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED=YES \
 *   node scripts/cp-tl-create-new-02c-signed-user-browser-acceptance.mjs \
 *     --cdp-url=http://127.0.0.1:9222 --create-approved-qa-drafts
 *
 * Uses an already signed browser session. Never automates login or reads browser
 * storage, cookies, tokens, passwords, or profile data. It never changes roles,
 * grants, policies, or permissions. Production QA records are never auto-deleted.
 * An uncertain write stops the run; the script never retries a create/update.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = "https://wass-psti.github.io/APSYNTRACRM/";
const BOARD_ID = "264ca40d-6e4a-4e4f-97e6-3bd77c97cd88";
const cdpUrl = process.argv
  .find((value) => value.startsWith("--cdp-url="))
  ?.slice("--cdp-url=".length);
const writeMode = process.argv.includes("--create-approved-qa-drafts");
const writeApproved =
  process.env.CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED === "YES";
const marker = "CP-TL-CREATE-NEW-02C QA ONLY";
const modules = [
  { type: "esi", label: "Electronic SI", prefix: "ESI-" },
  { type: "quotation", label: "Quotation", prefix: "Q-" },
  { type: "packing", label: "Packing List", prefix: "PL-" },
  { type: "delivery", label: "Delivery Receipt", prefix: "DR-" },
  { type: "payment", label: "Payment AR", prefix: "AR-" },
  { type: "po", label: "PO to Suppliers", prefix: "PO-" },
];
const rpcResponse = (page, name) =>
  page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/rest/v1/rpc/" + name);
    },
    { timeout: 45000 },
  );
const rpcName = (url) => new URL(url).pathname.split("/").at(-1);
const one = (value) => (Array.isArray(value) ? value[0] : value);
const localDate = (days = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};
const report = {
  milestone: "CP-TL-CREATE-NEW-02C",
  mode: writeMode
    ? "approved-production-qa-create-update"
    : "read-only-signed-user-preflight",
  status: "PENDING",
  productionWriteOutcome: "NOT_STARTED",
  productionDataWriteAttempted: false,
  productionDataWritten: false,
  rolesOrPermissionsChanged: false,
  modules: [],
  created: [],
  failures: [],
};

if (!cdpUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(cdpUrl)) {
  console.error(
    "BLOCKED: supply --cdp-url=http://127.0.0.1:<port> for an already signed browser.",
  );
  process.exitCode = 2;
} else if (writeMode && !writeApproved) {
  console.error(
    "BLOCKED: production writes require CP_TL_CREATE_NEW_02C_PRODUCTION_QA_APPROVED=YES in addition to --create-approved-qa-drafts.",
  );
  process.exitCode = 2;
} else {
  const browser = await chromium.connectOverCDP(cdpUrl);
  let page = null,
    originalUrl = null,
    writeAttempted = false;
  const rpcEvents = [],
    pageErrors = [];
  try {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const candidate of pages) {
      if (!candidate.url().startsWith(BASE)) continue;
      const text = await candidate
        .locator("body")
        .innerText()
        .catch(() => "");
      if (
        text.includes("Secure session") &&
        text.includes("Sign out") &&
        !text.includes("Sign in with your existing work account")
      ) {
        page = candidate;
        break;
      }
    }
    assert.ok(
      page,
      "BLOCKED: sign in manually with an existing TradeLink User account in an APSYNTRA CRM tab.",
    );
    originalUrl = page.url();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.includes("/rest/v1/rpc/"))
        rpcEvents.push({
          rpc: rpcName(response.url()),
          status: response.status(),
        });
    });

    const resolveUserModule = async (type) => {
      const contextPromise = rpcResponse(
        page,
        "native_application_board_context",
      );
      await page.goto(BASE + "#/tradelink/drafts/" + type, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const response = await contextPromise;
      assert.equal(
        response.status(),
        200,
        type + " native application context",
      );
      const context = one(await response.json());
      assert.equal(context?.moduleId, "tradelink", type + " module ID");
      assert.equal(context?.role, "User", type + " existing module role");
      assert.equal(
        context?.board?.id,
        BOARD_ID,
        type + " canonical TradeLink board",
      );
      assert.ok(context?.workspaceId, type + " workspace context");
      assert.equal(
        context?.board?.workspace_id,
        context.workspaceId,
        type + " board/workspace match",
      );
      await page
        .locator("form[data-tradelink-draft-form]")
        .waitFor({ timeout: 45000 });
      const form = page.locator("form[data-tradelink-draft-form]");
      const save = page.locator('[data-action="tradelink-draft-submit"]');
      await save.waitFor({ state: "visible" });
      assert.equal(await save.isEnabled(), true, type + " Save control");
      const status = form.locator('[name="documentStatus"]');
      assert.ok(
        await status.locator('option[value="draft"]').count(),
        type + " explicit Draft option",
      );
      const number = form.locator('[name="documentNumber"]');
      assert.equal(
        await number.isEditable(),
        false,
        type + " server-assigned number is readonly",
      );
      assert.equal(
        await number.inputValue(),
        "",
        type + " initial number field should be blank",
      );
      return { form, save, context };
    };

    const selectFirstNamedAccount = async (form, name) => {
      const field = form.locator('select[name="' + name + '"]');
      if (await field.count()) {
        const options = await field
          .locator("option")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => !node.disabled && node.value.trim() !== "")
              .map((node) => node.value),
          );
        assert.ok(options.length, "No existing assignment option for " + name);
        await field.selectOption(options[0]);
        return;
      }
      const input = form.locator('input[name="' + name + '"]').first();
      if (await input.count()) {
        if ((await input.isVisible()) && (await input.isEditable()))
          await input.fill(
            name === "verifiedBy"
              ? "msenagan@watchdogautomation.com.ph"
              : "asenagan@watchdogautomation.com.ph",
          );
      }
    };

    const fillQaDraft = async (type, form) => {
      const tag =
        marker +
        " — " +
        type.toUpperCase() +
        " — no commercial obligation, no dispatch, no funds received";
      const fill = async (name, value) => {
        const field = form
          .locator('[name="' + name + '"]:not([type="hidden"])')
          .first();
        if (
          (await field.count()) &&
          (await field.isVisible()) &&
          !(await field.isDisabled()) &&
          (await field.isEditable())
        )
          await field.fill(value);
      };
      await form.locator('[name="documentStatus"]').selectOption("draft");
      await fill("customerName", tag);
      await fill(
        "referenceNumber",
        "CP-TL-CREATE-NEW-02C-" + type.toUpperCase(),
      );
      await fill("remarks", tag + "; QA record only.");
      if (type === "esi") {
        await fill("customerTin", "QA-NOT-A-REAL-TIN");
        await fill("lineDescription", tag);
        await fill("lineQuantity", "1");
        await fill("lineUnitPrice", "1.00");
        await selectFirstNamedAccount(form, "verifiedBy");
        await selectFirstNamedAccount(form, "approvedBy");
      } else if (type === "quotation") {
        await fill("customerEmail", "qa-only@example.test");
        await fill("validity", "1 day — QA only");
        await fill("deliveryCommitment", "No delivery — QA only");
        await fill("paymentTerms", "No payment obligation — QA only");
        await fill("lineDescription", tag);
        await fill("lineQuantity", "1");
        await fill("lineUnitPrice", "1.00");
      } else if (type === "packing") {
        await fill("lineDescription", tag);
        await fill("lineQuantity", "1");
        await fill("lineUnit", "unit");
        await fill("verifiedBy", "msenagan@watchdogautomation.com.ph");
        await fill("approvedBy", "asenagan@watchdogautomation.com.ph");
      } else if (type === "delivery") {
        await fill("lineDescription", tag);
        await fill("lineQuantity", "1");
        await fill("lineUnit", "unit");
        await selectFirstNamedAccount(form, "checkedBy");
        await selectFirstNamedAccount(form, "deliveredBy");
      } else if (type === "payment") {
        await fill("paymentParticulars", tag + "; no actual payment received");
        await fill("cashAmount", "1.00");
        await selectFirstNamedAccount(form, "receivedBy");
        await selectFirstNamedAccount(form, "verifiedBy");
      } else if (type === "po") {
        await fill("targetDeliveryDate", localDate(14));
        await fill("paymentTerms", "No purchase/payment obligation — QA only");
        await fill("lineDescription", tag);
        await fill("lineQuantity", "1");
        await fill("lineUnitPrice", "1.00");
        await selectFirstNamedAccount(form, "verifiedBy");
        await selectFirstNamedAccount(form, "approvedBy");
      }
      const values = await form.evaluate((element) =>
        Object.fromEntries(
          [
            "documentType",
            "documentStatus",
            "customerName",
            "referenceNumber",
            "remarks",
            "lineDescription",
            "lineQuantity",
            "lineUnitPrice",
            "lineUnit",
            "paymentParticulars",
            "cashAmount",
            "targetDeliveryDate",
          ].map((name) => {
            const field = element.querySelector('[name="' + name + '"]');
            return [name, field?.value || ""];
          }),
        ),
      );
      assert.equal(
        values.documentStatus,
        "draft",
        type + " QA record must be Draft",
      );
      assert.ok(values.customerName.includes(marker), type + " QA marker");
      assert.ok(values.remarks.includes(marker), type + " QA remarks marker");
    };

    const verifyPersisted = async ({
      type,
      documentId,
      documentNumber,
      revision,
      remarksMarker,
    }) => {
      const readPromise = rpcResponse(page, "tl03_document_read");
      await page.goto(BASE + "#/tradelink/drafts/edit/" + documentId, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      const response = await readPromise;
      assert.equal(response.status(), 200, type + " exact signed read");
      await page
        .locator("form[data-tradelink-draft-form]")
        .waitFor({ timeout: 45000 });
      const form = page.locator("form[data-tradelink-draft-form]");
      assert.equal(
        await form.locator('[name="documentType"]').last().inputValue(),
        type,
      );
      assert.equal(
        await form.locator('[name="documentNumber"]').inputValue(),
        documentNumber,
      );
      assert.equal(
        await form.locator('[name="documentStatus"]').inputValue(),
        "draft",
      );
      assert.ok(
        (await form.locator('[name="remarks"]').inputValue()).includes(
          remarksMarker,
        ),
      );
      const revisionText = await page
        .locator(".tl-reference-revision output")
        .innerText();
      assert.match(
        revisionText,
        new RegExp("^" + revision + "\\b"),
        type + " revision label",
      );
    };

    for (const module of modules) {
      const before = rpcEvents.length;
      const { form, save } = await resolveUserModule(module.type);
      const entry = {
        module: module.label,
        role: "User",
        canonicalBoard: true,
        formVisible: true,
        saveEnabled: true,
      };
      if (writeMode) {
        await fillQaDraft(module.type, form);
        const createPromise = rpcResponse(page, "tl03_document_create");
        const readPromise = rpcResponse(page, "tl03_document_read");
        const listPromise = rpcResponse(page, "tl03_documents_list");
        const boardPromise = rpcResponse(page, "tl03_board_projection");
        const allDocumentsPagePromise = rpcResponse(
          page,
          "tl03_documents_page",
        );
        writeAttempted = true;
        report.productionDataWriteAttempted = true;
        report.productionWriteOutcome = "ATTEMPTED_UNCONFIRMED";
        await save.click();
        const createResponse = await createPromise;
        assert.equal(
          createResponse.status(),
          200,
          module.label + " create RPC",
        );
        const receipt = one(await createResponse.json());
        assert.ok(
          receipt?.documentId && receipt?.boardItemId,
          module.label + " create receipt IDs",
        );
        assert.ok(
          receipt.documentNumber?.startsWith(module.prefix),
          module.label + " server number prefix",
        );
        assert.equal(receipt.revision, 1, module.label + " initial revision");
        assert.equal(
          receipt.state,
          "draft",
          module.label + " initial Draft state",
        );
        report.productionDataWritten = true;
        report.productionWriteOutcome = "CREATE_CONFIRMED_READBACK_PENDING";
        report.created.push({
          module: module.label,
          documentNumber: receipt.documentNumber,
          revision: 1,
          boardSynchronized: false,
          status: "CREATED_READBACK_PENDING",
        });
        const [
          readResponse,
          listResponse,
          boardResponse,
          allDocumentsPageResponse,
        ] = await Promise.all([
          readPromise,
          listPromise,
          boardPromise,
          allDocumentsPagePromise,
        ]);
        assert.equal(
          readResponse.status(),
          200,
          module.label + " persisted read",
        );
        assert.equal(
          listResponse.status(),
          200,
          module.label + " All Documents list",
        );
        assert.equal(
          boardResponse.status(),
          200,
          module.label + " Board projection",
        );
        assert.equal(
          allDocumentsPageResponse.status(),
          200,
          module.label + " All Documents page",
        );
        const record = one(await readResponse.json());
        const list = await listResponse.json();
        const allDocumentsPage = one(await allDocumentsPageResponse.json());
        const projection = one(await boardResponse.json());
        assert.equal(
          record?.id,
          receipt.documentId,
          module.label + " persisted record ID",
        );
        assert.equal(
          record?.board_item_id,
          receipt.boardItemId,
          module.label + " document/Board linkage",
        );
        assert.equal(
          record?.document_number,
          receipt.documentNumber,
          module.label + " persisted number",
        );
        assert.equal(
          record?.workflow_state,
          "draft",
          module.label + " persisted Draft state",
        );
        assert.equal(record?.revision, 1, module.label + " persisted revision");
        assert.ok(
          record?.content?.remarks?.includes(marker),
          module.label + " persisted QA marker",
        );
        assert.ok(
          Array.isArray(list) &&
            list.some(
              (row) =>
                row.documentId === receipt.documentId &&
                row.boardItemId === receipt.boardItemId &&
                row.documentNumber === receipt.documentNumber,
            ),
          module.label + " All Documents list row",
        );
        assert.ok(
          Array.isArray(allDocumentsPage?.rows) &&
            allDocumentsPage.rows.some(
              (row) =>
                row.documentId === receipt.documentId &&
                row.boardItemId === receipt.boardItemId &&
                row.documentNumber === receipt.documentNumber &&
                row.workflowState === "draft",
            ),
          module.label + " All Documents page row",
        );
        await page
          .getByText(receipt.documentNumber, { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 30000 });
        assert.equal(
          projection?.contract,
          "tradelink-board-projection-v1",
          module.label + " Board contract",
        );
        assert.equal(
          projection?.board?.id,
          BOARD_ID,
          module.label + " Board ID",
        );
        assert.equal(
          projection?.item?.id,
          receipt.boardItemId,
          module.label + " Board item ID",
        );
        assert.equal(
          projection?.item?.title,
          receipt.documentNumber,
          module.label + " Board item title",
        );
        entry.documentNumber = receipt.documentNumber;
        entry.revision = 1;
        entry.createReadListBoard = "PASS";
        report.created.at(-1).boardSynchronized = true;
        report.created.at(-1).status = "CREATED_VERIFIED";

        await verifyPersisted({
          type: module.type,
          documentId: receipt.documentId,
          documentNumber: receipt.documentNumber,
          revision: 1,
          remarksMarker: marker,
        });
        const reloadRead = rpcResponse(page, "tl03_document_read");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
        await reloadRead;
        await page
          .locator("form[data-tradelink-draft-form]")
          .waitFor({ timeout: 45000 });
        assert.equal(
          await page.locator('[name="documentNumber"]').inputValue(),
          receipt.documentNumber,
          module.label + " refresh/reopen number",
        );
        assert.equal(
          await page.locator('[name="documentStatus"]').inputValue(),
          "draft",
          module.label + " refresh/reopen state",
        );
        assert.ok(
          (await page.locator('[name="remarks"]').inputValue()).includes(
            marker,
          ),
          module.label + " refresh/reopen content",
        );

        const revisedMarker = marker + " — revision 2 refresh/reopen verified";
        await page.locator('[name="remarks"]').fill(revisedMarker);
        const updatePromise = rpcResponse(page, "tl03_document_save");
        const updatedReadPromise = rpcResponse(page, "tl03_document_read");
        const updatedListPromise = rpcResponse(page, "tl03_documents_list");
        const updatedBoardPromise = rpcResponse(page, "tl03_board_projection");
        const updatedDocumentsPagePromise = rpcResponse(
          page,
          "tl03_documents_page",
        );
        report.productionWriteOutcome = "UPDATE_ATTEMPTED_UNCONFIRMED";
        await page.locator('[data-action="tradelink-draft-submit"]').click();
        const updateResponse = await updatePromise;
        assert.equal(
          updateResponse.status(),
          200,
          module.label + " update RPC",
        );
        const updateReceipt = one(await updateResponse.json());
        assert.equal(
          updateReceipt?.documentId,
          receipt.documentId,
          module.label + " update document ID",
        );
        assert.equal(
          updateReceipt?.revision,
          2,
          module.label + " update revision",
        );
        report.created.at(-1).revision = 2;
        report.created.at(-1).status = "UPDATE_CONFIRMED_READBACK_PENDING";
        report.productionWriteOutcome = "UPDATE_CONFIRMED_READBACK_PENDING";
        const [
          updatedRead,
          updatedList,
          updatedBoard,
          updatedDocumentsPageResponse,
        ] = await Promise.all([
          updatedReadPromise,
          updatedListPromise,
          updatedBoardPromise,
          updatedDocumentsPagePromise,
        ]);
        assert.equal(
          updatedRead.status(),
          200,
          module.label + " updated exact read",
        );
        assert.equal(
          updatedList.status(),
          200,
          module.label + " updated All Documents list",
        );
        assert.equal(
          updatedBoard.status(),
          200,
          module.label + " updated Board projection",
        );
        assert.equal(
          updatedDocumentsPageResponse.status(),
          200,
          module.label + " updated All Documents page",
        );
        const revised = one(await updatedRead.json());
        const updatedDocumentsPage = one(
          await updatedDocumentsPageResponse.json(),
        );
        const updatedProjection = one(await updatedBoard.json());
        assert.equal(
          revised?.revision,
          2,
          module.label + " persisted revision two",
        );
        assert.equal(
          revised?.workflow_state,
          "draft",
          module.label + " updated Draft state",
        );
        assert.ok(
          revised?.content?.remarks?.includes(revisedMarker),
          module.label + " revised remarks",
        );
        assert.ok(
          Array.isArray(updatedDocumentsPage?.rows) &&
            updatedDocumentsPage.rows.some(
              (row) =>
                row.documentId === receipt.documentId &&
                row.revision === 2 &&
                row.workflowState === "draft",
            ),
          module.label + " updated All Documents page row",
        );
        assert.equal(
          updatedProjection?.item?.id,
          receipt.boardItemId,
          module.label + " stable Board item",
        );
        assert.equal(
          updatedProjection?.item?.title,
          receipt.documentNumber,
          module.label + " stable Board title",
        );
        await verifyPersisted({
          type: module.type,
          documentId: receipt.documentId,
          documentNumber: receipt.documentNumber,
          revision: 2,
          remarksMarker: revisedMarker,
        });
        const finalReloadRead = rpcResponse(page, "tl03_document_read");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
        await finalReloadRead;
        assert.equal(
          await page.locator('[name="documentNumber"]').inputValue(),
          receipt.documentNumber,
        );
        assert.equal(
          await page.locator('[name="documentStatus"]').inputValue(),
          "draft",
        );
        assert.ok(
          (await page.locator('[name="remarks"]').inputValue()).includes(
            revisedMarker,
          ),
        );
        entry.revision = 2;
        entry.refreshReopen = "PASS";
        entry.updatePersistence = "PASS";
        report.created.at(-1).revision = 2;
        report.created.at(-1).status = "UPDATED_VERIFIED";
        report.created.at(-1).boardSynchronized = true;
      }
      const newWrites = rpcEvents
        .slice(before)
        .filter((event) =>
          ["tl03_document_create", "tl03_document_save"].includes(event.rpc),
        );
      if (!writeMode)
        assert.equal(
          newWrites.length,
          0,
          module.label + " read-only mode must not write",
        );
      report.modules.push(entry);
    }
    assert.deepEqual(pageErrors, [], "No TradeLink browser runtime errors");
    report.status = writeMode ? "PASS" : "READY_FOR_APPROVED_QA_WRITES";
    if (writeMode)
      report.productionWriteOutcome =
        "SIX_MODULES_CREATE_UPDATE_REFRESH_REOPEN_VERIFIED";
  } catch (error) {
    report.status = writeAttempted ? "PARTIAL_OR_UNCERTAIN" : "BLOCKED";
    report.failures.push({
      name: error?.name || "Error",
      message:
        "Acceptance stopped; inspect the current signed application state before any retry.",
    });
    process.exitCode = 1;
  } finally {
    if (page && originalUrl) {
      await page
        .goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
        .catch(() => {});
    }
    console.log(JSON.stringify(report, null, 2));
  }
}
