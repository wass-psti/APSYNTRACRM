# CP-FRT-FRONTEND-01 — Fund Released Tracker reference dashboard

Date: 2026-11-12. Scope: **frontend presentation only** in the existing FRT Finance tab of APSYNTRA CRM.

## Reference and implemented sections

The user supplied 11 annotated Monday.com Fund Release Tracker screenshots as UI reference. The frontend now reproduces their major structure: dark company selector/header (WAO, WASS, PSTI where present in signed bootstrap), Fund Tracker navigation strip, liquidation notice, blue-accented app title and controls, four KPI cards, donut/status bar charts, navy Fund Requests header, detailed request table, three-dot action menu, and contextual New Fund Request / Discussion / Activity Log / Archive Storage preview dialogs.

All financial counts, titles, vouchers, dates and statuses come only from the existing signed `frt_board_dashboard_safe`, `frt_board_list_safe`, and `frt_bootstrap` projections. The UI does not fabricate the 40 requests or the prices visible in the reference image. Status charts show completed, in-progress and pending-approval categories from the verified backend; the original reference's approved and monetary totals cannot be safely inferred. The liquidation notice shows pending liquidation count, **not** an unverified overdue deadline. Amount, requester, BPI filing state and private/archived data show unavailable because they are not supplied by the restricted safe projection.

## Functional scope

Existing company switching, status filtering, signed list/detail refresh, atomic date CAS, person assignment, and backend-lifecycle action review remain wired through their current handlers and signed role checks. The screenshot's creation, file import, export, comments, filing toggle, activity feed and archive retrieval do not have a sufficiently verified signed contract in the active FRT frontend and therefore are explicitly **preview-only or disabled**. The new-request preview displays the requested **Not Filed** initial state but cannot submit or persist; *the defaulting and click-to-Filed workflow is PENDING a separately verified backend contract*. No fake writes, simulated successful submissions or broader access grants were added.

The separate APSYNTRA CRM board-mirror table remains distinct from the authoritative finance domain. No workspace roles, RLS policies, company grants, financial requests, attachments, audit logs, or production schema are modified.

## Verification

- Full frontend regression: 1,924/1,924 PASS.
- Scoped FRT render and sanitized contract tests: PASS (including blocked read, zero data, inaccessible private financial fields, menu actions, company scope, responsive CSS manifest).
- CSS bundle reproducibility: PASS; 46 source files assembled as one stylesheet, preserving CSP `style-src-attr 'none'`.
- Real isolated Chromium startup/privacy, CSS cascade, dropdown/dialog top layer: PASS.
- Genuine signed production UI test against nonempty FRT domain requests: PENDING (production FRT request count currently zero).

The next contract implementation should be restricted to actual signed request creation, default Not Filed filing state, click-to-Filed mutation, financial read projections, signed activity history, comment attachments and archive reads, **only** once their existing server contract and target RLS requirements are verified. Do not merge unsafe placeholder writes into this frontend release.
