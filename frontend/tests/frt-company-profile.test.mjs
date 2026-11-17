import test from "node:test";
import assert from "node:assert/strict";
import {
  projectFRTCompanyProfile,
  loadFRTCompanyProfile,
  saveFRTCompanyProfile,
  uploadFRTCompanyLogo,
  loadFRTCompanyLogoDataUrl,
  renderFRTCompanyProfileEditor,
} from "../frt-company-profile.js";
import { projectFRTVoucherSnapshot } from "../frt-voucher.js";
import { renderFRTVoucherDocument } from "../frt-voucher-document.js";
import { buildFRTVoucherDefinition } from "../frt-voucher-pdf.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const requestId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const companyCode = "WASS";
const company = (overrides = {}) => ({
  workspace_id: workspaceId,
  code: companyCode,
  name: "Watchdog Automation Sales & Services",
  registered_address: null,
  contact_phone: null,
  contact_email: null,
  logo_path: null,
  ...overrides,
});
const auth = {
  userId,
  isSignedIn: true,
  getVerifiedUser: async () => ({ id: userId }),
  token: async () => "signed-token",
};
const apiFor = (companies) => ({
  context: async () => ({
    user_id: userId,
    workspace_id: workspaceId,
    profile: { status: "active" },
  }),
  rpc: async (name, args) => {
    if (name === "frt_bootstrap")
      return {
        membership: {
          user_id: userId,
          workspace_id: workspaceId,
          enabled: true,
          status: "active",
          role: "REQUESTOR",
        },
        companies,
      };
    if (name === "frt_update_company_profile") {
      const row = companies.find((item) => item.code === args.p_company_code);
      Object.assign(row, {
        name: args.p_legal_name,
        registered_address: args.p_registered_address || null,
        contact_phone: args.p_contact_phone || null,
        contact_email: args.p_contact_email || null,
        logo_path: args.p_logo_path,
      });
      return { saved: true, company: { code: row.code } };
    }
    throw new Error("Unexpected RPC " + name);
  },
});

test("company profile projection preserves nullable metadata and uses existing legal company name", () => {
  const result = projectFRTCompanyProfile(company(), {
    workspaceId,
    companyCode,
  });
  assert.equal(result.legalName, "Watchdog Automation Sales & Services");
  assert.equal(result.registeredAddress, "");
  assert.equal(result.logoPath, null);
  assert.equal(
    projectFRTCompanyProfile(company({ code: "WAO" }), {
      workspaceId,
      companyCode,
    }),
    null,
  );
});

test("signed company profile read works with the existing FRT REQUESTOR membership", async () => {
  const row = company({ registered_address: "Mandaue City, Cebu" });
  const result = await loadFRTCompanyProfile({
    auth,
    api: apiFor([row]),
    workspaceId,
    companyCode,
  });
  assert.equal(result.registeredAddress, "Mandaue City, Cebu");
});

test("company profile save persists and verifies exact readback without a new role tier", async () => {
  const row = company(),
    api = apiFor([row]);
  const result = await saveFRTCompanyProfile({
    auth,
    api,
    workspaceId,
    companyCode,
    profile: {
      legalName: "WASS Legal Entity",
      registeredAddress: "Cebu, Philippines",
      contactPhone: "+63 32 555 0100",
      contactEmail: "finance@example.com",
      logoPath: null,
    },
  });
  assert.equal(result.legalName, "WASS Legal Entity");
  assert.equal(result.contactEmail, "finance@example.com");
});

test("company profile projection and save validation reject invalid email and oversized address", async () => {
  assert.equal(
    projectFRTCompanyProfile(company({ contact_email: "not-an-email" }), {
      workspaceId,
      companyCode,
    }),
    null,
  );
  await assert.rejects(
    saveFRTCompanyProfile({
      auth,
      api: apiFor([company()]),
      workspaceId,
      companyCode,
      profile: {
        legalName: "Valid Name",
        registeredAddress: "x".repeat(501),
        contactPhone: "",
        contactEmail: "",
        logoPath: null,
      },
    }),
    /Registered address must not exceed 500/,
  );
});

