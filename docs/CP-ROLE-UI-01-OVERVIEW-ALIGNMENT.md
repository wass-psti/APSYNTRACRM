# CP-ROLE-UI-01 — Role Configuration Interface Redesign and Overview Alignment

Date: 2026-11-13
Scope: Role Configuration frontend only
Reference design: `frontend/overview-experience.css` (actual APSYNTRA Overview implementation)

## Baseline / invariants

- Existing role page is a CRM-Administrator-gated, **staged-proposal-only** interface.
- The five sections are Role catalog, Assignments, Permission matrix, Workspace access, Change history.
- Four counts are based only on the authorized server snapshot. No mock or invented statistics.
- Existing delegated `data-action` handlers, role IDs, module IDs, table records, proposal operations, and search IDs must remain unchanged.
- CRM Administrator parity, protected bootstrap identities, workspace isolation, RLS/RBAC, Supabase authentication and database schemas are explicitly outside scope.
- No production role, permission, membership, invitation or workspace mutation is authorized by this visual milestone.

## Implementation phases and acceptance gates

| Phase | Task | Evidence / gate |
| --- | --- | --- |
| 1 — Baseline | Inspect live role route and Overview CSS, action/data contracts, responsive styles | Existing renderers and frontend tests inspected |
| 2 — Visual reference | Reuse Overview shell and hero colors, four-card spacing, panel borders, typography and modest transitions | Route-scoped style checks and rendered Chromium CSS measurements |
| 3 — Layout | Introduce an identifiable section workspace with selected-section heading, explanatory copy and proposal-only status | All five sections render with existing delegated handlers |
| 4 — Components | Normalize table density, action touch targets, native search controls, status chips and individually named table regions | Semantic HTML and accessibility tests; existing IDs/action hooks retained |
| 5 — Accessibility | Preserve keyboard focusable horizontal tables, named regions, selected section state, live loading feedback, reduced motion and high contrast | 20 Chromium combinations and denied-route tests |
| 6 — Integration | Run complete frontend regression, CSS bundle check, syntax and diff validation; enforce PR CI | Merge only when required checks pass |
| 7 — Delivery | Verify GitHub Pages publication and post-merge workflow results | Published JS and CSS markers; no production writes |

## Non-goals

New role tiers, administrator permissions, policy enforcement, activation controls, signing flows, backend or RLS work, permission escalation, or independent component frameworks.

## Validation records

- Frontend regression: **2,082 / 2,082 PASS** on reconciled local implementation baseline.
- Real Chromium: **20 / 20 PASS** (five sections at 1440px, 768px, 390px and 320px).
- Matrix buttons: **84 / 84** remain staged only.
- Styled workspace: CSS computed gradient, radius and panel header verified at every tested width.
- Build-bundle integrity and diff hygiene: **PASS**.
- Signed-in production proposal creation, persistence and live RBAC enforcement were **not exercised** by this visual-only acceptance.
