# BS01 Phase 2 — Board/App Privacy Governance and Authorization (2026-11-10)

**Status:** Source implemented on `feat/board-scoped-guest-invites-20261110` as a **default-deny, disposable-only candidate**. No operational invitation endpoint, actual guest reads, production database migration or user sign-up activation. Do not merge until independently reviewed.

## What Phase 2 adds

1. `sql/bs01-p2-privacy-governance-disposable-candidate.sql` installs only after the P1 candidate and only inside a PostgreSQL database explicitly named `workspace_disposable`. It adds server-controlled privacy policies with expected-revision compare-and-swap, board row locks, authorization by current signed user and board-manager rights, and additionally requires `admin_general_manager` to enable guest sharing. It creates append-only privacy audit events.
2. Private, Workspace Restricted and Guest Shareable remain distinct **external sharing classifications**. They do not change existing internal board access. An unconfigured board resolves to Private.
3. All twelve known standalone application board IDs are blocked from external sharing irrespective of name/description changes. Marked application modules, known names, and QA fixture names are also blocked. These are a protective ceiling; do not weaken or turn into a general invitation allowlist without app-owner signed review.
4. A policy change away from Guest Shareable atomically revokes existing links *and* active guest grants and audits both. A separate signed guest revocation function allows removing one guest without changing the board's internal membership.
5. A private trigger rechecks approved policy and enable flag when issuing a link; another rejects a guest grant without a valid, unredeemed, unexpired invitation and approved resource. The guest read ceiling additionally checks resource eligibility and revoked link/grant state. These do not open general board RPCs to guests.
6. `server/bs01-policy-http-boundary.mjs` is an **unmounted, disabled** HTTP boundary that verifies request form, origin, verified GoTrue actor/session via injected trusted adapter, and only returns nonsecret typed policy receipts. No service credentials or network endpoints are added to frontend code.
7. Node tests cover default OFF, protected application IDs, policy CAS, revocation, issue/redeem guards, strict origin, malformed JWT, bounded requests, actor binding and neutral failures. A dedicated GitHub Actions workflow uses Node 22 and no production credentials.

## Source files

- `sql/bs01-board-guest-sharing-disposable-candidate.sql` — prerequisite (existing Phase 1)
- `sql/bs01-p2-privacy-governance-disposable-candidate.sql` — new Phase 2 additive SQL
- `server/bs01-policy-http-boundary.mjs` — new trusted boundary skeleton, not deployed
- `server/tests/bs01-policy-http-boundary.test.mjs` — new security tests
- `frontend/tests/board-share-phase2.test.mjs` — new security source checks
- `.github/workflows/bs01-isolated-source-checks.yml` — branch/PR test runner
- `frontend/app.js` / `frontend/board-share.js` — existing default-off Share & Access UI, unchanged in this phase

## Local verification

Fetch/pull the feature branch in GitHub Desktop. From the repository root:

```powershell
node --check frontend/app.js
node --check frontend/board-share.js
node --check server/bs01-policy-http-boundary.mjs
node --test frontend/tests/board-share.test.mjs frontend/tests/board-share-phase2.test.mjs server/tests/bs01-policy-http-boundary.test.mjs
```

**Do not execute the staged SQL on your shared WatchdogWorkspace Supabase project.** Source-only tests are useful but are not PostgreSQL runtime acceptance. PostgreSQL 17 disposable tests with genuine GoTrue test sessions, enforced RLS, active/nonmember/foreign-workspace roles, concurrent redemptions and denial of every standalone application RPC are still required.

## Remaining blockers before actual Share → Copy Link

- Independently verify/harden self-service registration and new-account triggers. Currently registration is disabled; do not turn it on to test guest access.
- Implement trusted user-scoped SQL adapters and deployed JWT-gated Edge routes for policy, issuance, redemption, link revocation and guest-grant revocation. Restrict origins and handle ambiguous retries.
- Implement a dedicated *read-only*, board-exact guest data projection, with no generic `wm_list_boards`, `wm_get_board`, Storage, finance, HR, exports, Realtime, member directory or independent app API access; test every affected path. A guest grant is NOT permission to access an application backend automatically.
- Read-only audit and application-owner signoff on future shareable app types, including sensitive record/field reviews. Current integrated applications remain nonshareable.
- Complete disposal-safe PostgreSQL acceptance, independent recovery rehearsal, production schema and grants review, authorized staged deployment, and only then UI activation. Production remains unchanged.

## Branch caveat

The IT partner continued committing to `main` after this feature branch was cut. Coordinate/review divergence before any eventual rebase or merge. Avoid force-pushing or silently overwriting collaborator changes.