test("private logo upload validates image signature and uses the existing FRT attachment bucket", async () => {
  const calls = [];
  const png = Object.assign(
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], {
      type: "image/png",
    }),
    { name: "logo.png" },
  );
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ Key: "uploaded" }) };
  };
  const path = await uploadFRTCompanyLogo({
    auth,
    api: apiFor([company()]),
    workspaceId,
    companyCode,
    file: png,
    fetchImpl,
  });
  assert.match(
    path,
    new RegExp("^" + workspaceId + "/company-profiles/WASS/.+\\.png$"),
  );
  assert.match(calls[0].url, /\/storage\/v1\/object\/frt-attachments\//);
  assert.equal(calls[0].options.headers.apikey !== undefined, true);
  assert.equal(calls[0].options.headers["x-upsert"], "false");
  const bad = Object.assign(new Blob(["not a png"], { type: "image/png" }), {
    name: "bad.png",
  });
  await assert.rejects(
    uploadFRTCompanyLogo({
      auth,
      api: apiFor([company()]),
      workspaceId,
      companyCode,
      file: bad,
      fetchImpl,
    }),
    /bytes do not match/,
  );
});

test("private logo retrieval creates a short-lived signed URL and returns a validated data URL", async () => {
  const logoPath =
    workspaceId +
    "/company-profiles/WASS/33333333-3333-4333-8333-333333333333.png";
  const row = company({ logo_path: logoPath });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST")
      return {
        ok: true,
        status: 200,
        json: async () => ({
          signedURL:
            "/object/sign/frt-attachments/" +
            encodeURIComponent(logoPath) +
            "?token=short",
        }),
      };
    const blob = new Blob(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
      { type: "image/png" },
    );
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      blob: async () => blob,
    };
  };
  const data = await loadFRTCompanyLogoDataUrl({
    auth,
    api: apiFor([row]),
    workspaceId,
    companyCode,
    logoPath,
    fetchImpl,
  });
  assert.match(data, /^data:image\/png;base64,/);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/storage\/v1\/object\/sign\/frt-attachments\//);
  assert.equal(calls[1].options.credentials, "omit");
});

