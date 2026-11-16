# CP-FRT-FLOW-02 — Discussion, Activity Log, and Derived Notification Center

## Implementation

- Added a request Discussion panel backed by the existing \`frt_comments\` table and \`frt_add_comment\` RPC.
- Comment reads use a narrow PostgREST projection: comment ID, workspace ID, request ID, author user ID, body, and timestamp.
- Successful comment writes are followed by a fresh chronological read. Repeated submits are disabled while a write is in flight.
- Added a company- and request-filtered Activity Log backed by \`frt_audit_logs\`.
- Activity supports action filtering, text search across action and common audit detail fields, newest-first ordering, server-side 50-row pagination, and CSV export of the current filtered page.
- Activity detail rendering uses an explicit allowlist of useful workflow detail fields.
- Added a Notification Center derived from persisted request audit events and the existing \`frt_bank_execution_snapshot\` RPC.
- Deadline reminders are generated only when the authoritative snapshot reports staff-recorded bank execution. Due-soon is within 24 hours of the existing 72-hour deadline; overdue is after that deadline.
- Notification buttons navigate to the corresponding request detail.
- Deadline reads are bounded to six concurrent requests and only run for finance-approved requests with liquidation not already approved.
- Added the existing read-only bank snapshot RPC to the board-cache read allowlist and the existing comment write RPC to the mutation allowlist so cache invalidation occurs after successful writes.

## Existing production contracts reused

- \`frt_comments\`
- \`frt_audit_logs\`
- \`frt_add_comment\`
- \`frt_board_list_safe\`
- \`frt_bank_execution_snapshot\`

No new database table, RPC, migration, grant, RLS policy, role, permission, authentication framework, or notification persistence mechanism was introduced.

## Behavior and known limits

- Current production FRT data contains no request records or comments; existing audit rows are not request-linked FRT workflow events. The UI therefore presents truthful empty states until actual workflow activity exists.
- Other members' profile display names are not readable through the current profile visibility contract. Their authorship is shown as a stable member ID prefix; the signed-in user's own display name is shown when available. No profile visibility policy was changed.
- Notifications are a live derived view, not a persistent unread/read queue. Refresh is user-triggered; there is no polling, background job, or fabricated alert.
- The existing safe request-list contract returns at most 100 active requests per company. Activity and notification request association is bounded to that existing projection.
- CSV export covers the current filtered activity page. Pagination can be used to export additional pages.
- Per-request bank snapshot failures are reported as unavailable; no deadline is inferred from GM verification or a missing bank execution.

## Verification

Focused tests cover comment retrieval and write contracts, workspace/request scoping, audit filtering and pagination, CSV quoting, event labels, safe detail projection, XSS escaping, bounded deadline snapshot reads, 72-hour arithmetic, due-soon and overdue notifications, and navigation targets.

No production comment, financial request, approval, bank execution, liquidation, or audit event was created for acceptance.
