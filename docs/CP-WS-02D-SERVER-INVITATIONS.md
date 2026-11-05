# CP-WS-02D — Server-Authorized Workspace Invitations

**Status (2026-11-05): IMPLEMENTED-UNVERIFIED for production; disposable PostgreSQL 17 integration PASS; production delivery/activation PENDING.**

This gate implements and exercises **dormant server-side invitation contracts** in repository `wass-psti/APSYNTRACRM`, preserving the approved separate platform-role and workspace-role ceilings. It does not activate invitations in the existing Supabase project.

## Approved behavior and safety boundary

- An explicitly recorded workspace **Owner**, or a separately delegated workspace **Admin** after advanced-role authorization is enforced, may invite eligible email recipients **to the current authoritative workspace only**.
- Invitations confer **no membership on issuance**. Only verified, non-anonymous users with a live signed session and matching verified email may accept a valid pending, unexpired, unrevoked one-time token. Successful acceptance atomically creates a workspace membership, a non-owner legacy role, additive scoped role metadata, and an audit event. It never switches active workspace.
- Workspace roles **Admin, Member, Viewer** are distinct from `public.profiles.platform_role`. The legacy private `ws01_member_roles` check supports only `owner/member/collaborator`; the candidate uses a separate private `ws02d_member_access` table without changing existing rows. **Advanced Admin and Viewer are disabled by default** until board/application permission ceilings enforce their actual semantics. A Viewer must never inherit legacy write authorization.
- No invitation sends, email-provider hooks, SMTP, browser-side token access, user creation, workspace migration, global role assignment, or direct client table grants have been activated.

## Staged implementation

| File | Contract |
| --- | --- |
| `sql/cp-ws02d-invitation-schema-candidate.sql` | Four private RLS/default-deny tables: activation/advanced-role flags, additive scoped membership roles, invitations and append-only action events. Stored invitation secrets are per-row salted SHA256 digests of 256-bit random tokens; raw tokens are not persisted. State enum: pending/accepted/declined/expired/revoked. |
| `sql/cp-ws02d-invitation-issue-candidate.sql` | Private, ungranted signed issuer checks active GoTrue session, email verification, current server-authoritative workspace, explicit Owner or gated delegated Admin, input role, idempotency request and 24-hour expiry. New plaintext token is returned **once only to a future trusted mail process**, never by a browser RPC. Replay does not reveal or regenerate token. |
| `sql/cp-ws02d-invitation-accept-candidate.sql` | Private, ungranted signed acceptor locks token row, verifies salted digest, state, expiry, sender-scoped workspace and recipient verified email. Rejects existing memberships (prevents role escalation/reactivation) and token replays; atomically admits new member, non-owner legacy role, scoped role metadata and audit. |
| `sql/cp-ws02d-invitation-revoke-candidate.sql` | Private, ungranted signed owner/delegated-admin revocation of pending tokens only, with audit. Cannot revoke finalized acceptance. |
| `sql/tests/cp-ws02d-disposable-schema-acceptance.sql` | Default-off flags, RLS and table grants, role allowlist, ownership FK, hashed-token constraints, no premature membership and rollback. |
| `sql/tests/cp-ws02d-disposable-issue-accept.sql` | Disabled issuance, owner issuance, idempotent retry, disabled Viewer role, mismatched email denial, one-time acceptance, atomic membership and audit, no automatic switch and rollback. |
| `sql/tests/cp-ws02d-disposable-revoke-denial.sql` | Ordinary-member/foreign-scope issuance denial, nonowner revocation denial, owner revocation, revoked/expired token denial, revoked/expired GoTrue session denial, no membership changes and rollback. |
| `.github/workflows/cp-ws01b-disposable-postgres.yml` | Runs staged WS02D schema and lifecycle tests **before B4 selection installation** with existing B1/B2/B3 and WS02B regressions. |

All private lifecycle functions have `SECURITY DEFINER SET search_path=''` and explicit revoked `PUBLIC,anon,authenticated` execution grants. **No production or client delivery role is granted**, and `private.ws02d_invitation_flags.enabled=false` plus `advanced_roles_enabled=false` remain installation defaults.

## Verification evidence

- [Isolated PostgreSQL 17 workflow #75](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41985272232) **completed SUCCESS**. Its named WS02D staging/acceptance steps and prior B1/B2/B3, verified-email provisioning and denial regressions passed. This is **synthetic signed-session** acceptance, not genuine GoTrue browser/email delivery.
- After the workflow, read-only production SQL verified `private.ws02d_invitation_flags`, `private.ws02d_invitations`, `private.ws02d_member_access`, and all three private invitation functions **absent**. B3 creation and B4 selection RPCs absent, lifecycle flags disabled. Production inventory remains **2 workspaces / 40 active memberships**.
- `frontend/workspace-ui.js` retains `WS02_INVITATIONS_ENABLED=false` and a permanently disabled send button. The existing invitation modal is a safe draft/preview, not a sending feature.
- No production SQL DDL/DML, Auth trigger change, role/permission grant, account update, notification, invitation, workspace membership or provider setting change occurred.

## Remaining acceptance and release blockers

1. **Role ceilings:** prove server-side board/application RLS and API enforcement of workspace Admin/Member/Viewer, including Viewer write denial. Do not enable `advanced_roles_enabled` merely because a role appears in the UI.
2. **Trusted delivery integration:** select a secure email provider/backend boundary; prevent raw token exposure to a browser or logs, verify redirect origin and invite link lifetime, implement retries/resend without duplicating membership or relying on token replays, and audit delivery failures. No client currently connects to the private issuance function.
3. **Abuse controls:** enforce recipient/send rate limits, quotas, normalization, anti-enumeration, sender revocation and delivery verification. Multi-email batch UX remains preview-only.
4. **Remaining state transitions:** implement and test recipient decline, durable expiry-state handling, resends/reissue, ownership/delegation changes and invite lifecycle retention. The schema's state enum alone does not implement every transition.
5. **Concurrency and strict denial:** test genuine parallel issuance/acceptance, revoked/expired sessions, users with existing inactive memberships, foreign workspaces and administrator role changes against live signed traffic in a controlled test environment. Current checks use disposable synthetic sessions.
6. **Production authorization:** explicitly approve installation of private schema/SECURITY DEFINER functions, separate trusted delivery grants, recipient activation, outbound email provider and any permission changes. Verify recoverable backup/rollback evidence first. Never bypass repository or Supabase security controls.

**Next required gate: CP-WS-02D/B — Trusted Invitation Delivery, Role-Ceiling Integration and Genuine Signed-Session Acceptance.** Production stays blocked until its evidence is verified.
