# APSYNTRA CRM — Board-scoped invitation links (design baseline)

**Date:** 2026-11-10  
**Branch:** `feat/board-scoped-guest-invites-20261110`  
**State:** DESIGN ONLY / NOT ACTIVATED. This document creates no database objects, endpoints, browser features, roles or production grants.

## Goal

A manager of exactly one APSYNTRA work board may generate a revocable, short-lived, copyable invitation link. A recipient who has never used APSYNTRA may register and verify an account, accept the invitation, and access **only that board**, not any other board, module, workspace catalog, user directory, private attachments or organization-wide settings.

An invitation link itself grants **no access** until a signed, verified account redeems it through a server-authorized, transactional acceptance path. A recipient's ordinary workspace/platform grants, if any, remain unchanged.

## Main branch: existing boundaries and relevant code

- GitHub Pages serves a dependency-free frontend (root `index.html`, `frontend/`); `frontend/session.js` uses Supabase GoTrue, `frontend/data.js` calls PostgREST/RPC; public Supabase URL/key are in `frontend/config.js`.
- Supabase PostgreSQL, Auth, Storage and Work Management RPC/RLS are the backend. `wm_auth_access_context`, `wm_list_boards`, `wm_get_board`, `work_board_access` are part of the existing signed workspace/board flow. `packages/huly-supabase/` carries a limited Huly/native Issue gateway, not an independent invitation/identity database.
- Existing `public.work_board_members` assigns role `owner/editor/viewer` per board. The staged `sql/cp-board-collab01-authorization-candidate.sql` requires an existing active membership in the board's workspace to invite an account by email.
- Existing WS02D invitations (`sql/cp-ws02d-invitation-*.sql`, `server/ws02d-*.mjs`, `frontend/workspace-invitation-client.js`) are **workspace-membership** proposals, not board-only guest permissions. Live issuance/acceptance and trusted mail sending remain dormant; frontend invitation send is disabled.
- `frontend/auth-account-flows.js` sets `REGISTRATION_ADMISSION_ENABLED=false`. `docs/CP-CRM-AUTH-ACCOUNT-01.md` documents unsafe historic signup triggers that auto-granted shared workspace membership / special email-based admin privileges. Never enable registration by flipping its flag alone.
- Several `docs/CP-WS-02D*` notes and staged SQL distinguish local/disposable test success from genuine live authorized deployment. Follow their recovery, permission-review and controlled-migration gates.

## Explicit access model: guest is NOT a workspace member

**Do not implement board-only guests by calling `ws02d_accept` and then `wm_add_board_member`**. That would grant workspace membership first; unrelated workspace-scoped RPCs might then be accessible based on independently assigned roles.

Introduce private, default-deny board-link and board-guest relations **without** creating a `workspace_members` or `ws01_member_roles` row:
- `private.board_guest_invite_links`: invitation ID, exact board/workspace FK, issuer, salted hash of 256-bit random secret, bounded expiry, remaining/maximum redemptions (default 1), revocation timestamp, optional recipient-email restriction, created/updated audit metadata.
- `private.board_guest_grants`: exact board ID and verified Auth user ID, `viewer` role only for initial release, grant origin, granted/revoked timestamps and actor. Unique active grant per user+board; status changes audited.
- `private.board_guest_events`: append-only issuer, redemption, revocation and denied-abuse events (where safe), never plaintext tokens.

Define separate signed, restrictive, narrowly scoped read contracts for an authenticated guest (e.g. `wm_guest_board_context`, `wm_guest_board_read`), rather than weakening generic `wm_auth_access_context`, `wm_list_boards`, `wm_get_board` or `work_board_access`. These methods must return only an approved board identity and explicit non-sensitive field projection. They must **not** enumerate other boards/workspaces or expose original source-module records. Reject guest writes, private Storage reads, member directories, event ledgers and all module-specific APIs until a separate field-by-field authorization review approves them.

This scoped route is necessary because ordinary CRM startup currently assumes active workspace membership. A guest without that membership needs a deliberately separate signed landing/read UI, not a fake current-workspace choice.

## Proposed end-to-end flow

