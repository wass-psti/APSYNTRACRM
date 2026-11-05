# CP-WS-02D/B2 — Board Role-Ceiling and Trusted Provider Adapter Evidence

**Date:** 2026-11-05  
**Classification:** AUTOMATED DISPOSABLE BOARD INTEGRATION VERIFIED; DOMAIN-WIDE AND GENUINE SIGNED-SESSION ACCEPTANCE PENDING.  
**Repository:** `wass-psti/APSYNTRACRM` (`main`).  
**Validated commit:** `9e889be0e40ad17827430b6d9c9227accafe6477`.

## Verified evidence

- [PG17 workflow #41989469639](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41989469639) completed **success**. The job passed signed synthetic workspace lifecycle, invitation replay/revocation, quota, role ceiling and previous regression checks.
- The same workflow passed the backend-only trusted invitation adapter and **mock** Resend transport tests. There was **no real email sending**, approved sender configuration or provider credential.
- The disposable environment reproduced the currently deployed `public.work_board_access(uuid,text)` ACL, staged `sql/cp-ws02d-b2-board-acl-integration-candidate.sql` as a restrictive AND predicate and passed `sql/tests/cp-ws02d-b2-board-acl-integration-acceptance.sql`.
- The new guard requires the existing active signed session, authoritative current workspace, workspace role maximum, platform ceiling, and original board ACL. Negative cases cover Viewer edits/manage, role ceiling escalation, foreign boards, expired sessions and transaction rollback.
- [Pages deployment for the validated commit](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41989469201) completed **success**. Pages deployment does **not** install SQL candidates, activate provider sending or prove authenticated browser flows.

## Fixture issues corrected during verification

1. `e4d0a50b9da921dd1d7eb8e509a5c121e49735f6` — avoid duplicating `profiles.platform_role` after the earlier disposable Auth fixture.
2. `2fef9449bf6d7e67cebab1e62f32d3f4c6471db3` — use the surviving signed synthetic session after earlier revocation acceptance, without weakening revocation guards.
3. `9e889be0e40ad17827430b6d9c9227accafe6477` — check B2 rollback against the previous fixture's actual roles/memberships, rather than assuming empty legacy tables.

These are disposable-test changes; they do not modify production data, users, role grants or authorization functions.

## Live read-only domain inventory (2026-11-05)

A read-only SQL inventory of the **existing** Supabase project (`jtlusodorfnyzgyuewkz`; PostgreSQL 17) executed successfully. It reported:

- **53** public `SECURITY DEFINER` routine source references to `work_board_access`.
- **55** public `SECURITY DEFINER` routine source references to `current_workspace_id`.
- **30** candidate independent, workspace-scoped routine bodies with a possible mutation marker and without a direct `work_board_access` reference.

The 30-name review sample spans TimeTracker, TradeLink, Order Intake, Employee Evaluation, module state and platform/board administration. The scanner is a conservative source-text classification, **not** proof that 30 authorization defects exist. Review each candidate's actual call graph, signed-session check, platform/workspace ceiling, domain RBAC, RLS and negative cases before claiming production coverage.

The inventory SQL is retained in `sql/tests/cp-ws02d-b2-domain-authorization-inventory.sql`. The live query was **SELECT-only** and performed no data, permission, role, schema, invitation or provider mutation.

## Not yet accepted

- **Live board authorization:** staged ACL integration is not installed in the production Supabase project; the existing production function and its dependent callers require read-only fingerprint revalidation before a separately authorized migration.
- **Domain-wide permissions:** 53 historically identified SECURITY DEFINER board-ACL callers and other independent domain/API write/read guards have **not** been individually verified under the new workspace ceiling.
- **Advanced workspace roles:** keep `advanced_roles_enabled=false` in production. The Viewer/Admin preview does not grant real rights.
- **Trusted provider:** the transport is optional and disabled; sender identity/DNS, credentials, signed backend issuance, durable delivery outcome reconciliation, controlled resends and provider deployment remain gated.
- **Invitation lifecycle:** decline, durable expiration handling, concurrency and resend transitions require additional acceptance.
- **Genuine signed sessions:** no controlled live-browser invitation issue, delivery, recipient acceptance, persistence, replay, revocation or cross-workspace denial has been verified for this checkpoint.
- **Production migration:** no production schema/permission migration is authorized by disposable CI; require backup/rollback evidence and separate scoped approval for sensitive production actions.

## Next required gate

**CP-WS-02D/B2 — complete the outstanding board/domain role-ceiling audit, provider integration safety review and genuine signed-session acceptance prerequisites.**

Continue in small verified increments. Maintain one Supabase Auth identity, current platform/board/domain RBAC and RLS, existing workspace isolation, and production default-deny status. Do not activate production invitation sending or advanced workspace roles on the strength of synthetic tests alone.
