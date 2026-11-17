import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFRTAccountingCents,
  formatFRTAccountingCents,
  projectFRTAccountingSnapshot,
  validateFRTAccountingLines,
  saveFRTAccountingLines,
  renderFRTAccountingEditor,
  loadFRTAccountingTemplates,
  saveFRTAccountingTemplate,
  applyFRTAccountingTemplate,
} from "../frt-accounting.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const requestId = "11111111-1111-4111-8111-111111111111";
const lines = () => [
  {
    accountCode: "1010",
    accountName: "Cash / Bank",
    description: "Manual debit",
    debit: "100.25",
    credit: "0.00",
  },
  {
    accountCode: "2010",
    accountName: "Accounts Payable",
    description: "Manual credit",
    debit: "0.00",
    credit: "100.25",
  },
];
const snapshot = (overrides = {}) => ({
  revision: 1,
  lines: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      lineNumber: 1,
      accountCode: "1010",
      accountName: "Cash / Bank",
      description: "Manual debit",
      debit: "100.25",
      credit: "0.00",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      lineNumber: 2,
      accountCode: "2010",
      accountName: "Accounts Payable",
      description: "Manual credit",
      debit: "0.00",
      credit: "100.25",
    },
  ],
  debitTotal: "100.25",
  creditTotal: "100.25",
  debitCents: 10025,
  creditCents: 10025,
  requestTotalCents: 10025,
  balanced: true,
  ...overrides,
});

test("accounting amounts use integer cents and reject signs, exponent notation and excess precision", () => {
  assert.equal(parseFRTAccountingCents("100.25"), 10025);
  assert.equal(parseFRTAccountingCents("0.1"), 10);
  assert.equal(parseFRTAccountingCents("0.00"), 0);
  assert.equal(parseFRTAccountingCents("-1.00"), null);
  assert.equal(parseFRTAccountingCents("1.001"), null);
  assert.equal(parseFRTAccountingCents("1e2"), null);
  assert.equal(formatFRTAccountingCents(10025), "₱100.25");
});

test("double-entry validation requires positive one-sided lines and exact request reconciliation", () => {
  assert.deepEqual(validateFRTAccountingLines(lines(), "100.25"), {
    valid: true,
    debitCents: 10025,
    creditCents: 10025,
  });
  assert.match(
    validateFRTAccountingLines(lines(), "100.24").message,
    /must each equal the request amount/,
  );
  const unbalanced = lines();
  unbalanced[1].credit = "100.24";
  assert.match(
    validateFRTAccountingLines(unbalanced, "100.25").message,
    /do not balance/,
  );
  const bothSides = lines();
  bothSides[0].credit = "1.00";
  assert.match(
    validateFRTAccountingLines(bothSides, "100.25").message,
    /positive debit OR a positive credit/,
  );
  const negative = lines();
  negative[0].debit = "-100.25";
  assert.match(
    validateFRTAccountingLines(negative, "100.25").message,
    /non-negative amounts/,
  );
  const missing = lines();
  missing[0].accountName = "";
  assert.match(
    validateFRTAccountingLines(missing, "100.25").message,
    /account code and account name/,
  );
});

test("accounting projection verifies line ordering, exact totals, revision and balanced request amount", () => {
  const result = projectFRTAccountingSnapshot(snapshot(), {
    expectedTotal: "100.25",
  });
  assert.equal(result.balanced, true);
  assert.equal(result.revision, 1);
  assert.equal(result.debitCents, 10025);
  assert.equal(result.creditCents, 10025);
  assert.equal(result.lines.length, 2);
  assert.equal(
    projectFRTAccountingSnapshot(snapshot({ creditTotal: "100.24" }), {
      expectedTotal: "100.25",
    }),
    null,
  );
  assert.equal(
    projectFRTAccountingSnapshot(snapshot({ balanced: false }), {
      expectedTotal: "100.25",
    }),
    null,
  );
  assert.equal(
    projectFRTAccountingSnapshot(
      snapshot({ lines: [snapshot().lines[1], snapshot().lines[0]] }),
      { expectedTotal: "100.25" },
    ),
    null,
  );
});

test("accounting save sends integer cents and confirms the next persisted revision", async () => {
  const calls = [];
  const api = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return snapshot();
    },
  };
  const result = await saveFRTAccountingLines({
    api,
    workspaceId,
    requestId,
    expectedRevision: 0,
    lines: lines(),
    expectedTotal: "100.25",
  });
  assert.equal(result.revision, 1);
  assert.equal(result.balanced, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "frt_save_request_accounting_lines");
  assert.equal(calls[0].args.p_expected_revision, 0);
  assert.equal(calls[0].args.p_lines[0].debitCents, 10025);
  assert.equal(calls[0].args.p_lines[1].creditCents, 10025);
});

test("accounting save rejects unbalanced data before issuing an RPC", async () => {
  let calls = 0;
  const api = {
    rpc: async () => {
      calls++;
      return snapshot();
    },
  };
  const bad = lines();
  bad[1].credit = "100.24";
  await assert.rejects(
    saveFRTAccountingLines({
      api,
      workspaceId,
      requestId,
      expectedRevision: 0,
      lines: bad,
      expectedTotal: "100.25",
    }),
    /do not balance/,
  );
  assert.equal(calls, 0);
});

test("accounting save surfaces stale revision conflicts from the atomic server function", async () => {
  const api = {
    rpc: async () => {
      throw Object.assign(
        new Error(
          "Accounting entries changed. Reload the voucher before saving.",
        ),
        { code: "40001" },
      );
    },
  };
  await assert.rejects(
    saveFRTAccountingLines({
      api,
      workspaceId,
      requestId,
      expectedRevision: 0,
      lines: lines(),
      expectedTotal: "100.25",
    }),
    /Accounting entries changed/,
  );
});

test("manually created accounting templates are workspace/company scoped and never prefill amounts", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const template = saveFRTAccountingTemplate({
    workspaceId,
    companyCode: "WASS",
    name: "Office disbursement",
    lines: lines(),
    storage,
  });
  assert.equal(
    loadFRTAccountingTemplates(workspaceId, "WASS", storage).length,
    1,
  );
  assert.equal(
    loadFRTAccountingTemplates(workspaceId, "WAO", storage).length,
    0,
  );
  const applied = applyFRTAccountingTemplate(template);
  assert.equal(applied[0].accountCode, "1010");
  assert.equal(applied[0].debit, "0.00");
  assert.equal(applied[0].credit, "");
  assert.equal(applied[1].credit, "0.00");
});

test("accounting editor renders manual fields and starts without fabricated account mappings", () => {
  const html = renderFRTAccountingEditor(
    { revision: 0, lines: [], balanced: false },
    "100.25",
    { workspaceId, companyCode: "WASS" },
  );
  for (const field of [
    "accountCode",
    "accountName",
    "description",
    "debit",
    "credit",
  ])
    assert.match(html, new RegExp('data-accounting-field="' + field + '"'));
  assert.match(html, /Add Accounting Line/);
  assert.match(html, /Save Accounting Entries/);
  assert.doesNotMatch(html, /1010|Accounts Payable|Cash \/ Bank/);
});
