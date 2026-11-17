/** Request-scoped manual double-entry accounting for the existing FRT voucher. */
import { ApiError } from "./session.js";

const amountPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const fail = (message, status = 400, code = "FRT_ACCOUNTING_INVALID") =>
  new ApiError(message, status, code);
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

export function parseFRTAccountingCents(value) {
  if (typeof value !== "string" || !amountPattern.test(value.trim()))
    return null;
  const [whole, fraction = ""] = value.trim().split(".");
  try {
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
  } catch {
    return null;
  }
}

export function formatFRTAccountingCents(value) {
  const cents = BigInt(value);
  const whole = cents / 100n,
    fraction = String(cents % 100n).padStart(2, "0");
  return (
    "₱" +
    Number(whole).toLocaleString("en-PH", { maximumFractionDigits: 0 }) +
    "." +
    fraction
  );
}

const inputAmount = (value) => {
  const cents =
    typeof value === "bigint"
      ? value
      : parseFRTAccountingCents(String(value ?? ""));
  if (cents === null) throw new TypeError("Invalid accounting amount");
  const exact = BigInt(cents);
  return (
    (exact / 100n).toString() + "." + String(exact % 100n).padStart(2, "0")
  );
};

export function projectFRTAccountingSnapshot(raw, { expectedTotal } = {}) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 0 ||
    !Array.isArray(raw.lines) ||
    raw.lines.length > 100
  )
    return null;
  const requestCents = parseFRTAccountingCents(String(expectedTotal ?? ""));
  if (requestCents === null) return null;
  let debit = 0,
    credit = 0;
  const lines = [];
  for (let index = 0; index < raw.lines.length; index++) {
    const item = raw.lines[index];
    if (
      !item ||
      typeof item !== "object" ||
      (item.id !== undefined && typeof item.id !== "string") ||
      item.lineNumber !== index + 1 ||
      typeof item.accountCode !== "string" ||
      item.accountCode.trim().length < 1 ||
      item.accountCode.length > 80 ||
      typeof item.accountName !== "string" ||
      item.accountName.trim().length < 1 ||
      item.accountName.length > 180 ||
      typeof item.description !== "string" ||
      item.description.length > 500 ||
      typeof item.debit !== "string" ||
      typeof item.credit !== "string"
    )
      return null;
    const debitCents = parseFRTAccountingCents(item.debit),
      creditCents = parseFRTAccountingCents(item.credit);
    if (
      debitCents === null ||
      creditCents === null ||
      debitCents > 0 === creditCents > 0
    )
      return null;
    debit += debitCents;
    credit += creditCents;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit))
      return null;
    lines.push({
      id: item.id || null,
      lineNumber: item.lineNumber,
      accountCode: item.accountCode.trim(),
      accountName: item.accountName.trim(),
      description: item.description,
      debit: inputAmount(item.debit),
      credit: inputAmount(item.credit),
      debitCents,
      creditCents,
    });
  }
  const reportedDebit = parseFRTAccountingCents(String(raw.debitTotal ?? ""));
  const reportedCredit = parseFRTAccountingCents(String(raw.creditTotal ?? ""));
  const requestTotalCents = Number(raw.requestTotalCents);
  const balanced =
    lines.length >= 2 && debit === credit && debit === requestCents;
  if (
    reportedDebit !== debit ||
    reportedCredit !== credit ||
    !Number.isSafeInteger(requestTotalCents) ||
    requestTotalCents !== requestCents ||
    raw.balanced !== balanced
  )
    return null;
  return {
    revision: raw.revision,
    lines,
    debitCents: debit,
    creditCents: credit,
    requestTotalCents: requestCents,
    balanced,
    debitTotal: inputAmount(BigInt(debit)),
    creditTotal: inputAmount(BigInt(credit)),
  };
}

