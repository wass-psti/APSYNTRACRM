import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.FRT_BROWSER_BASE_URL || "http://127.0.0.1:5173/";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  "/Applications/Chromium.app/Contents/MacOS/Chromium";
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const ui = await import("/frontend/frt-voucher-document.js");
    const accounting = await import("/frontend/frt-accounting.js");
    const pdf = await import("/frontend/frt-voucher-pdf.js");
    const requestId = "11111111-1111-4111-8111-111111111111";
    const workspaceId = "00000000-0000-4000-8000-000000000001";
    const items = Array.from({ length: 90 }, (_, index) => ({
      category: index % 2 ? "Printing" : "Office supplies",
      description:
        "Line " +
        (index + 1) +
        " — supporting expense description for PDF pagination and repeated header verification.",
      amount: "100.00",
    }));
    let voucher = {
      workspaceId,
      requestId,
      company: {
        code: "WASS",
        name: "Watchdog Automation Sales & Services",
        address: "Registered address, Mandaue City",
        phone: "+63 32 555 0100",
        email: "finance@example.test",
      },
      voucherNumber: "DV-WASS-202611-001",
      voucherDate: "2026-11-16T02:00:00Z",
      requestReference: { orderIntakeNo: "OI-2026-001", checkNo: "CHK-1001" },
      title: "Office supplies",
      department: "Operations",
      fundSource: "Operating Fund",
      payee: "Supplier & Sons",
      payeeBank: "Example Bank",
      dateNeeded: "2026-11-20",
      description: "Voucher generated from a persisted request fixture.",
      totalAmount: "9000.00",
      requestStatus: "DONE",
      liquidationStatus: "NOT_SUBMITTED",
      preparedBy: "Prepared User",
      preparedAt: "2026-11-16T02:00:00Z",
      financeApproval: {
        approvedBy: "Finance User",
        approvedAt: "2026-11-16T03:00:00Z",
      },
      gmVerification: {
        verifiedBy: "GM User",
        verifiedAt: "2026-11-16T04:00:00Z",
        reference: "GM-REF-01",
      },
      items,
      reconciliation: {
        itemsTotal: "9000.00",
        totalAmount: "9000.00",
        balanced: true,
      },
      accounting: {
        revision: 0,
        lines: [],
        debitTotal: "0.00",
        creditTotal: "0.00",
        debitCents: 0,
        creditCents: 0,
        requestTotalCents: 900000,
        balanced: false,
      },
      bankExecution: null,
      bankExecutionError: "No bank execution has been recorded.",
    };
    document.body.innerHTML =
      '<div class="modal-backdrop"><section class="modal frt-collab-panel"><div class="frt-collab-panel-body">' +
      ui.renderFRTVoucherDocument(voucher) +
      "</div></section></div>";
    const host = document.querySelector(".frt-collab-panel-body");
    const persisted = {
      revision: 1,
      lines: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          lineNumber: 1,
          accountCode: "1010",
          accountName: "Cash / Bank",
          description: "Manual debit",
          debit: "9000.00",
          credit: "0.00",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          lineNumber: 2,
          accountCode: "2010",
          accountName: "Accounts Payable",
          description: "Manual credit",
          debit: "0.00",
          credit: "9000.00",
        },
      ],
      debitTotal: "9000.00",
      creditTotal: "9000.00",
      debitCents: 900000,
      creditCents: 900000,
      requestTotalCents: 900000,
      balanced: true,
    };
    let rpcCalls = 0;
    accounting.mountFRTAccountingEditor({
      host,
      workspaceId,
      requestId,
      api: {
        rpc: async (name, args) => {
          if (
            name !== "frt_save_request_accounting_lines" ||
            args.p_expected_revision !== 0
          )
            throw new Error("Unexpected accounting RPC contract");
          rpcCalls++;
          return persisted;
        },
      },
      getVoucher: () => voucher,
      onSaved: async () => {
        voucher = {
          ...voucher,
          accounting: {
            revision: 1,
            lines: persisted.lines.map((line) => ({ ...line })),
            debitTotal: "9000.00",
            creditTotal: "9000.00",
            debitCents: 900000,
            creditCents: 900000,
            requestTotalCents: 900000,
            balanced: true,
          },
        };
        host.innerHTML = ui.renderFRTVoucherDocument(voucher);
        return voucher;
      },
    });
    host.querySelector("[data-frt-accounting-add]").click();
    if (host.querySelectorAll("[data-frt-accounting-row]").length !== 3)
      throw new Error("Accounting editor did not add a line");
    host.querySelectorAll("[data-frt-accounting-remove]")[2].click();
    if (host.querySelectorAll("[data-frt-accounting-row]").length !== 2)
      throw new Error("Accounting editor did not remove a line");
    const rows = [...host.querySelectorAll("[data-frt-accounting-row]")];
    const set = (row, name, value) => {
      const input = row.querySelector('[data-accounting-field="' + name + '"]');
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set(rows[0], "accountCode", "1010");
    set(rows[0], "accountName", "Cash / Bank");
    set(rows[0], "description", "Manual debit");
    set(rows[0], "debit", "9000.00");
    set(rows[0], "credit", "0.00");
    set(rows[1], "accountCode", "2010");
    set(rows[1], "accountName", "Accounts Payable");
    set(rows[1], "description", "Manual credit");
    set(rows[1], "debit", "0.00");
    set(rows[1], "credit", "9000.00");
    const beforeSave = {
      saveEnabled: !host.querySelector("[data-frt-accounting-save]").disabled,
      previewDisabled: host.querySelector("[data-frt-voucher-preview]")
        .disabled,
      debitTotal: host.querySelector("[data-frt-accounting-debit-total]")
        .textContent,
      creditTotal: host.querySelector("[data-frt-accounting-credit-total]")
        .textContent,
    };
    if (!beforeSave.saveEnabled || !beforeSave.previewDisabled)
      throw new Error(
        "Editor did not enable save and keep PDF output disabled before persistence",
      );
    host.querySelector("[data-frt-accounting-save]").click();
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const status =
          host.querySelector("[data-frt-accounting-status]")?.textContent || "";
        if (status.includes("saved and verified")) return resolve();
        if (Date.now() - started > 5000)
          return reject(
            new Error("Accounting editor save did not finish: " + status),
          );
        setTimeout(check, 25);
      };
      check();
    });
    if (
      rpcCalls !== 1 ||
      voucher.accounting.revision !== 1 ||
      host.querySelector("[data-frt-voucher-preview]").disabled
    )
      throw new Error(
        "Persisted accounting editor readback did not activate voucher output",
      );
    const output = await pdf.createFRTVoucherPdfBlob(voucher);
    const bytes = new Uint8Array(await output.arrayBuffer());
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 8));
    const pageCount = (
      new TextDecoder("latin1").decode(bytes).match(/\/Type\s*\/Page\b/g) || []
    ).length;
    const previewUrl = URL.createObjectURL(output);
    const previewHost = host.querySelector("[data-frt-voucher-pdf-preview]");
    previewHost.innerHTML =
      '<iframe data-frt-voucher-pdf-frame title="Voucher PDF preview" src="' +
      previewUrl +
      '"></iframe>';
    host
      .querySelector("[data-frt-voucher-download]")
      .addEventListener("click", () => pdf.downloadFRTVoucherPdf(voucher));
    host
      .querySelector("[data-frt-voucher-print]")
      .addEventListener("click", async () => {
        const printWindow = window.open("about:blank", "_blank");
        await pdf.printFRTVoucherPdf(voucher, printWindow);
      });
    host
      .querySelector("[data-frt-voucher-reprint]")
      .addEventListener("click", async () => {
        const printWindow = window.open("about:blank", "_blank");
        await pdf.printFRTVoucherPdf({ ...voucher }, printWindow);
      });
    const css = {
      paperRadius: getComputedStyle(host.querySelector(".frt-voucher-paper"))
        .borderRadius,
      expenseSubtotalRows: host.querySelectorAll(".frt-voucher-subtotal")
        .length,
      accountingRows: host.querySelectorAll(".frt-voucher-accounting tbody tr")
        .length,
      actions: host.querySelectorAll(".frt-voucher-toolbar button").length,
      frameSrc: host.querySelector("[data-frt-voucher-pdf-frame]").src,
      accountingState: host.querySelector("[data-frt-accounting-state]")
        .textContent,
    };
    return {
      header,
      pdfBytes: bytes.length,
      pageCount,
      css,
      previewUrl,
      beforeSave,
      rpcCalls,
      accountingBalanced: voucher.accounting.balanced,
      accountingDebit: voucher.accounting.debitTotal,
      accountingCredit: voucher.accounting.creditTotal,
    };
  });
  assert.equal(result.header, "%PDF-1.3");
  assert.ok(result.pdfBytes > 12000);
  assert.ok(result.pageCount >= 2);
  assert.equal(result.css.paperRadius, "12px");
  assert.equal(result.css.expenseSubtotalRows, 2);
  assert.equal(result.css.accountingRows, 2);
  assert.equal(result.css.actions, 4);
  assert.match(result.css.frameSrc, /^blob:/);
  await page.waitForFunction(
    () => {
      const frame = document.querySelector("[data-frt-voucher-pdf-frame]");
      try {
        return !!frame?.contentWindow?.location?.href?.startsWith("blob:");
      } catch {
        return false;
      }
    },
    { timeout: 5000 },
  );
  // The browser's built-in PDF viewer retains a large renderer; verify the blob frame then release it before print-popup tests.
  await page.evaluate(() =>
    document.querySelector("[data-frt-voucher-pdf-frame]")?.remove(),
  );
  assert.equal(result.css.accountingState, "Balanced");
  assert.equal(result.beforeSave.saveEnabled, true);
  assert.equal(result.beforeSave.previewDisabled, true);
  assert.equal(result.beforeSave.debitTotal, "₱9,000.00");
  assert.equal(result.beforeSave.creditTotal, "₱9,000.00");
  assert.equal(result.rpcCalls, 1);
  assert.equal(result.accountingBalanced, true);
  assert.equal(result.accountingDebit, "9000.00");
  assert.equal(result.accountingCredit, "9000.00");
  const downloadPromise = page.waitForEvent("download");
  await page.click("[data-frt-voucher-download]");
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  const fs = await import("node:fs/promises");
  const downloaded = await fs.readFile(downloadedPath);
  assert.equal(downloaded.subarray(0, 8).toString(), "%PDF-1.3");
  assert.match(download.suggestedFilename(), /DV-WASS-202611-001\.pdf$/);
  const printPromise = page.waitForEvent("popup");
  await page.click("[data-frt-voucher-print]");
  const printPopup = await printPromise;
  await printPopup.waitForURL(/^blob:/, { timeout: 5000 });
  const printEvidence = await printPopup.evaluate(() => ({
    url: location.href,
    body: document.body?.innerHTML?.slice(0, 1200) || "",
    frames: document.querySelectorAll("iframe,embed,object").length,
  }));
  assert.match(printEvidence.url, /^blob:/);
  const reprintPromise = page.waitForEvent("popup");
  await page.click("[data-frt-voucher-reprint]");
  const reprintPopup = await reprintPromise;
  await reprintPopup.waitForURL(/^blob:/, { timeout: 5000 });
  const reprintEvidence = await reprintPopup.evaluate(() => ({
    url: location.href,
    body: document.body?.innerHTML?.slice(0, 1200) || "",
    frames: document.querySelectorAll("iframe,embed,object").length,
  }));
  assert.match(reprintEvidence.url, /^blob:/);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        browser: "Chromium",
        pdfHeader: result.header,
        pdfBytes: result.pdfBytes,
        pageCount: result.pageCount,
        expenseSubtotalRows: result.css.expenseSubtotalRows,
        accountingRows: result.css.accountingRows,
        accountingEditorSave: true,
        exactCentBalance: true,
        actionControls: result.css.actions,
        pdfPreviewBlob: true,
        pdfDownload: true,
        printPopup: printEvidence,
        reprintPopup: reprintEvidence,
        cssLoaded: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
