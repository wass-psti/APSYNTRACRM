# CP-WS-01C/B3 — Controlled production signed-workspace creation activation

> **Live reconciliation addendum — November 6, 2026 (after the historical zero-record snapshot below).** The earlier pending-creation counts in §5 are **historical**, not current. Direct read-only Supabase catalog and migration checks show `20261106090007` dormant installation and `20261106092625` authenticated activation applied. The production `authenticated` role has EXECUTE on `public.wm_ws01_create(text,text,uuid)`; `anon` and PUBLIC do not; the private signed-session helper remains non-executable by client roles. `creation_enabled=true`, `selection_enabled=false`, B4 switching RPC absent. The committed `sql/tests/cp-ws01c-b3-production-activated-readonly.sql` returned `WS01C_B3_CREATION_ACTIVE_AUTHENTICATED_RPC_ONLY__NO_B4` with all eight security predicates true. The committed `sql/tests/cp-ws01c-b3-genuine-create-audit-readonly.sql` returned `WS01C_B3_GENUINE_CREATE_PERSISTENCE_AND_AUDIT_INTEGRITY_PASS`: **1** creation request, **1** fully integrated request, **0** violations, **3** workspaces, **41** active memberships, **1** matching creation event. An independent aggregate check correlated that event to **1** actual `auth.sessions` row for the same actor, **1** confirmed nonanonymous `auth.users` row, and **1** request; **0** event session IDs were missing. Exactly one recorded creation/request/event occurs after the activation timestamp. Checks only read catalog and record aggregates: **no workspace, membership, role, permission, flag or production data was changed by reconciliation**. The current `main` head inspected was `aa41c5db02e080257051fe53a4c7436db2a2c7d3`. Historical release Actions runs `42195381575` (5/5 jobs), `42195381697` (1/1 job) and `42195380885` (3/3 jobs) were independently retrieved with successful job conclusions. **Acceptance boundary:** A recorded database-backed creation is verified, but the originating browser's signed RPC receipt was not observed in this session. Independent live unauthorized/revoked/cross-workspace denial and real retransmission acceptance remain pending; previous disposable PG17 test success is not a replacement. Browser-context inspection was unavailable without the originating connected browser. No additional activation, switching or user mutation is authorized by this addendum.


**Date:** 2026-11-06 (Asia/Manila).  
**Project:** Existing `WatchdogWorkspace`, Supabase ref `jtlusodorfnyzgyuewkz`, PostgreSQL 17.6.  
**Current classification (latest live database reconciliation):** **SIGNED CREATION PERSISTENCE AND AUDIT INTEGRITY VERIFIED; ORIGINATING BROWSER RECEIPT AND LIVE NEGATIVE-CASE ACCEPTANCE PENDING.**  
**Authorization:** User explicitly initiated `CP-WS-01C/B3 — Controlled Authenticated Creation Grant, Lifecycle Activation and Genuine Signed-User Acceptance`. This enabled the named production grant and creation flag, not B4 workspace switching, role administration or unrestricted record access.

## 1. Verified baseline and security source lock

Immediately before production activation, the independently executed dormant post-install audit reported:
```text
B3_DORMANT_SIGNED_CREATE_CONTRACT_INSTALLED__NO_CLIENT_EXECUTE_NO_CREATION
creation_and_switch_off=true
dormant_functions_secured=true
private_workspace_tables_default_deny=true
existing_member_discovery_preserved=true
direct_workspace_writes_denied=true
create_requests=0
lifecycle_events=0
existing_workspaces=2
active_memberships=40
```

The signed function sources were pinned to the live PG17 MD5:
- `private.ws01_signed_actor_session()`: `25a49e8acb1429110456c4de2211691e`.
- `public.wm_ws01_create(text,text,uuid)`: `63395e8cb451560b16fd2ccb07a8d20c`.
Both are `SECURITY DEFINER`, owned by `postgres`, with locked `search_path=""`. The private helper has no direct `anon` or `authenticated` EXECUTE; `wm_ws01_create` enforces a real live `auth.sessions` lookup, verified nonanonymous account, active profile, existing active workspace membership, and fail-closed `creation_enabled` before any write.

## 2. Exact production activation and rollback boundary

The immutable reviewed candidate `sql/cp-ws01c-b3-controlled-production-activation-candidate.sql` was augmented with source/ACL locks, pre/postcondition checks and a transactional PostgREST schema reload notification in `sql/cp-ws01c-b3-reviewed-production-activation-20261106.sql` (Git blob `aef8eb3b0061ec169953abec83f97eb18bf94456`).

**Applied migration SUCCESS:** `20261106092625_cp_ws01c_b3_controlled_authenticated_create_activation_20261106`.

Exactly two production authorization changes were made **atomically**:
1. `GRANT EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid) TO authenticated;`
2. `UPDATE private.ws01_lifecycle_flags SET creation_enabled=TRUE WHERE id IS TRUE AND creation_enabled IS FALSE AND selection_enabled IS FALSE;`

The transaction asserts existing function source and owner, client-deny baseline, private-table RLS, no B4 `wm_ws01_select`, preserved signed discovery, unchanged direct INSERT grants and zero unexpected request/event rows. The PostgREST schema notification was emitted after successful database transaction commit.

