# CP-CRM-NATIVE-ACCESS-FINAL — Cross-user effective assignment and startup acceptance

**Date:** 2026-11-20 (Asia/Manila).
**Disposition:** **PARTIAL / BLOCKED** for final universal production acceptance. Assignment and canonical Board audits verified for eligible users; all-user signed runtime acceptance not verified.

## Production read-only assignment results

Queried existing production Supabase project `jtlusodorfnyzgyuewkz` without changing accounts, grants, roles, policies, boards or records. The executable aggregate audit is `scripts/cp-crm-native-access-final-readonly.sql`.

| Module            | Enabled legacy assignments | Effective role and access | Active but denied | Inactive-profile assignments |
| ----------------- | -------------------------: | ------------------------: | ----------------: | ---------------------------: |
| TimeTracker       |                         40 |                        39 |                 0 |                            1 |
| Fund Tracker      |                         36 |                        36 |                 0 |                            0 |
| FuelTrack+        |                         40 |                        39 |                 0 |                            1 |
| TradeLink         |                         40 |                        39 |                 0 |                            1 |
| Order Intake      |                         36 |                        36 |                 0 |                            0 |
| Tool Traceability |                         36 |                        36 |                 0 |                            0 |
| Toolbox Issues    |                          1 |                         1 |                 0 |                            0 |
| Charter Navigator |                         36 |                         1 |                35 |                            0 |

The three ineligible primary-native assignments are held by the same inactive-profile account. Inactivity is respected; no automatic reactivation was attempted.

**Four-application canonical Board acceptance:** TimeTracker **39/39**, Fund Tracker **36/36**, FuelTrack+ **39/39**, TradeLink **39/39**. Total **153/153** eligible native assignments resolve to their workspace's existing active, nonarchived canonical Board. This tests effective assignment _resolution_, not an individual user's browser session.

## Charter Navigator discrepancy

All 36 Charter Navigator legacy module assignments are enabled and the associated profiles/memberships are active. However, only one account has the effective workspace-scoped Charter role. The other **35/36** have **no corresponding `apsyntra_charter_current_role` result**, so authoritative `module_role_for` and `has_module_access` correctly report unavailable for them. Exactly **31** lack an explicit CRM role and **4** have an explicit CRM role but no matching scoped Charter assignment. This is a **legacy/scoped assignment-source discrepancy**, not permission to convert all legacy records into effective grants. Access changes require a separately validated intended-role mapping and user approval; existing role boundaries remain untouched.

## Signed-browser verification blocker

An existing Chromium debug profile on `127.0.0.1:9222` initially displayed a signed TradeLink User session. During read-only navigation to native application routes, the page rendered the **sign-in form** rather than the intended native interface, even though the existing diagnostic startup indicator still reported `AUTHENTICATED`. No native resolver or domain RPC returned during this attempted run. The stale startup indicator is **not evidence of an authenticated user**. The browser was returned to the original URL, and no login credentials, tokens or cookies were accessed. This session cannot establish four-application startup acceptance, let alone an all-user matrix.

Earlier genuine signed employee 403/503 startup testing for four native applications is recorded in `docs/CP-NATIVE-APP-ACCESS-03.md`, but does not substitute for current all-account acceptance. The six-module TradeLink document-draft production test establishes its own workflow, not every assigned account.

## Acceptance gates

- VERIFIED: Existing assignment inventory and effective role/access projection, including inactive-profile exclusion.
- VERIFIED: All eligible effective assignments to four principal native modules resolve to matching canonical Boards.
- VERIFIED: Charter Navigator legacy/scoped mismatch isolated without altering existing grants.
- IMPLEMENTED: Repeatable aggregate read-only SQL audit and zero-write regression contract.
- BLOCKED: Current genuine signed employee runtime cold-start; the QA browser rendered sign-in rather than a live authenticated user.
- PENDING: Per-account, per-assigned-module startup, refresh/reopen, authorized read, and permitted functional workflow acceptance. Other native modules beyond the four canonical resolvers require app-specific acceptance criteria.

## Next implementation, only if needed

**CP-CRM-NATIVE-ACCESS-FINAL-02 — Charter Navigator Scoped Assignment Reconciliation, Genuine Employee Session Recovery, and All-Assigned-User Runtime Matrix.** First determine which of the 35 legacy Charter assignments are intended to become currently effective and what exact scoped workspace role they should have; do not broadly activate roles. Then resume read-only signed-user startup acceptance with independently authenticated employee sessions, verifying actual resolver/domain RPCs and native UI readiness, followed by permitted workflow testing using disposable or designated QA data. Preserve existing security and role policy.
