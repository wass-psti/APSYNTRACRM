# CP-FRT-BOARD-03 — Authoritative integration and production activation boundary

Scope: existing APSYNTRA CRM / WatchdogWorkspace, November 12, 2026.

## Delivered in frontend

- FRT domain action review/confirmation for signed requests already present in `frt_board_list_safe`. Actions are sourced from server-validated lifecycle previews returned by `frt_restricted_request_detail`; they are never mapped from decorative Monday.com status labels. The actual `frt_request_action` still enforces workspace and existing FRT roles, state and audit. Reason is required for reject/revoke; transfer reference is optional; archive stays excluded from this increment to avoid accidental disappearance. Unknown actions cannot be submitted. After any action, refresh the authoritative list. Never retry an uncertain financial write automatically.
- Existing signed date-edit flow from CP-FRT-BOARD-02 remains available. No financial request or document records were created for acceptance.

## Backend candidate prepared (NOT production activated)

- `sql/cp-frt-board03-date-cas-CANDIDATE.sql`: introduces an opt-in `frt_update_request_date_cas` RPC. Uses the original signed finance-manager/approver/GM role check, workspace scope, row-level `date_needed IS NOT DISTINCT FROM expected`, audit trail, restricted grant. It does NOT replace or broaden `frt_update_request`.
- `sql/tests/cp-frt-board03-date-cas-disposable.sql`: synthetic authorized date update, stale-date denial, foreign-workspace denial and audit integrity in isolated PostgreSQL 17.
- The date editor must be cut over to the CAS RPC **only after** separately approved production activation and signed acceptance. Until that change it continues to use preflight read / post-write reread; this is not equivalent to server atomicity.

## Additional integration gaps (not invented)

1. **Person assignment:** there is no `assignee_id` or `assigned_to` on `frt_requests`. `requestor_id` represents the original requestor, not a new assignee. Requires an explicit workspace-scoped assignment model and safe directory, assignment and read RPCs. Do not substitute a requester identity.
2. **Attachment retrieval:** the existing `frt-attachments` bucket is private, limited to 15 MB, with signed FRT workspace-membership storage policies. `frt_register_attachment` exists, but does not provide a verified attachment metadata list nor an authorized binary round-trip by request. A new signed metadata RPC, private binary retrieval and consistency validation must precede activation. Production currently holds zero FRT attachments.
3. **Account QR Code:** requires an explicit FRT request-to-QR category/mime/path relation and the same private storage controls; do not generate or publish financial account QR data from an ordinary attachment placeholder.
4. **Runtime evidence:** no FRT business requests, mirror items or attachments exist in the connected production project. Tests use synthetic data only; a genuine signed-user round-trip needs dedicated authorized fixture records, not business data.

## Security and operations

No FRT roles, RLS rules, storage policies, workspace permissions, production dates, bank account data, request records, or private binaries have been altered. This release does not activate any new migration. Do not claim the full CP-FRT-BOARD-03 milestone closed before the database contracts and secure attachment/QR flows are verified.