The [emergency fail-closed disable candidate](../sql/cp-ws01c-b3-controlled-production-disable-candidate.sql) can atomically set `creation_enabled=false` and revoke `authenticated` EXECUTE while **preserving all committed workspaces, memberships, idempotency receipts and audit records**. It is **not executed** unless incident recovery or separate operator instruction requires it. The corresponding disposable activation + rollback test passed on PostgreSQL 17.

## 3. Independently verified post-activation state

Executed `sql/tests/cp-ws01c-b3-production-activated-readonly.sql` against the actual existing production project, again **after** releasing the frontend. Result:
```text
WS01C_B3_CREATION_ACTIVE_AUTHENTICATED_RPC_ONLY__NO_B4
source_boundary_locked=true
create_rpc_minimal_authenticated_grant=true
private_session_guard_not_directly_exposed=true
creation_only_enabled=true
private_workspace_tables_default_deny=true
existing_signed_discovery_preserved=true
direct_workspace_insert_denied=true
b4_switching_absent=true
creation_requests=0
created_audit_events=0
workspace_count=2
active_memberships=40
```

Security advisor result: `authenticated_security_definer_function_executable` warns for `public.wm_ws01_create`, as expected for the intentionally granted definer RPC. It is a high-privilege boundary, not a reason to disable RLS or broaden grants. Continue reviewing it as production security-sensitive surface. [Supabase remediation reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## 4. Frontend activation and genuine user's next action

[Focused release PR #40](https://github.com/wass-psti/APSYNTRACRM/pull/40) **squash-merged** into `main` as `e6575e1078eabe461fd178e00ad81aaf47633151`. Later main `e1b905763d21ae463dafa703b4c9ddc67c595cf5` contains the same `frontend/workspace-ui.js` blob with `WS01_CREATION_ENABLED=true`, the signed `WorkspaceLifecycleClient` and the existing AuthClient/DomainApi injection. `WS01_DISCOVERY_ENABLED=false` and `WS01_SWITCHING_ENABLED=false` remain unchanged.

The modal now offers **Create workspace** rather than **Validate draft** for a genuinely signed existing user. Before sending the RPC, it validates the name/privacy and a crypto-strong per-draft idempotency UUID, prevents double submission, and uses `auth.getVerifiedUser()` plus authoritative `api.context()`. Success requires the correct owner receipt and rechecks the same signed actor and active workspace; it never silently switches.

Main-branch evidence:
- [Frontend/integration/live Pages smoke 42195381575](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42195381575): **SUCCESS**, **1,091/1,091** frontend tests, disposable PostgreSQL integration jobs and exact Pages asset smoke for main `e1b905763d21ae463dafa703b4c9ddc67c595cf5`.
- [Disposable Workspace Lifecycle PG17 42195381697](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42195381697): **SUCCESS**, 42/42 frontend/workspace tests, 44/44 backend tests, positive dormant and active phase catalog checks, `CP_WS01C_B3_CONTROLLED_DISPOSABLE_ACTIVATION_AND_ROLLBACK_PASS`.
- [Pages deploy 42195380885](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42195380885): **SUCCESS**.

The initial main runs for the merge SHA were cancelled by a subsequent main commit; the above **latest main commit** has completed successful replacement validation.

## 5. Outstanding genuine signed-user acceptance

A further read-only audit `sql/tests/cp-ws01c-b3-genuine-create-audit-readonly.sql` ran in production. Current result:
```text
WS01C_B3_GENUINE_CREATE_PENDING__NO_RECORD
created_requests=0
fully_integrated_requests=0
violations=0
total_workspaces=2
active_memberships=40
creation_events=0
```

**No genuine signed-user production workspace has yet been created or verified.** The assistant cannot access the user's originating signed CRM browser token through the current connected browser interface. No test accounts, service-role JWTs, forged identities, SQL impersonation, user/workspace IDs, or test records were used to fabricate acceptance.

To complete this gate, under an **existing legitimately signed user with an existing active membership**, in the live [Security view](https://wass-psti.github.io/APSYNTRACRM/#/security), refresh, open **Add new workspace**, enter the name of a workspace **you genuinely intend to keep** (not a disposable TEST record), select **Closed** unless another privacy choice is appropriate, and click **Create workspace** exactly once. This creates a **persistent** production workspace, workspace-local owner membership, privacy policy, idempotency receipt and audit event. It **does not** select the new workspace; that requires the separately gated B4 switching capability.

Report only the displayed status/message, never a JWT, user ID, workspace ID, request UUID or credentials. Then execute the committed read-only audit and inspect counts/correlation across workspace, member, owner, privacy, request and event tables. A genuine server receipt plus matching audit/persistence evidence is required for **positive** signed-user acceptance. Independent negative tests (revoked/nonmember/foreign sessions and row-level isolation), idempotency under actual retransmission, and permission-ceiling certification need separate concrete evidence; the synthetic PG17 pass does not replace them.

**Current status:** Production activation, authorization boundaries, frontend deployment and CI **VERIFIED**. Genuine persisted signed-user creation and full cross-user negative security acceptance **PENDING**. Avoid labeling the entire per-user workspace capability production-certified or complete from these milestones alone.