test("company profile editor escapes persisted values and exposes all required fields", () => {
  const html = renderFRTCompanyProfileEditor({
    companyCode: "WASS",
    legalName: "WASS <script>",
    registeredAddress: "Cebu & Mandaue",
    contactPhone: "",
    contactEmail: "",
    logoPath: null,
    logoDataUrl: null,
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /WASS &lt;script&gt;/);
  assert.match(html, /Registered company address/);
  assert.match(html, /Official contact telephone/);
  assert.match(html, /Official contact email/);
  assert.match(html, /companyLogo/);
  assert.match(html, /Save Company Profile/);
});

test("voucher projection maps the persisted company profile fields without changing the voucher identity", () => {
  const raw = {
    workspaceId,
    requestId,
    company: {
      code: "WASS",
      name: "WASS",
      address: "Registered address",
      phone: "+63 32 555 0100",
      email: "finance@example.com",
      logoPath: workspaceId + "/company-profiles/WASS/logo.webp",
    },
    voucherNumber: "DV-WASS-202611-001",
    voucherDate: "2026-11-16T02:00:00Z",
    requestReference: { orderIntakeNo: "", checkNo: "" },
    title: "Office supplies",
    department: "Operations",
    fundSource: "Operating Fund",
    payee: "Supplier",
    payeeBank: "Bank",
    dateNeeded: "2026-11-20",
    description: "Office supplies",
    totalAmount: "10.00",
    requestStatus: "DONE",
    liquidationStatus: "NOT_SUBMITTED",
    preparedBy: null,
    preparedAt: "2026-11-16T02:00:00Z",
    financeApproval: { approvedBy: null, approvedAt: null },
    gmVerification: { verifiedBy: null, verifiedAt: null, reference: "" },
    items: [{ category: "Office", description: "Paper", amount: "10.00" }],
    itemsTotal: "10.00",
    reconciled: true,
    accounting: {
      revision: 1,
      lines: [
        {
          lineNumber: 1,
          accountCode: "1010",
          accountName: "Cash",
          description: "Debit",
          debit: "10.00",
          credit: "0.00",
        },
        {
          lineNumber: 2,
          accountCode: "2010",
          accountName: "Payable",
          description: "Credit",
          debit: "0.00",
          credit: "10.00",
        },
      ],
      debitTotal: "10.00",
      creditTotal: "10.00",
      debitCents: 1000,
      creditCents: 1000,
      requestTotalCents: 1000,
      balanced: true,
    },
  };
  const result = projectFRTVoucherSnapshot(raw, {
    workspaceId,
    requestId,
    companyCode: "WASS",
  });
  assert.equal(result.company.address, "Registered address");
  assert.equal(result.company.phone, "+63 32 555 0100");
  assert.equal(result.company.email, "finance@example.com");
  assert.equal(result.company.logoPath, raw.company.logoPath);
  assert.equal(result.voucherNumber, "DV-WASS-202611-001");
});

test("voucher HTML and A4 PDF embed persisted company profile and logo data", () => {
  const raw = {
    workspaceId,
    requestId,
    company: {
      code: "WASS",
      name: "WASS Legal Name",
      address: "Registered address",
      phone: "+63 32 555 0100",
      email: "finance@example.com",
      logoPath: null,
    },
    voucherNumber: "DV-WASS-202611-001",
    voucherDate: "2026-11-16T02:00:00Z",
    requestReference: { orderIntakeNo: "OI-TEST", checkNo: "CHK-TEST" },
    title: "Office supplies",
    department: "Operations",
    fundSource: "Operating Fund",
    payee: "Supplier",
    payeeBank: "Bank",
    dateNeeded: "2026-11-20",
    description: "Office supplies",
    totalAmount: "10.00",
    requestStatus: "DONE",
    liquidationStatus: "NOT_SUBMITTED",
    preparedBy: null,
    preparedAt: "2026-11-16T02:00:00Z",
    financeApproval: { approvedBy: null, approvedAt: null },
    gmVerification: { verifiedBy: null, verifiedAt: null, reference: "" },
    items: [{ category: "Office", description: "Paper", amount: "10.00" }],
    itemsTotal: "10.00",
    reconciled: true,
    accounting: {
      revision: 1,
      lines: [
        {
          lineNumber: 1,
          accountCode: "1010",
          accountName: "Cash",
          description: "Debit",
          debit: "10.00",
          credit: "0.00",
        },
        {
          lineNumber: 2,
          accountCode: "2010",
          accountName: "Payable",
          description: "Credit",
          debit: "0.00",
          credit: "10.00",
        },
      ],
      debitTotal: "10.00",
      creditTotal: "10.00",
      debitCents: 1000,
      creditCents: 1000,
      requestTotalCents: 1000,
      balanced: true,
    },
  };
  const projected = projectFRTVoucherSnapshot(raw, {
    workspaceId,
    requestId,
    companyCode: "WASS",
  });
  const voucher = {
    ...projected,
    company: {
      ...projected.company,
      logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    },
  };
  const html = renderFRTVoucherDocument(voucher);
  assert.match(html, /Registered address/);
  assert.match(html, /Telephone:/);
  assert.match(html, /Email:/);
  assert.match(html, /data:image\/png;base64/);
  const definition = buildFRTVoucherDefinition(voucher);
  assert.equal(definition.pageSize, "A4");
  assert.equal(
    definition.content[1].columns[0].image,
    "data:image/png;base64,iVBORw0KGgo=",
  );
  assert.match(JSON.stringify(definition.content[1]), /Registered address/);
});
