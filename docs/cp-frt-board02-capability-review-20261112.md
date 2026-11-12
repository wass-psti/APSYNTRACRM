# CP-FRT-BOARD-02 — Fund Released Tracker board capability assessment

Date: 2026-11-12. Existing project only. Production inspection was READ ONLY.

## Implemented and verified in this increment

- Signed FRT finance request status filtering from `frt_board_list_safe`, without changing approval states.
- Existing-domain request date editing via `frt_update_request` for the three existing server-authorized correction roles, with FRT membership/company reread, current request-date preflight, exact single-field payload, and post-write restricted-detail verification. The date editor exists only for requests returned in the current signed safe list. No automatic retry of ambiguous write results.
- FRT board-to-finance-tab navigation so the empty mirror board leads directly to its authoritative domain request UI.
- No new grants, roles, RLS, schema columns, bucket policies, or financial requests.

## Missing integration contracts — no synthetic capabilities

| Reference feature | Verified production state | Safe next prerequisite |
|---|---|---|
| Status *mutation* picker | Existing `Approval Status` board mirror is not a writable financial authority. Domain `frt_request_action` has distinct lifecycle/approval semantics, not Monday.com option semantics. | Implement signed server-authorized action choices from authoritative request lifecycle, with confirmation, no direct mapping from visual labels to financial approval. |
| Person assignment | `frt_requests` has no `assigned_to`, `assignee_id`, or `person_id` field. The `requestor_id` is a different private identity and must not be relabeled as an assignee. | Agree actual request assignee semantics and add workspace-scoped assignment, read and update contracts in one reviewed migration. |
| Attachments | Production has `frt_register_attachment` but zero `frt_attachments`; no verified FRT attachment-list/binary-read RPC. | Add existing-workspace scoped metadata retrieval, private object storage signed access, round-trip and foreign workspace denial tests before enabling uploads. |
| Account QR Code | Neither a verified QR-read RPC nor a request-level QR attachment category is established in the safe board projection. | Define QR metadata relationship to FRT request and secure private binary read; never generate imaginary bank/QR records. |
| Live CRUD acceptance | Zero `frt_requests`, zero FRT board mirror items, zero registered FRT attachments. | Run genuine signed-authorized nonproduction request correction and refreshed reread, without modifying business records. |

## Concurrency limitation

The installed `frt_update_request` RPC enforces FRT domain role and workspace access but **does not take an expected revision**. The client performs a fresh-read check and verified reread, but that is not a server-atomic compare-and-swap guarantee. For strict concurrent correction integrity, the next server change should introduce a small opt-in CAS date-update RPC, preserving existing FRT RBAC and audit semantics, and test stale concurrent writes with disposable data before activation.
