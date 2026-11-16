const PRIORITIES = new Set(["P1", "P2", "P3", "P4"]);
const IMPACTS = new Set(["critical", "degraded", "no-impact"]);
const CHANNELS = new Set(["portal", "email", "telephone"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function validateText(value, { field, label, min, max, errors }) {
  const normalized = normalizeText(value);
  if (normalized.length < min) {
    errors.push({
      field,
      message: label + " must contain at least " + min + " characters.",
    });
  } else if (normalized.length > max) {
    errors.push({
      field,
      message: label + " must not exceed " + max + " characters.",
    });
  }
  return normalized;
}

export function parseFm1Intake(values = {}) {
  const errors = [];
  const data = {
    requesterName: validateText(values.requesterName, {
      field: "requesterName",
      label: "Requester name",
      min: 2,
      max: 120,
      errors,
    }),
    callbackNumber: validateText(values.callbackNumber, {
      field: "callbackNumber",
      label: "Callback number",
      min: 7,
      max: 32,
      errors,
    }),
    subject: validateText(values.subject, {
      field: "subject",
      label: "Subject",
      min: 4,
      max: 160,
      errors,
    }),
    description: validateText(values.description, {
      field: "description",
      label: "Description",
      min: 10,
      max: 4000,
      errors,
    }),
    priority: normalizeText(values.priority),
    productionImpact: normalizeText(values.productionImpact),
    productionStopped: values.productionStopped === true,
    safetyConcern: values.safetyConcern === true,
    channel: normalizeText(values.channel),
    assetReference: normalizeText(values.assetReference),
  };

  if (!PRIORITIES.has(data.priority)) {
    errors.push({
      field: "priority",
      message: "Select a valid proposed priority.",
    });
  }
  if (!IMPACTS.has(data.productionImpact)) {
    errors.push({
      field: "productionImpact",
      message: "Select a valid production impact.",
    });
  }
  if (!CHANNELS.has(data.channel)) {
    errors.push({
      field: "channel",
      message: "Select a valid reporting channel.",
    });
  }
  if (data.assetReference.length > 160) {
    errors.push({
      field: "assetReference",
      message: "Asset reference must not exceed 160 characters.",
    });
  }

  return errors.length
    ? { ok: false, data: null, errors }
    : { ok: true, data, errors: [] };
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