export function validateFRTAccountingLines(lines, expectedTotal) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100)
    return {
      valid: false,
      message: "Add at least two accounting lines (maximum 100).",
    };
  const expected = parseFRTAccountingCents(String(expectedTotal ?? ""));
  if (expected === null)
    return { valid: false, message: "The fund request amount is invalid." };
  let debit = 0,
    credit = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (
      !line ||
      typeof line.accountCode !== "string" ||
      !line.accountCode.trim() ||
      line.accountCode.trim().length > 80 ||
      typeof line.accountName !== "string" ||
      !line.accountName.trim() ||
      line.accountName.trim().length > 180 ||
      typeof line.description !== "string" ||
      line.description.length > 500
    )
      return {
        valid: false,
        message:
          "Line " +
          (index + 1) +
          " requires an account code and account name. Description limit: 500 characters.",
      };
    const d = parseFRTAccountingCents(String(line.debit ?? "")),
      c = parseFRTAccountingCents(String(line.credit ?? ""));
    if (d === null || c === null)
      return {
        valid: false,
        message:
          "Line " +
          (index + 1) +
          " must contain non-negative amounts with at most two decimal places.",
      };
    if (d > 0 === c > 0)
      return {
        valid: false,
        message:
          "Line " +
          (index + 1) +
          " must contain a positive debit OR a positive credit.",
      };
    debit += d;
    credit += c;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit))
      return {
        valid: false,
        message: "Accounting totals exceed the supported amount.",
      };
  }
  if (debit !== credit)
    return {
      valid: false,
      message:
        "Debits and credits do not balance. Difference: " +
        formatFRTAccountingCents(Math.abs(debit - credit)) +
        ".",
    };
  if (debit !== expected)
    return {
      valid: false,
      message:
        "Debit and credit totals must each equal the request amount of " +
        formatFRTAccountingCents(expected) +
        ".",
    };
  return { valid: true, debitCents: debit, creditCents: credit };
}

export async function saveFRTAccountingLines({
  api,
  workspaceId,
  requestId,
  expectedRevision = 0,
  lines,
  expectedTotal,
} = {}) {
  if (
    !api ||
    !workspaceId ||
    !requestId ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  )
    throw fail("The FRT accounting request context is invalid.", 409);
  const validation = validateFRTAccountingLines(lines, expectedTotal);
  if (!validation.valid) throw fail(validation.message);
  const payload = lines.map((line) => ({
    accountCode: line.accountCode.trim(),
    accountName: line.accountName.trim(),
    description: line.description.trim(),
    debitCents: parseFRTAccountingCents(String(line.debit)),
    creditCents: parseFRTAccountingCents(String(line.credit)),
  }));
  const raw = await api.rpc("frt_save_request_accounting_lines", {
    p_workspace_id: workspaceId,
    p_request_id: requestId,
    p_expected_revision: expectedRevision,
    p_lines: payload,
  });
  const saved = projectFRTAccountingSnapshot(raw, { expectedTotal });
  if (!saved || !saved.balanced || saved.revision !== expectedRevision + 1)
    throw fail(
      "Accounting save was not confirmed by a balanced server readback. Reload the voucher before retrying.",
      409,
      "FRT_ACCOUNTING_READBACK_INVALID",
    );
  return saved;
}

