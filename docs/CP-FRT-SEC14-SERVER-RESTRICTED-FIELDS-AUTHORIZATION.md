# CP-FRT-SEC14 — Server-Side Restricted-Field Protection and Financial Action Authorization

**Date:** 2026-11-01 (Asia/Manila). **Repository:** `wass-psti/APSYNTRACRM`, direct `main`.

## Scope and authority

Build on SEC13's existing authenticated FRT Finance tab without introducing new roles, independent authentication, a new board, a new finance backend or production finance mutations. The existing `private.frt_current_role` session guard and centralized workspace role ceilings remain authoritative. Server eligibility previews are informational; the existing `frt_request_action` RPC remains the execution authority and is not called by the read-only UI.

## Canonical deliverables

- `sql/cp-frt-sec14-restricted-details-action-access.sql`: single additive `frt_restricted_request_detail(p_workspace_id uuid,p_request_id uuid)` function, authenticated caller and deployed role resolver required, validated workspace/request join, explicit allowlisted request metadata, and eight *server-computed* role-and-lifecycle workflow candidates tagged `SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY`. Explicitly excludes bank, recipient, requestor, amount, attachment, comment, nested liquidation/audit, and item values. Restricts execution of the new RPC to authenticated callers and revokes authenticated/PUBLIC/anon execution of the old `frt_get_request` in the same transaction.
- `frontend/frt-finance-workflow.js`: calls only `frt_restricted_request_detail`, validates signed caller/workspace/FRT role and current company access, validates backend server-preview schema and fails closed on inconsistencies; never calls financial mutation RPC.
- `frontend/frt-finance-ui.js`: displays only escaped, allowlisted request data and non-executable workflow eligibility.
- `frontend/tests/frt-finance-workflow.test.mjs`: verifies new server preview contract, denied or stale user/company/workspace, sensitive-field omission and absence of old broad detail and write paths.
- A superseded alternate SQL draft was removed from `main` to prevent conflicting function names or unintended migrations.

## Verified evidence

GitHub Actions [run #41293369004](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293369004), implementation commit `5a9159dc3c10e05a310a41d801fe2d6322084966`, completed **SUCCESS**, including frontend **222/222 PASS**, disposable PostgreSQL and live Pages checks. [Pages deployment #41293368957](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293368957) completed SUCCESS on that same implementation SHA.

Read-only production Supabase inspection after these commits: `public.frt_get_request(uuid,uuid)` remains callable by authenticated role; `public.frt_restricted_request_detail(uuid,uuid)` does not yet exist. Therefore **the new field-level server boundary is not deployed or production-verified**. Browser-side redaction does not prevent an authorized caller from receiving the broad old payload. Do not represent SEC14 as deployed or fully accepted.

## Eight acceptance gates

| Gate | State |
| --- | --- |
| Authoritative legacy request detail and workflow action rules inspected | VERIFIED |
| Server-side restricted-field and workflow preview migration authored | VERIFIED source |
| New authenticated-only RPC and legacy entry-point revocation scripted together | VERIFIED source |
| Existing frontend calls restricted RPC and checks signed role/workspace/company | VERIFIED by CI |
| Read-only workflow presentation and deny/stale/secret regression tests | VERIFIED by CI |
| Frontend, disposable PostgreSQL and Pages integration validation | VERIFIED |
| Controlled production migration and postactivation role/grant/redaction checks | PENDING — NOT DEPLOYED |
| Genuine signed operator read/denial and financial action authorization acceptance | PENDING — no finance writes executed |

**SEC14 development milestone: 6/8 gates verified = 75%**. Production field-level protection and finance execution authorization are not certified. CI07's earlier three administratively waived runtime gates cannot be treated as proof of these SEC14 gates.

## Next action and safety boundary

Controlled deployment requires independent compatibility verification for any existing consumers of `frt_get_request`, an exact predeployment schema/grant comparison, rollback and postdeployment checks, and review of actual signed actors. Revoking an existing production executable function is a material live access-control change; it can break other FRT clients and requires the separate production-change authorization exception. Do not run the migration or grant new financial mutation powers based only on successful mocked/browser tests. Preserve all production role assignments and financial records.
