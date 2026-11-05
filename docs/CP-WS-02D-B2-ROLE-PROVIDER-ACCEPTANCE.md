# CP-WS-02D/B2 — Board/Domain Role-Ceiling Integration and Trusted Provider Adapter Acceptance

**2026-11-05 classification:** `STAGED — DISPOSABLE BOARD INTEGRATION AND MOCK PROVIDER ACCEPTANCE VERIFIED — LIVE DOMAIN/SIGNED ACCEPTANCE PENDING`.

**Approved development scope:** APSYNTRA CRM repository `wass-psti/APSYNTRACRM`, existing Supabase project `jtlusodorfnyzgyuewkz`. All new SQL remains uninstalled in production. **No email provider is selected or activated**, no real email is sent, and no accounts, roles, permissions, board records or memberships are modified in production.

## 1. Board ACL integration

### Verified production baseline

`public.work_board_access(uuid,text)` is the authoritative board view/edit/manage predicate. Its live definition was inspected read-only. The original definition fingerprint is `6a7c23c439e8c59d7883bc8f59d66d08`. It checks active profile, authoritative current workspace, platform explicit-role ceilings and existing board member role, with a platform-administrator shortcut.

**53 public SECURITY DEFINER routines reference `work_board_access`.** An `AND` role ceiling placed *before* the platform-administrator shortcut is the least invasive central board change for these callers; it does not replace their resource ACLs or grant new rights.

### Staged candidate (NOT installed)

- `sql/tests/cp-ws02d-b2-board-acl-fixture.sql` reproduces the live board ACL semantics and existing signed-session/platform helpers using synthetic PostgreSQL 17 identities.
- `sql/cp-ws02d-b2-board-acl-integration-candidate.sql` keeps the original function signature, platform cap, board membership rules and existing EXECUTE privileges, but adds `IF NOT private.ws02d_workspace_ceiling(ws,caller,p_required) THEN RETURN false;` **before** any platform-administrator shortcut.
- `sql/tests/cp-ws02d-b2-board-acl-integration-acceptance.sql` covers legacy Owner, platform administrator subject to workspace Viewer restriction, ordinary Member editor, workspace Admin subject to platform-role and board ACL restrictions, foreign board denial, revoked GoTrue sessions, and transactional rollback relative to earlier disposable lifecycle fixtures.
- The private `ws02d_workspace_ceiling` helper requires the same signed caller, current active workspace, active profile/membership and a live session, and denies elevated Admin/Viewer roles while `advanced_roles_enabled=false`. This helper is a **maximum permission** only, never sufficient to create board/domain permission by itself.