export function renderFRTAccountingRow(line = {}, index = 0) {
  return (
    '<tr data-frt-accounting-row><td class="frt-accounting-line-number">' +
    (index + 1) +
    "</td>" +
    '<td><input id="frt-accounting-' +
    (index + 1) +
    '-account-code" aria-label="Line ' +
    (index + 1) +
    ' account code" data-accounting-field="accountCode" maxlength="80" value="' +
    escapeHtml(line.accountCode || "") +
    '" placeholder="Account code"></td>' +
    '<td><input id="frt-accounting-' +
    (index + 1) +
    '-account-name" aria-label="Line ' +
    (index + 1) +
    ' account name" data-accounting-field="accountName" maxlength="180" value="' +
    escapeHtml(line.accountName || "") +
    '" placeholder="Account name"></td>' +
    '<td><input id="frt-accounting-' +
    (index + 1) +
    '-description" aria-label="Line ' +
    (index + 1) +
    ' description" data-accounting-field="description" maxlength="500" value="' +
    escapeHtml(line.description || "") +
    '" placeholder="Description"></td>' +
    '<td><input id="frt-accounting-' +
    (index + 1) +
    '-debit" aria-label="Line ' +
    (index + 1) +
    ' debit" data-accounting-field="debit" inputmode="decimal" value="' +
    escapeHtml(line.debit || "") +
    '" placeholder="0.00"></td>' +
    '<td><input id="frt-accounting-' +
    (index + 1) +
    '-credit" aria-label="Line ' +
    (index + 1) +
    ' credit" data-accounting-field="credit" inputmode="decimal" value="' +
    escapeHtml(line.credit || "") +
    '" placeholder="0.00"></td>' +
    '<td><button type="button" class="secondary" data-frt-accounting-remove aria-label="Remove accounting line ' +
    (index + 1) +
    '">Remove</button></td></tr>'
  );
}

export function renderFRTAccountingEditor(
  accounting,
  totalAmount,
  { workspaceId = "", companyCode = "" } = {},
) {
  const lines = accounting?.lines?.length ? accounting.lines : [{}, {}];
  const templates = loadFRTAccountingTemplates(workspaceId, companyCode);
  const options = templates
    .map(
      (item) =>
        '<option value="' +
        escapeHtml(item.id) +
        '">' +
        escapeHtml(item.name) +
        "</option>",
    )
    .join("");
  return (
    '<section class="frt-accounting-editor" data-frt-accounting-editor data-revision="' +
    (accounting?.revision || 0) +
    '" data-request-total="' +
    escapeHtml(totalAmount) +
    '" data-workspace-id="' +
    escapeHtml(workspaceId) +
    '" data-company-code="' +
    escapeHtml(companyCode) +
    '">' +
    '<header class="frt-accounting-editor-heading"><div><h3>Manual Debit / Credit Accounting</h3><p>Enter the actual account codes and names supplied by your accounting team. No chart-of-accounts mapping is prefilled.</p></div><span class="frt-accounting-state" data-frt-accounting-state role="status">' +
    (accounting?.balanced ? "Balanced" : "Not balanced") +
    "</span></header>" +
    '<div class="frt-accounting-template-tools"><label>Reusable template<select id="frt-accounting-template-select" data-frt-accounting-template-select><option value="">Select a saved template</option>' +
    options +
    '</select></label><label>Template name<input id="frt-accounting-template-name" data-frt-accounting-template-name maxlength="80" placeholder="Name this manual template"></label><button type="button" class="secondary" data-frt-accounting-template-save>Save Template</button></div>' +
    '<div class="frt-accounting-table-wrap"><table class="frt-accounting-table"><thead><tr><th>#</th><th>Account Code</th><th>Account Name</th><th>Description</th><th>Debit (PHP)</th><th>Credit (PHP)</th><th></th></tr></thead><tbody data-frt-accounting-lines>' +
    lines.map(renderFRTAccountingRow).join("") +
    '</tbody><tfoot><tr><th colspan="4">Totals</th><th data-frt-accounting-debit-total>₱0.00</th><th data-frt-accounting-credit-total>₱0.00</th><th></th></tr></tfoot></table></div>' +
    '<div class="frt-accounting-editor-footer"><button type="button" class="secondary" data-frt-accounting-add>Add Accounting Line</button><div><span data-frt-accounting-difference>Difference: ₱0.00</span><strong>Request amount: ' +
    formatFRTAccountingCents(
      parseFRTAccountingCents(String(totalAmount)) || 0,
    ) +
    '</strong><button type="button" class="primary" data-frt-accounting-save>Save Accounting Entries</button></div></div>' +
    '<p class="frt-accounting-status" data-frt-accounting-status role="status" aria-live="polite">Accounting entries are stored with this fund request. Saving updates the existing request; it does not allocate another voucher number.</p></section>'
  );
}

