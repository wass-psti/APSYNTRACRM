const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);
const IMPACTS = new Set(["critical", "degraded", "no-impact"]);
const CHANNELS = new Set(["portal", "email", "telephone"]);

function issue(path, message) {
  return { path, message };
}

function expectedType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateFm1Intake(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      success: false,
      error: {
        issues: [issue([], "Intake payload must be an object.")],
      },
    };
  }

  const issues = [];
  const data = {};

  const stringField = (field, { min = 0, max, defaultValue } = {}) => {
    let value = input[field];
    if (value === undefined && defaultValue !== undefined) {
      value = defaultValue;
    }
    if (typeof value !== "string") {
      issues.push(
        issue(
          [field],
          "Expected string, received " + expectedType(value) + ".",
        ),
      );
      return;
    }
    value = value.trim();
    if (value.length < min) {
      issues.push(
        issue(
          [field],
          field + " must contain at least " + min + " characters.",
        ),
      );
    }
    if (max !== undefined && value.length > max) {
      issues.push(
        issue([field], field + " must not exceed " + max + " characters."),
      );
    }
    data[field] = value;
  };

  const enumField = (field, allowed) => {
    const value = input[field];
    if (typeof value !== "string" || !allowed.has(value)) {
      issues.push(issue([field], "Select a valid " + field + "."));
      return;
    }
    data[field] = value;
  };

  const booleanField = (field) => {
    const value = input[field] === undefined ? false : input[field];
    if (typeof value !== "boolean") {
      issues.push(
        issue(
          [field],
          "Expected boolean, received " + expectedType(value) + ".",
        ),
      );
      return;
    }
    data[field] = value;
  };

  stringField("requesterName", { min: 2, max: 120 });
  stringField("callbackNumber", { min: 7, max: 32 });
  stringField("subject", { min: 4, max: 160 });
  stringField("description", { min: 10, max: 4000 });
  enumField("priority", PRIORITIES);
  enumField("productionImpact", IMPACTS);
  booleanField("productionStopped");
  booleanField("safetyConcern");
  enumField("channel", CHANNELS);
  stringField("assetReference", { max: 160, defaultValue: "" });

  return issues.length
    ? { success: false, error: { issues } }
    : { success: true, data };
}

// Keep the small safeParse contract available to tests and future form consumers
// without adding a runtime dependency to the CRM's Node-only CI path.
export const fm1IntakeSchema = Object.freeze({
  safeParse: validateFm1Intake,
});

export function parseFm1Intake(values = {}) {
  const result = fm1IntakeSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: [] };
  return {
    ok: false,
    data: null,
    errors: result.error.issues.map((item) => ({
      field: item.path.join("."),
      message: item.message,
    })),
  };
}

export function createFm1LocalDraft(
  data,
  { id, now = new Date(), scopeKey = "unscoped::unscoped" } = {},
) {
  const createdAt =
    now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const draftId =
    id ||
    globalThis.crypto?.randomUUID?.() ||
    "draft-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  return Object.freeze({
    id: draftId,
    reference:
      "LOCAL-DRAFT-" +
      createdAt.slice(0, 10).replaceAll("-", "") +
      "-" +
      draftId.slice(0, 8),
    recordType: "FM1_INTAKE_DRAFT",
    scopeKey,
    submissionState: "NOT_SUBMITTED",
    serverTicketId: null,
    createdAt,
    site: "FM1",
    ...data,
  });
}
