# CP-FRT-SEC14 — Server-Side Restricted-Field Protection and Financial Action Authorization

**Baseline:** 2026-11-01 Asia/Manila. Direct GitHub `main`. Supabase production project `jtlusodorfnyzgyuewkz`.

## Security defect and remediation scope

Existing `public.frt_get_request(uuid,uuid)` exposes a broad JSON response with amounts, banking, recipient, requester, attachments, audit and liquidation details to any signed member admitted by `private.frt_has_membership`. SEC13's client projection only hid those fields from app state/DOM, not the wire response or browser DevTools. The server SQL shows `public.frt_request_action` already performs locked-row, role and lifecycle checks for eight financial actions and writes server-side audit entries. SEC14 must **preserve** this authoritative mutating RPC and must not introduce frontend mutation authority.

## Implemented artifacts

- `sql/cp-frt-sec14-restricted-details-action-access.sql`: a single transaction adds `public.frt_restricted_request_detail(uuid,uuid)`. It enforces `private.frt_current_role` (therefore the installed session guard and central FRT role ceiling), fetches only selected request columns for the provided workspace and request, returns a strict allowlist of read-only fields, computes eight informational role-and-lifecycle `eligible` flags on the server, limits EXECUTE to `authenticated`, and revokes `PUBLIC`/`anon`/`authenticated` EXECUTE on legacy `frt_get_request` in the same migration. No financial write RPC or stored role has been modified. This migration has **not** been applied to production.
- `frontend/frt-finance-workflow.js`: client now requires `frt_restricted_request_detail` instead of `frt_get_request`. It only admits exact trusted server action codes/boolean flags with the literal `SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY` authority. It rejects unexpected server claims and continues to report `NOT_VERIFIED_FOR_EXECUTION`. No action is made executable, and it continues signed identity/workspace/company/role revalidation.
- `frontend/tests/frt-finance-workflow.test.mjs`: updated fixtures validate new backend endpoint and action authority contract; adds tests for malformed, out-of-order and over-authorized server eligibility, and prevents accidental client regression to the legacy broad RPC.
- `sql/cp-frt-sec14-restricted-details-rollback.sql`: explicit compatibility recovery restores legacy authenticated EXECUTE and removes authenticated execution of the restricted RPC. This **reopens the original over-broad detail surface**, so it is a temporary emergency recovery only, not equivalent security posture.

## Verified development evidence

The implementation-source GitHub Actions workflow [#41293369004](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41293369004) completed **SUCCESS** for frontend (**222/222 PASS, zero failures**), disposable PostgreSQL, and live GitHub Pages smoke at implementation commit `5a9159dc3c10e05a310a41d801fe2d6322084966`. The subsequent rollback-file-only commit does not change application code. These CI jobs verify source/frontend/disposable database contracts; they do **not** validate the new SQL migration applied against signed production users.

Read-only production preflight: **0 FRT requests**, **10 RLS-enabled FRT tables**, deployed private FRT session guard present, restricted RPC absent, legacy broad authenticated detail RPC still callable. This is expected until migration activation and does not establish live field redaction.

## Release gates

| Gate | Classification |
| --- | --- |
| Live existing RPC/action definitions inspected | VERIFIED |
| Strict server projection + role/lifecycle preview migration authored | IMPLEMENTED-UNVERIFIED (migration not executed) |
| Frontend restricted RPC integration and malformed-contract tests | VERIFIED by source + CI |
| 222/222 frontend, disposable Postgres and Pages smoke | VERIFIED |
| Exact compatibility rollback authored | IMPLEMENTED-UNVERIFIED |
| Production legacy consumer analysis and coordinated revoke window | PENDING |
| Controlled production migration with grant/denial postchecks | PENDING |
| Genuine signed-user restricted request detail and finance workflow acceptance | PENDING (no genuine FRT requests currently present) |

**Acceptance boundary:** SEC14 code and automated frontend integration are implemented and source-tested; **production server-side field protection is NOT ACTIVE**. Do not call the migration production-deployed. Executing this migration would revoke an existing production API contract and materially affect authenticated clients; controlled consumer compatibility and rollback authorization is required before production execution. No production finance records, roles or permissions were changed in this milestone.

**Next authorized engineering actions:** isolated SQL migration validation on a disposable PostgreSQL database, enumerate consumers of the old `frt_get_request` RPC, validate RPC postchecks and prepare a controlled deployment handoff. Do not manufacture production FRT transactions or treat a read-only eligibility preview as execution authorization.
