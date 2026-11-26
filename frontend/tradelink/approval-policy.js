// Revision-bound policy values returned by the signed TradeLink backend.
// Never infer an exemption from a missing review or an editable form field.
export const STANDARD_APPROVAL_POLICY = 'standard-dual-v1';
export const GM_SALES_EXEMPT_POLICY = 'gm-sales-supervisor-exempt-v1';

export const GM_CREATOR_APPROVAL_FREE_POLICY = 'gm-creator-approval-free-v1';

export function requiredTradeLinkReviewStages(policy = STANDARD_APPROVAL_POLICY) {
  if (policy === STANDARD_APPROVAL_POLICY) return ['primary', 'secondary'];
  if (policy === GM_SALES_EXEMPT_POLICY) return ['secondary'];
  if (policy === GM_CREATOR_APPROVAL_FREE_POLICY) return [];
  throw new Error('Unknown TradeLink approval policy.');
}

export function tradeLinkReviewEvidenceComplete(policy, primaryAt, secondaryAt) {
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const required = requiredTradeLinkReviewStages(policy);
  if (required.length === 0) return primaryAt == null && secondaryAt == null;
  if (!validTime(secondaryAt)) return false;
  return required.includes('primary') ? validTime(primaryAt) : primaryAt == null;
}

// Presentation only. The database computes and persists the actual policy on save.
export function tradeLinkGmApprovalPreview(actorEmail, actorModuleRole) {
  return String(actorEmail ?? '').trim().toLowerCase() === 'asenagan@watchdogautomation.com.ph' &&
    actorModuleRole === 'General Manager';
}
