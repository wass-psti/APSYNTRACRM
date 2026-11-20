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
| Production migration application | VERIFIED: one migration applied with Supabase CLI `db push --skip-vault`; exit code 0 |
| Authoritative production function source readback after application | VERIFIED: source MD5 `077f245a45417d1616445256c55e0e2b`; old expression absent; migration ledger recorded once |
| Genuine signed owner self-access projection reflects native authority after refresh | VERIFIED: four native modules false/no role for previously unassigned workspace owner, while employee four true/role present |
| Native server 403 remains in force for previously denied unassigned module | VERIFIED: owner TimeTracker 403; employee TimeTracker 200 and visible native UI |
| Same-workspace two-account mutation, persistence, target allow/deny, refresh/reauth and cross-user propagation | BLOCKED — two current signed QA accounts in different workspaces |

**Important:** This milestone reconciles the **accuracy of reported native availability**, not whether a workspace owner *ought* to have automatic native module access. Changing the actual intended owner role policy is a separate permission/architecture decision. Do not misrepresent an actual 403 as a missing Board or implicitly grant access to make the test pass.

**Next, if not fully accepted:** `CP-CRM-URM-INTEGRITY-03D — Same-Workspace Signed Administrator–Employee Role Mutation, Native Capability Execution, and Cross-Session Acceptance`, using confirmed nonproduction identities and reversible fixtures. No additional authority restrictions or new Supabase project.

## Production activation and signed runtime acceptance — VERIFIED

- **GitHub PR:** [#628](https://github.com/wass-psti/APSYNTRACRM/pull/628), merged as `59c3d83d274fc8ccaba5df4bb96d2897b3a9f968`.
- **PR checks:** All required checks passed, including activation-source integrity, prior role projection and all five scoped PostgreSQL domains. Local full suite **2,971/2,971 PASS**; production build PASS (existing nonblocking bundle-size warnings).
- **Deployment:** Supabase CLI dry-run identified **only** `20261120150000_cp_crm_urm_integrity_03c_projection_parity.sql`. `supabase db push --project-ref jtlusodorfnyzgyuewkz --skip-vault --yes` applied exactly this migration, exit code 0. No other pending migrations, no vault update, no seed or role SQL. Production ledger version `20261120150000` exists exactly once.
- **Authoritative database readback:** `apsyntra_crm_my_effective_access()` now has source MD5 `077f245a45417d1616445256c55e0e2b`. The new native role/allowed projection is present, old native projection fragment absent, and existing `SECURITY DEFINER` status retained. Existing native guards, grants, RLS, workspace members, module assignments, and Board rows were not modified.
- **Signed two-account readback:** two independent active QA tabs each returned HTTP 200 signed workspace context and effective-access JSON after refresh. The workspace-effective owner now reports **0/4 native modules available** and no native role; the previously assigned employee reports **4/4 available** and four native roles. This is expected **projection accuracy**, not a permission revocation or grant.
- **Native resolver evidence:** owner TimeTracker remains denied HTTP **403**, and its UI displays “TimeTracker access unavailable”; the assigned employee's TimeTracker native resolver returned HTTP **200** with a visible native interface. No browser page errors were observed.
- **Four native application readback:** existing signed read-only acceptance runner verified the employee on TimeTracker, Fund Tracker, FuelTrack+, TradeLink: all four native UIs visible, canonical Board IDs matched, domain HTTP 200, no page errors; the owner was correctly classified `NOT_ASSIGNED` in all four and was not navigated to unassigned routes. **Zero business writes and zero permission writes.**
- **GitHub deployment:** Pages run `44661901374` SUCCESS; post-merge frontend run `44661902157` SUCCESS, including live Pages smoke.

## Unresolved cross-user acceptance

The same two live QA accounts are in **different workspaces**. Therefore a genuine *same-workspace* administrator-to-employee mutation, authoritative readback, target capability allow/deny, logout/reauthentication and cross-user eventual synchronization remain **BLOCKED**, not failed. No production role/permission changes were made to fabricate a test. Next scoped acceptance: **CP-CRM-URM-INTEGRITY-03D — Same-Workspace Signed Administrator–Employee Role Mutation, Native Capability Execution, and Cross-Session Acceptance** using reversible nonproduction fixtures and two independently signed target accounts in the same workspace.

**Disposition:** Projection activation and production readback **CLOSED — VERIFIED**. End-to-end role management across genuinely different signed users in one workspace **PENDING**.
