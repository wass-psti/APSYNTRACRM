# CP-WS-02D/B — Trusted Invitation Delivery, Role Ceilings and Signed Acceptance

**Status — 2026-11-05:** `AUTOMATED DISPOSABLE TESTS PASS / PRODUCTION ROLE INTEGRATION AND LIVE SIGNED INVITATION ACCEPTANCE PENDING`.

**Architecture:** Existing APSYNTRA CRM, one GoTrue identity, many isolated workspaces, existing Supabase project `jtlusodorfnyzgyuewkz`. There are no new production invitation tables, permissions or delivery providers. Do not confuse a passing fake signed-session test or dry-run email adapter with a genuine browser/GoTrue invitation send.

## Evidence and source

| Control | Staged artifact | Evidence classification |
| --- | --- | --- |
| Signed owner/delegated-admin invocation, token hashing, one-time accept, revoked/expired denial | `sql/cp-ws02d-invitation-{schema,issue,accept,revoke}-candidate.sql` | VERIFIED IN ISOLATED PG17 |
| Per-actor quota (max 5 hourly per workspace), per-recipient quota (max 2 daily per workspace), actor/workspace lock for concurrent senders, existing-member denial | `sql/cp-ws02d-invitation-issue-candidate.sql` | VERIFIED SEQUENTIALLY IN PG17; genuine parallel concurrency PENDING |
| Legacy-compatible additive maximum workspace role ceiling, verified GoTrue actor/session binding, advanced Admin/Viewer disabled by default | `sql/cp-ws02d-permission-ceiling-candidate.sql` | VERIFIED IN PG17; board/API integration PENDING |
| Backend-only, provider-neutral mail adapter, canonical Pages invitation link, role/member-only, strict input validation, nonrecoverable-token idempotent handling, redacted failures | `server/ws02d-trusted-delivery.mjs` | UNIT-VERIFIED WITH MOCK PROVIDER; NO SMTP/API DELIVERY |
| Provider-adapter unit tests | `server/tests/ws02d-trusted-delivery.test.mjs` | VERIFIED NODE 22 CI |
| Actor and recipient quotas, replay and rollback | `sql/tests/cp-ws02d-disposable-rate-limits.sql` | VERIFIED PG17 CI |
| Owner, Viewer, Admin, Member upper-bound denial (including revoked session), rollback | `sql/tests/cp-ws02d-disposable-role-ceiling.sql` | VERIFIED PG17 CI |
| Production default-deny and board ACL fingerprint | `sql/tests/cp-ws02d-b-production-readonly-preflight.sql` | VERIFIED LIVE READ ONLY |

[GitHub Actions workspace lifecycle run #87](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41987273034) completed **SUCCESS** for the Node 22 trusted-delivery tests, original B2/B3/WS02B regression tests, signed invitation lifecycle, quotas and role-ceiling predicates. The tests use synthetic accounts, do not send email and do not insert production invitation or membership data.

## Production baseline

The committed read-only preflight returned:

```
WS02D_B_DEFAULT_DENY_VERIFIED__ROLE_INTEGRATION_AND_PRODUCTION_APPROVAL_PENDING
```

- All WS02D private tables and functions remain absent from production; `wm_ws01_create`/ `wm_ws01_select` absent and lifecycle flags disabled.
- `extensions.pgcrypto` digest and random-byte functions are present. Workspaces: **2**; active memberships: **40**.
- Current live `public.work_board_access(uuid,text)` function fingerprint is `6a7c23c439e8c59d7883bc8f59d66d08`. **53 existing public SECURITY DEFINER routines** reference `work_board_access`. The staged maximum role predicate is not part of that live ACL today.
- The existing board ACL checks active profile, current workspace, platform explicit ceiling, board member role and platform admin. **Viewer invited via WS02D is not yet integrated** into that ACL or every domain write guard. Enabling `advanced_roles_enabled` before that review could allow unintended editing. **KEEP FALSE**.
- The browser invitation preview remains `WS02_INVITATIONS_ENABLED=false`; its Send button remains disabled. The new delivery adapter is *not imported by the browser*, not deployed, and no provider credentials are configured.

## Trusted delivery boundary and no-token rule

The staged backend-only `submitTrustedWorkspaceInvitation()` expects separately provided `issueForSignedActor` and `sendEmail` adapters. The first **must** authenticate the genuine GoTrue actor and verify their live workspace-owner/delegated-admin ceiling through a trusted backend; simply using a service-role database connection is **not** caller authentication. The second must be configured with server-only credentials and originate from an approved email sender. The mail link uses the fixed APSYNTRA Pages HTTPS host with a fragment route, limiting token exposure in HTTP server URLs. The recipient browser still handles the bearer secret; disable telemetry, logs, analytics and any unintended referrer exposure for the invitation route.

The raw one-time token is emitted only by the private issue function to an eventual trusted mail component, never included in a response to the caller or browser. Existing request-key replay gives no second token and must not cause another send. Provider errors return redacted failure messages; ambiguous delivery requires manually controlled reconciliation, not automatic creation of a new invitation. **No provider send is implemented or activated**. Failed delivery/revocation audit states and provider-specific retries are not yet implemented. No live email or external provider was used during this gate.

## Role model

The `private.ws02d_workspace_ceiling` function returns only a **maximum** capability bound for `view/edit/manage`, and requires the same active signed actor and current authoritative workspace. Legacy owners remain workspace-scoped, ordinary invited Members may have at most view/edit, gated Viewers at most view and gated Admins at most view/edit/manage. It never grants board or domain rights by itself. Each board/resource RPC must also pass its existing server-side RBAC/RLS and platform role ceiling; the signed predicate must be applied **as an AND**, not an OR. Until every path is covered and signed Viewer denial is verified, do not activate advanced roles.

## Remaining gates (no production mutations authorized)

1. **Audit all board and domain operations**, including the 53 current board-ACL callers, and stage/verify integrated owner/Member/Admin/Viewer enforcement. Include negative Viewer writes, an Admin's platform-ceiling denial, revoked workspace memberships, and foreign-workspace access.
2. **Implement and test a real trusted mail component**, with domain/redirect allowlist, signed-scope verification, provider choice, secrets management, quotas/cooldowns, audit, delivery failures, resend and anti-enumeration controls. Provider and secrets are currently unset; the domain adapter is a contract, not a sending feature.
3. Complete **decline, durable expiration, controlled resend/reissue, delivery reconciliation and rate-limit concurrency** with explicit state transitions; synthetic rate tests are sequential.
4. Obtain **genuine, controlled signed-session acceptance**: two separate authorized roles, eligible recipient with verified email, unrelated foreign user, revoked/expired sessions, owner/nonowner send denial, acceptance/replay/revoke, refresh persistence, and full audit—using approved test identities and no uncontrolled production data.
5. Before any production DDL/function grants/roles/emails, confirm independently recoverable backups/rollback, current provider settings and necessary separate scoped production approvals. Keep B3/B4 and signup controls independently gated.

**Next required checkpoint: CP-WS-02D/B2 — Board/Domain Role-Ceiling Integration and Trusted Provider Adapter Acceptance.** `CP-WS-02D/B` is not complete and production-ready status is not claimed.