**Automated verification:** [GitHub Actions PG17 Run #99](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41989469639) completed **SUCCESS**. The named `Reproduce deployed board ACL`, `Stage minimal AND-integrated board role ceiling`, and `Prove platform ceiling, Viewer denial, resource ACL and revoked-session integration` steps all succeeded. Earlier failures came from synthetic fixture drift (already-present profile role column, deliberately revoked test session and previously retained workspace records), not from production changes; the passing run uses an active synthetic session and baseline-preserving rollback.

**Production boundary:** The active board ACL has **not** been replaced. No new client grants or RLS policies are installed. The live ACL fingerprint must be rechecked immediately before any independently authorized production migration, followed by real signed-board and denied-write acceptance.

## 2. Independent domain authorization inventory

The checked-in read-only query `sql/tests/cp-ws02d-b2-domain-authorization-inventory.sql` classified public SECURITY DEFINER routine source text (names only, no user data). It found:

| Inventory dimension | Count |
| --- | ---: |
| Routines referencing `work_board_access` | 53 |
| Routines referencing `current_workspace_id` | 55 |
| Potential independent mutation paths with workspace scope but **no textual board ACL call** | 30 |

The 30 candidates include TimeTracker attendance, Order Intake writes, Employee Evaluation, TradeLink, charter administration and module state operations. **A textual match is an audit queue, not proof that these routines are insecure**: several have separate domain-specific RBAC already. Each requires a targeted contract review and controlled integration of the workspace maximum ceiling **alongside** existing domain authorization, followed by valid/denied signed-session tests. Changing the board ACL alone **does not** establish domain-wide Viewer write denial.

No one-size-fits-all rewrite of these 30 functions was attempted because that risks altering approved module authorization and existing production workflows.

### First independent write-path integration: board creation (disposable)

The review of the 30 independent mutation candidates identified two core paths that create new boards without an existing board ACL check:

- `public.wm_create_board(text,text)` — live original MD5 `8925b3f3203d41306cfbc8a8f21bae87`.
- `public.wm_create_board_configured(text,text,jsonb)` — live original MD5 `46576d8e4a295fa95f158d87dc1f0504`.

The approved Member UX allows creating and editing boards, while Viewer is read-only. The review-only `sql/cp-ws02d-b2-board-create-ceiling-candidate.sql` adds `private.ws02d_workspace_ceiling(ws,caller,'edit')` **after authoritative current-workspace resolution but before either board insertion**, keeping all original validation, group/column initialization, board ownership, audit, function signature and existing grants. It adds no administrator privilege or cross-workspace access.

`sql/tests/cp-ws02d-b2-board-create-fixture.sql` reproduces the original functions with synthetic supporting tables. `sql/tests/cp-ws02d-b2-board-create-acceptance.sql` verifies ordinary Member creation, configured columns, board Owner membership/audit, Viewer denial both with advanced-role flag off and on, scoped Admin without platform-admin elevation, foreign member's own workspace, expired GoTrue session denial, and complete transaction rollback.

[Isolated PG17 Run #104](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41990746425) completed **SUCCESS**, including these three new steps and the earlier board ACL, invitation and provider mock regressions. **The live board-creation RPCs are unchanged.** These 2 of the 30 inventory paths now have isolated staged integration evidence; the other **28 independent review candidates remain unintegrated**. They must not be mass-rewritten without separate domain-specific authorization review.

## 3. Optional trusted provider adapter (not selected, not live)

- Existing `server/ws02d-trusted-delivery.mjs`: backend-only orchestration, requiring injected `issueForSignedActor` that must verify the genuine GoTrue caller and workspace ownership; never returns a bearer invitation token to the browser. No deployed handler or provider credentials.
- New **optional** `server/ws02d-resend-transport.mjs`: a fixed-origin `https://api.resend.com/emails` transport with an explicit disabled default, caller-supplied server-only API credential and verified sender address, strict email/message validation, no redirect, 8-second timeout, redacted provider errors and an `Idempotency-Key` based on the invitation record ID.
- New `server/tests/ws02d-resend-transport.test.mjs`: injected HTTP mock verifies exact request, secret isolation, enabled/disabled behavior, invalid-input denial, rate/HTTP error redaction and end-to-end orchestration with a fake provider response. This sends **zero real emails**, requires **zero** API keys, and adds **zero** dependencies.
- [Resend's documented email idempotency keys](https://resend.com/blog/engineering-idempotency-keys) support `POST /emails`, a stable `Idempotency-Key` header and payload matching. This is a **candidate adapter**, not authorization to open a Resend account, configure DNS, or incur billing.

The current static GitHub Pages UI cannot safely hold a provider secret. A future **separately authorized trusted backend or Supabase Edge Function** must validate genuine user JWTs, recheck server-side invitation-owner authorization and provider configuration, and call the private issuance function without leaking its token into browser logs, responses or analytics. A generic service-role API call is not sufficient user authentication.

The provider acceptance gate must prove production-compatible sender-domain DNS, delivery, bounce/failure behavior, rate limits, expired token routes, idempotent resend reconciliation and origin/redirect controls before activation.

## 4. Execution evidence and remaining blockers

| Criterion | Classification |
| --- | --- |
| Live board ACL contract and 53 reference inventory | **VERIFIED** — read-only |
| Staged board AND-ceiling integration preserving prior RBAC | **VERIFIED** — disposable PG17 |
| Viewer/Admin/Member/Owner, foreign, revoked-session regression | **VERIFIED** — synthetic signed PG17 |
| Mock provider transport, no credentials and redacted failures | **VERIFIED** — Node 22 mock |
| Independent domain write-path inventory | **VERIFIED** — read-only classification |
| Per-domain RBAC integration beyond the board ACL | **PENDING** |
| Trusted deployed provider, sender verification and delivery webhooks | **PENDING** |
| Genuine signed-session invitation issue/acceptance/revocation E2E | **PENDING** |
| Separately authorized production schema/grant/role cutover | **BLOCKED** |

Production read-only baseline continues to return `WS02D_B_DEFAULT_DENY_VERIFIED__ROLE_INTEGRATION_AND_PRODUCTION_APPROVAL_PENDING`: WS02D private runtime absent, board ACL fingerprint unchanged, B3/B4 still disabled, **2 existing workspaces and 40 active memberships**. The invitation UI's send control remains disabled.

**Next required checkpoint: CP-WS-02D/B3 — Domain-Write Authorization Review and Trusted Delivery Activation Prerequisites.** First audit the 30 candidate paths and run signed denied-write tests; provider choice, verified delivery identity and separate production permissions follow independently. **Do not promote this checkpoint to production-ready status based on passing disposable CI.**
