/**
 * CP-HULY-SB03: lossless first-domain projection for Huly tracker Issue snapshots.
 * Based on plugins/tracker/src/index.ts (Issue extends Task) in platform-develop.
 * It does NOT replace Huly's TxProcessor, attachments, relations or notifications.
 */
import { type DocumentInput, type HulyDocument } from './sb02.ts';

export type HulyIssueSnapshot = Readonly<{
  _id: string;
  title: string;
  space: string;
  status: string;
  priority: 0 | 1 | 2 | 3 | 4;
  [field: string]: unknown;
}>;
export type HulyIssuePayload = Readonly<{
  kind: 'huly.tracker.Issue';
  format: 1;
  snapshot: HulyIssueSnapshot;
}>;
const issueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;

export function issueDocumentId(issueId: string): string {
  if (!issueIdPattern.test(issueId)) throw new TypeError('Unsupported Huly issue ID');
  return `huly.issue.${issueId}`;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isIssue(input: unknown): input is HulyIssueSnapshot {
  if (!isRecord(input)) return false;
  return typeof input._id === 'string' && issueIdPattern.test(input._id)
    && typeof input.title === 'string' && input.title.length > 0
    && typeof input.space === 'string' && input.space.length > 0
    && typeof input.status === 'string' && input.status.length > 0
    && typeof input.priority === 'number' && Number.isInteger(input.priority) && input.priority >= 0 && input.priority <= 4;
}
export function issueToDocument(issue: unknown, boardId: string, workspaceId: string): DocumentInput {
  if (!isIssue(issue)) throw new TypeError('Invalid Huly issue snapshot');
  let snapshot: HulyIssueSnapshot;
  try {
    const encoded = JSON.stringify(issue);
    if (!encoded || encoded.length > 240000) throw new Error('Too large');
    snapshot = JSON.parse(encoded) as HulyIssueSnapshot;
  } catch { throw new TypeError('Huly issue must be a bounded JSON document'); }
  return {
    id: issueDocumentId(issue._id), boardId, workspaceId,
    payload: { kind: 'huly.tracker.Issue', format: 1, snapshot } satisfies HulyIssuePayload
  };
}
export function documentToIssue(document: HulyDocument): HulyIssueSnapshot {
  const payload = document.payload;
  if (!isRecord(payload) || payload.kind !== 'huly.tracker.Issue' || payload.format !== 1
    || !isIssue(payload.snapshot) || issueDocumentId(payload.snapshot._id) !== document.id) {
    throw new TypeError('Unrecognized Huly issue document');
  }
  return payload.snapshot;
}
