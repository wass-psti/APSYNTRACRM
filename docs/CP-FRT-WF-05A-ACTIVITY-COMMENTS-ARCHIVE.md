# CP-FRT-WF-05A — Signed Activity, Discussion and Archive Recovery

## Scope

Activate the existing FRT Activity Log, request discussion and Archive Storage interfaces without introducing a parallel data model.

## Implementation

- Read chronological audit events from the existing `frt_audit_logs` table through a bounded signed RPC.
- Keep activity history read-only, scoped to the selected company, limited to the most recent 30 days and at most 1,000 rows per request.
- Whitelist activity detail fields so request-correction payloads cannot leak recipient account data into the activity view.
- Read request comments through a company- and workspace-scoped signed RPC.
- Reuse the existing `frt_add_comment` mutation and return its generated comment ID for exact readback.
- List archived requests from the existing `frt_requests.archived_at` field.
- Restore archived requests through an additive RPC that reuses the existing General Manager role check already used by the archive action.
- Expose the existing archive action in the request workflow details.
- Export the visible activity set to CSV with spreadsheet-formula neutralization.

## Preserved behavior

- No new tables, roles, authentication framework, RLS policies, approval stages, or permission model.
- Existing workspace, company, signed-session and FRT role contracts remain authoritative.
- Existing request, voucher, banking, liquidation, intercompany and Board data are not rewritten.
- Archival remains soft archival; recovery clears only `archived_at`.
- Audit records are not deleted or pruned. The Activity Log view is bounded to 30 days and 1,000 rows.
- No production financial records are created or modified by acceptance.

## Verification

- Frontend unit coverage: signed context, comment readback, archive restoration, role reuse, activity projection and CSV safety.
- Disposable PostgreSQL acceptance script: `sql/tests/cp-frt-wf05a-operations-disposable.sql`.
- Full repository CI and production build are required before merge.
- Production migration activation is separate from disposable acceptance.
