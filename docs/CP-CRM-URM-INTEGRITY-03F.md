# CP-CRM-URM-INTEGRITY-03F — Genuine signed readiness and disposable role workflow

**Date:** 2026-11-20 (Asia/Manila). **Scope:** functionality-first, no additional production grants, role/member changes or restrictions.

## Authoritative live signed read-only preflight

Two existing independent Chromium sessions were reloaded and queried through their own signed HTTP 200 `wm_auth_access_context` and `apsyntra_crm_my_effective_access` responses. The accounts are genuinely distinct and active. One reports effective CRM Admin and the other Employee, but they have **different selected workspaces**. Consequently `mutationEligible=false` / `BLOCKED` is the correct current result. Both production sessions were left in their existing workspaces; **zero** role, permission, membership, and business writes were attempted. The script emits only pseudonymous account/workspace keys and role labels, never access tokens, names, raw identifiers or request bodies.

The reusable `scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs` attaches only to a loopback CDP endpoint, reloads existing APSYNTRA CRM pages to capture each account's signed response, and classifies the pair. It does **not** call role-writing RPCs, navigate native routes or assume that an ELIGIBLE preflight equals completed mutation. Run on a Mac with two signed QA Chromium tabs and `playwright` installed: `node scripts/cp-crm-urm-integrity-03f-signed-preflight.mjs --cdp-url=http://127.0.0.1:9222`. A BLOCKED exit status is 2, not an application failure.

## Disposable integration verification

The dedicated PostgreSQL 17 CI job exercises the *existing* `apsyntra_role_scoped_six_set` writer against synthetic isolated administrator/employee users and checks assignment receipts, authoritative snapshot, target operational role, effective-access and signed-context readback, foreign workspace preservation, revocation, stale-version conflict and audit rows. The existing 02B acceptance suite is reused rather than inventing a second role-writing pathway. No production database connection is supplied to CI.

## Acceptance boundary and next steps

- VERIFIED: independent signed Admin and Employee sessions, respective signed workspaces and roles; no production changes.
- IMPLEMENTED: reusable read-only signed eligibility preflight and focused tests.
- VERIFIED: PostgreSQL 17 disposable role mutation and projection acceptance passed in GitHub Actions run `44668047896`; the five existing scoped-role matrix CI jobs passed in run `44668047677`. These are isolated fixtures, not genuine signed production mutation.
- BLOCKED: genuinely signed **same-workspace** administrator/employee pair, persisted real target mutation, independent target signed readback, actual native positive/denied actions, refresh/relogin and cross-user synchronization.
- NOT ACTIVATED: the CP-CRM-URM-INTEGRITY-03E owner-native fallback remains a nonproduction candidate; no production permission policy has been altered.

Proceed with **CP-CRM-URM-INTEGRITY-03G — Genuine Same-Workspace Role Mutation and Four-Native-App Cross-Session Closeout** only if signed acceptance remains blocked. Use already-authorized QA identities and a reversible nonproduction assignment. Do not silently change production permission policy or manufacture a pass from synthetic actors.