1. Board owner or signed board manager opens **Share → Copy guest link** in an authorized board. Server rechecks active GoTrue session and board MANAGE authority. No client-supplied workspace or role can override server-derived board identity.
2. Trusted signed issuer creates a one-use, random secret (minimum 256 bits), persists only salted digest and bounded metadata, and returns raw secret once to the authorized issuer over HTTPS. The UI copies a URL such as `https://wass-psti.github.io/APSYNTRACRM/#/board-invite/<opaque-token>`. No frontend key or database credential signs the link.
3. Recipient opens URL. UI validates and immediately scrubs token from browser history, retains it in volatile memory, and offers sign-in or secure new-user admission. Never render it to logs, telemetry, web analytics, error monitoring or storage.
4. After verified-email Auth and *hardened signup/admission* are activated, recipient explicitly accepts. Private transaction locks invitation, confirms active session/profile, intended board active state, token hash, permitted email (if bound), expiry/use/revocation state, and writes **only the exact board guest grant** plus audit. No workspace membership, platform role, module role or default board membership is assigned. Replays/concurrent redemptions fail.
5. Signed guest-only read path fetches that exact board, with approved fields and server-side access verification on every request. Guest can leave; board manager can revoke link and individual grant. Removal takes effect on next server request, including stale signed sessions.

A copyable **unbound** link is a bearer secret and can be forwarded before redemption. Default to one-use and short expiry (proposed 24 hours), with optional email binding for sensitive boards. Reusable links and editor permissions require explicit later approval.

## Backend endpoint architecture (proposed, not present)

- JWT-gated trusted issuer: `POST /functions/v1/board-guest-link-issue`, input `{boardId, requestId, expiresInHours}`. Returns one raw link once; retries do not leak previous secrets. Server must check manage permissions and session revocation.
- JWT-gated acceptor: `POST /functions/v1/board-guest-link-accept`, input `{token}`, returns nonsecret exact board receipt. Uses a transaction and verified Auth identity; no anonymous acceptance.
- JWT-gated revocation: `POST /functions/v1/board-guest-link-revoke`, input a previously issued invite or grant ID, checks exact board manager authority.
- Guest-only signed reader(s): exact authorized board UUID, scoped field list, no generic workspace list or direct table SELECT.

Prefer private SECURITY DEFINER SQL routines with `SET search_path=''`, fully qualified references, explicit locked rows, effective-session checks, RLS/default-deny tables, no `anon` grants and narrow execution grants to an approved trusted adapter. Do not use a service-role call that impersonates the end user.

## Tests required before any activation

| Scenario | Expected |
|---|---|
| Signed board owner creates valid one-use link | One link, hashed only at rest; no grant yet |
| Non-manager, inactive session, foreign board | Denied with no token or membership mutation |
| Link issued for Board A, redeemed by verified new user | Access only Board A through dedicated guest read |
| Guest calls `wm_list_boards`, `wm_get_board(B)`, module RPCs, workspace/user admin | Denied / nothing disclosed, including board names |
| Link expired, revoked, malformed, reused or concurrently redeemed | Denied, transactionally, with audit |
| Link bound to an email, different signed email | Denied without disclosing expected recipient |
| Manager revokes grant; guest uses stale tab/access JWT | Next backend call denied; cache discarded |
| Board archived/deleted, workspace changed, item source becomes restricted | Access denied or redacted without stale projection |
| File metadata, signed Storage URL, export and realtime/event stream | Denied until each path is separately authorized |
| Non-guest existing member | Existing board permissions unchanged |
| Pending/unverified new account, legacy email-admin trigger | No privilege or membership leakage |
| Browser navigation, logout, reload and error telemetry | Raw link token never remains in history/storage/logs |

## Delivery order and activation gates

**P0:** Verify all existing read/write authorization entrypoints and current production schema *read-only*; map which source boards contain sensitive financial, HR or attachment fields. Agree on whether guests can see those at all.

**P1:** Harden existing new-account registration triggers and independent admission paths in disposable PostgreSQL/GoTrue first. Registration stays disabled until separately approved production migration and genuine denial tests.

**P2:** Add private board guest grant/link SQL + atomic issuance/acceptance/revocation on this feature branch, with disposable PostgreSQL tests and deny-by-default deployment flag. Do not alter the existing WS02D workspace invitation contract.

**P3:** Add signed Edge adapter and guest-only read API, harden data projection/Storage/auth, write foreign-board and negative-auth tests, then add board Share/Copy Link and recipient landing UI behind false flags.

**P4:** Review PR with IT partner, verify backup/rollback, genuine signed QA accounts, redaction and every deny case. Only after independent authorization, deploy candidate migrations/functions and activate a scoped nonproduction pilot. Main remains unchanged until reviewed merge; merge does **not** imply production database activation.

## Scope control

No new Supabase project, anonymous public board, live invite delivery, automatic email, production data migration, global role mutation, bootstrap privilege shortcut or service-role key in frontend. Preserve existing Work Management / WatchdogWorkspace backend authority and current 12-board/module contracts.