export function collectFRTAccountingLines(root) {
  return [...(root?.querySelectorAll("[data-frt-accounting-row]") || [])].map(
    (row) => ({
      accountCode:
        row.querySelector('[data-accounting-field="accountCode"]')?.value || "",
      accountName:
        row.querySelector('[data-accounting-field="accountName"]')?.value || "",
      description:
        row.querySelector('[data-accounting-field="description"]')?.value || "",
      debit: row.querySelector('[data-accounting-field="debit"]')?.value || "0",
      credit:
        row.querySelector('[data-accounting-field="credit"]')?.value || "0",
    }),
  );
}

const templateKey = (workspaceId, companyCode) =>
  "apsyntra:frt:accounting-templates:" + workspaceId + ":" + companyCode;
export function loadFRTAccountingTemplates(
  workspaceId,
  companyCode,
  storage = globalThis.localStorage,
) {
  if (!workspaceId || !companyCode || !storage) return [];
  try {
    const raw = JSON.parse(
      storage.getItem(templateKey(workspaceId, companyCode)) || "[]",
    );
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Array.isArray(item.lines) &&
        item.lines.length >= 2 &&
        item.lines.length <= 100 &&
        item.lines.every(
          (line) =>
            typeof line.accountCode === "string" &&
            typeof line.accountName === "string" &&
            typeof line.description === "string" &&
            ["debit", "credit"].includes(line.side),
        ),
    );
  } catch {
    return [];
  }
}
export function saveFRTAccountingTemplate({
  workspaceId,
  companyCode,
  name,
  lines,
  storage = globalThis.localStorage,
} = {}) {
  const title = String(name || "").trim();
  if (
    !storage ||
    !workspaceId ||
    !companyCode ||
    title.length < 2 ||
    title.length > 80 ||
    !Array.isArray(lines) ||
    lines.length < 2 ||
    lines.length > 100
  )
    throw fail("Enter a template name and at least two accounting lines.");
  const template = {
    id: globalThis.crypto?.randomUUID?.() || "template-" + Date.now(),
    name: title,
    lines: lines.map((line) => ({
      accountCode: String(line.accountCode || "").trim(),
      accountName: String(line.accountName || "").trim(),
      description: String(line.description || "").trim(),
      side:
        parseFRTAccountingCents(String(line.debit || "")) > 0
          ? "debit"
          : "credit",
    })),
  };
  if (
    template.lines.some(
      (line) =>
        !line.accountCode ||
        !line.accountName ||
        line.accountCode.length > 80 ||
        line.accountName.length > 180 ||
        line.description.length > 500,
    )
  )
    throw fail(
      "Every template line requires an account code and account name.",
    );
  const existing = loadFRTAccountingTemplates(
    workspaceId,
    companyCode,
    storage,
  ).filter((item) => item.name.toLowerCase() !== title.toLowerCase());
  existing.push(template);
  try {
    storage.setItem(
      templateKey(workspaceId, companyCode),
      JSON.stringify(existing),
    );
  } catch {
    throw fail(
      "The accounting template could not be stored in this browser.",
      507,
    );
  }
  return template;
}

export function applyFRTAccountingTemplate(template) {
  if (!template || !Array.isArray(template.lines))
    throw fail("Select a valid accounting template.");
  return template.lines.map((line) => ({
    accountCode: line.accountCode,
    accountName: line.accountName,
    description: line.description,
    debit: line.side === "debit" ? "0.00" : "",
    credit: line.side === "credit" ? "0.00" : "",
  }));
}

