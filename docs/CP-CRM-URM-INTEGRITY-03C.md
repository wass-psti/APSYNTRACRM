# CP-CRM-URM-INTEGRITY-03C — Controlled Native Projection Activation

**Date:** 2026-11-20 Asia/Manila. **Production project:** existing APSYNTRA CRM Supabase project; no new project.

## Verified baseline

- CORE-03B candidate `sql/cp-crm-urm-integrity-03b-projection-candidate.sql` was confirmed in isolated PostgreSQL: the synthetic workspace owner initially reported TimeTracker as allowed even though `has_module_access` denied; the candidate made four native projection entries match `has_module_access` and `module_role_for`, while Board-linked modules were unaffected. All five scoped role-domain suites passed.
- Production `public.apsyntra_crm_my_effective_access()` retained the expected source hash `7a3d5763dccae093940238b1961c0ff9`, with unmodified `role IS NOT NULL` projection and expected workspace-admin case; no activation was present at preflight.
- Two genuine signed QA Chromium accounts returned authoritative HTTP 200 active workspace contexts. They are **different users in different workspaces**; therefore they do not qualify for same-workspace cross-user mutation/synchronization acceptance.

## Release scope

`supabase/migrations/20261120150000_cp_crm_urm_integrity_03c_projection_parity.sql` is the single-function projection activation. It contains the exact CORE-03B source replacement and additionally rejects any production function definition whose MD5 differs from the verified baseline. The migration version is after the existing production ledger high-water mark `20261120140000` and is recorded with exact bytes/SHA-256 in the repository's migration-source manifest.

- Changes the **displayed role and allowed flag** only for TimeTracker, Fund Tracker, FuelTrack+, and TradeLink.
- Reuses `public.has_module_access` and `public.module_role_for` without granting new capabilities.
- Preserves the other eight Board-linked module projections and all actual native backend guards.
- No assignment, workspace membership, RLS, grant, session token, permission, production business record or table schema changes.
- Prepared rollback: `sql/cp-crm-urm-integrity-03c-projection-rollback.sql` restores the exact original four-entry expression, guarded by an expected active-source fragment. Rollback requires explicit operational justification; it must not run automatically.

## Acceptance gates

| Gate | Status / requirement |
| --- | --- |
| Baseline production function hash and source guard | VERIFIED in read-only Supabase SQL |
| Disposable owner parity reproduction and safe candidate acceptance | VERIFIED in CORE-03B |
| New migration/rollback source and manifest tests | VERIFIED locally; CI to validate |
| Production migration application | PENDING until required checks and controlled activation |
| Authoritative production function source readback after application | PENDING |
| Genuine signed owner self-access projection reflects native authority after refresh | PENDING |
| Native server 403 remains in force for previously denied unassigned module | PENDING runtime reconfirmation |
| Same-workspace two-account mutation, persistence, target allow/deny, refresh/reauth and cross-user propagation | BLOCKED — two current signed QA accounts in different workspaces |

**Important:** This milestone reconciles the **accuracy of reported native availability**, not whether a workspace owner *ought* to have automatic native module access. Changing the actual intended owner role policy is a separate permission/architecture decision. Do not misrepresent an actual 403 as a missing Board or implicitly grant access to make the test pass.

**Next, if not fully accepted:** `CP-CRM-URM-INTEGRITY-03D — Same-Workspace Signed Administrator–Employee Role Mutation, Native Capability Execution, and Cross-Session Acceptance`, using confirmed nonproduction identities and reversible fixtures. No additional authority restrictions or new Supabase project.
