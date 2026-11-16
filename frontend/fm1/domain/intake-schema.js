import { z } from "zod";

export const fm1IntakeSchema = z.object({
  requesterName: z
    .string()
    .trim()
    .min(2, "Requester name must contain at least 2 characters.")
    .max(120, "Requester name must not exceed 120 characters."),
  callbackNumber: z
    .string()
    .trim()
    .min(7, "Callback number must contain at least 7 characters.")
    .max(32, "Callback number must not exceed 32 characters."),
  subject: z
    .string()
    .trim()
    .min(4, "Subject must contain at least 4 characters.")
    .max(160, "Subject must not exceed 160 characters."),
  description: z
    .string()
    .trim()
    .min(10, "Description must contain at least 10 characters.")
    .max(4000, "Description must not exceed 4000 characters."),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  productionImpact: z.enum(["critical", "degraded", "no-impact"]),
  productionStopped: z.boolean().default(false),
  safetyConcern: z.boolean().default(false),
  channel: z.enum(["portal", "email", "telephone"]),
  assetReference: z.string().trim().max(160).default(""),
});

export function parseFm1Intake(values = {}) {
  const result = fm1IntakeSchema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: [] };
  return {
    ok: false,
    data: null,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
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