export function mountFRTAccountingEditor({
  host,
  api,
  workspaceId,
  requestId,
  getVoucher,
  onSaved,
} = {}) {
  if (!host) return;
  let busy = false;
  const editor = () => host.querySelector("[data-frt-accounting-editor]");
  const setStatus = (message, isError = false) => {
    const node = editor()?.querySelector("[data-frt-accounting-status]");
    if (node) {
      node.textContent = message;
      node.setAttribute("role", isError ? "alert" : "status");
    }
  };
  const update = () => {
    const root = editor();
    if (!root) return;
    const voucher = getVoucher?.(),
      lines = collectFRTAccountingLines(root),
      expected = voucher?.totalAmount;
    const validation = validateFRTAccountingLines(lines, expected);
    root.querySelectorAll("[data-frt-accounting-row]").forEach((row, index) => {
      const number = index + 1;
      row.querySelector(".frt-accounting-line-number").textContent =
        String(number);
      for (const field of [
        "accountCode",
        "accountName",
        "description",
        "debit",
        "credit",
      ]) {
        const input = row.querySelector(
          '[data-accounting-field="' + field + '"]',
        );
        if (input) {
          input.id =
            "frt-accounting-" +
            number +
            "-" +
            field.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase());
          const label =
            field === "accountCode"
              ? "account code"
              : field === "accountName"
                ? "account name"
                : field;
          input.setAttribute("aria-label", "Line " + number + " " + label);
        }
      }
    });
    const persisted = voucher?.accounting?.lines || [];
    const dirty =
      lines.length !== persisted.length ||
      lines.some((line, index) => {
        const saved = persisted[index];
        return (
          !saved ||
          line.accountCode.trim() !== saved.accountCode ||
          line.accountName.trim() !== saved.accountName ||
          line.description.trim() !== (saved.description || "") ||
          parseFRTAccountingCents(line.debit) !==
            parseFRTAccountingCents(saved.debit) ||
          parseFRTAccountingCents(line.credit) !==
            parseFRTAccountingCents(saved.credit)
        );
      });
    const ready = validation.valid && !dirty;
    let debit = 0,
      credit = 0;
    for (const line of lines) {
      const d = parseFRTAccountingCents(String(line.debit || "0")),
        c = parseFRTAccountingCents(String(line.credit || "0"));
      if (d !== null) debit += d;
      if (c !== null) credit += c;
    }
    root.querySelector("[data-frt-accounting-debit-total]").textContent =
      formatFRTAccountingCents(debit);
    root.querySelector("[data-frt-accounting-credit-total]").textContent =
      formatFRTAccountingCents(credit);
    const expectedCents = parseFRTAccountingCents(String(expected ?? ""));
    const requestVariance =
      expectedCents === null
        ? 0
        : Math.max(
            Math.abs(debit - expectedCents),
            Math.abs(credit - expectedCents),
          );
    root.querySelector("[data-frt-accounting-difference]").textContent =
      "Debit/credit difference: " +
      formatFRTAccountingCents(Math.abs(debit - credit)) +
      " · Request variance: " +
      formatFRTAccountingCents(requestVariance);
    const state = root.querySelector("[data-frt-accounting-state]");
    state.textContent = ready
      ? "Balanced"
      : validation.valid
        ? "Unsaved accounting changes"
        : validation.message;
    state.classList.toggle("is-balanced", ready);
    state.classList.toggle("is-unbalanced", !ready);
    root.dataset.balanced = String(ready);
    const save = root.querySelector("[data-frt-accounting-save]");
    if (save) save.disabled = busy || !validation.valid || !dirty;
    host
      .querySelectorAll(
        "[data-frt-voucher-preview],[data-frt-voucher-download],[data-frt-voucher-print],[data-frt-voucher-reprint]",
      )
      .forEach((button) => {
        button.disabled = busy || !ready;
        button.title = ready
          ? ""
          : "Save balanced accounting entries before generating the voucher PDF.";
      });
  };
  const replaceRows = (lines) => {
    const root = editor();
    if (!root) return;
    root.querySelector("[data-frt-accounting-lines]").innerHTML = lines
      .map(renderFRTAccountingRow)
      .join("");
    root.querySelectorAll("[data-frt-accounting-row]").forEach((row, index) => {
      row.querySelector(".frt-accounting-line-number").textContent = String(
        index + 1,
      );
    });
    update();
  };
  host.addEventListener("input", (event) => {
    if (event.target.closest("[data-frt-accounting-editor]")) update();
  });
  host.addEventListener("change", (event) => {
    const select = event.target.closest(
      "[data-frt-accounting-template-select]",
    );
    if (!select || !select.value) return;
    const root = editor();
    if (!root) return;
    const templates = loadFRTAccountingTemplates(
      root.dataset.workspaceId,
      root.dataset.companyCode,
    );
    const template = templates.find((item) => item.id === select.value);
    if (template) {
      replaceRows(applyFRTAccountingTemplate(template));
      setStatus(
        "Template applied. Enter the actual debit and credit amounts, then save.",
      );
    }
    select.value = "";
  });
  host.addEventListener("click", async (event) => {
    const add = event.target.closest("[data-frt-accounting-add]");
    if (add) {
      const root = editor(),
        body = root?.querySelector("[data-frt-accounting-lines]");
      if (!body || body.children.length >= 100) return;
      body.insertAdjacentHTML(
        "beforeend",
        renderFRTAccountingRow({}, body.children.length),
      );
      update();
      return;
    }
    const remove = event.target.closest("[data-frt-accounting-remove]");
    if (remove) {
      const row = remove.closest("[data-frt-accounting-row]");
      row?.remove();
      editor()
        ?.querySelectorAll("[data-frt-accounting-row]")
        .forEach((node, index) => {
          node.querySelector(".frt-accounting-line-number").textContent =
            String(index + 1);
        });
      update();
      return;
    }
    const saveTemplate = event.target.closest(
      "[data-frt-accounting-template-save]",
    );
    if (saveTemplate) {
      const root = editor();
      if (!root) return;
      try {
        const template = saveFRTAccountingTemplate({
          workspaceId: root.dataset.workspaceId,
          companyCode: root.dataset.companyCode,
          name: root.querySelector("[data-frt-accounting-template-name]").value,
          lines: collectFRTAccountingLines(root),
        });
        root.querySelector("[data-frt-accounting-template-name]").value = "";
        const select = root.querySelector(
          "[data-frt-accounting-template-select]",
        );
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name;
        select.append(option);
        setStatus(
          "Reusable template saved in this browser. Amounts are not stored in the template.",
        );
      } catch (error) {
        setStatus(error.message || "Template could not be saved.", true);
      }
      return;
    }
    const save = event.target.closest("[data-frt-accounting-save]");
    if (!save || busy) return;
    event.preventDefault();
    const root = editor();
    if (!root) return;
    const voucher = getVoucher?.(),
      lines = collectFRTAccountingLines(root);
    const validation = validateFRTAccountingLines(lines, voucher?.totalAmount);
    if (!validation.valid) {
      setStatus(validation.message, true);
      update();
      return;
    }
    busy = true;
    update();
    setStatus("Saving accounting entries…");
    try {
      await saveFRTAccountingLines({
        api,
        workspaceId,
        requestId,
        expectedRevision: voucher.accounting.revision,
        lines,
        expectedTotal: voucher.totalAmount,
      });
      const fresh = await onSaved?.();
      if (!fresh?.accounting?.balanced)
        throw fail(
          "Saved accounting lines could not be read back from the voucher projection.",
          409,
          "FRT_ACCOUNTING_READBACK_INVALID",
        );
      setStatus(
        "Accounting entries saved and verified. Debit, credit and request totals balance exactly.",
      );
    } catch (error) {
      setStatus(
        error?.message || "Accounting entries could not be saved.",
        true,
      );
    } finally {
      busy = false;
      update();
    }
  });
  update();
}
