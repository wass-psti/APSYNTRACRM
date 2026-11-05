# BIMP-02 — Signed Import Operational Acceptance Evidence

Date: 2026-11-05
Repository: wass-psti/APSYNTRACRM
Checkpoint: BIMP-02
Current classification: IMPLEMENTED — DISPOSABLE POSTGRESQL VERIFIED; LIVE SIGNED ACCEPTANCE PENDING

## Tested boundary

BIMP-02 uses a fresh PostgreSQL 17 GitHub Actions service container and synthetic, nonsecret identities and session IDs to exercise the same SQL import contract. It does NOT claim real Supabase Auth login, real browser session acceptance, or actual production import persistence.

Workflow: .github/workflows/bimp02-disposable-import.yml
Latest passing run at implementation: https://github.com/wass-psti/APSYNTRACRM/actions/runs/41964825594

## Files

- sql/tests/bimp02-disposable-setup.sql — isolated ordinary-board columns, group, cell writer, role fixture
- sql/tests/bimp02-disposable-acceptance.sql — authenticated-role simulation and atomic write acceptance
- sql/tests/bimp02-disposable-negative.sql — failed-later-row atomic rollback and stale duplicate submission denial
- sql/bimp02-session-enforcement-candidate.sql — **review candidate; NOT deployed**. Adds active auth.sessions guard to every import, including row-only imports
- .github/workflows/bimp02-disposable-import.yml — disposable PostgreSQL 17 acceptance job

## Verified isolated checks

1. Authenticated-only EXECUTE grant, signed owner and editor authorization.
2. Owner: one atomic import creates two items and one permitted typed checkbox column.
3. Read-after-write persistence of both item rows, custom values and import audit event.
4. Editor: duplicate Skip preserves existing values; duplicate Update performs revision-checked change.
5. Stale board revision is rejected without an audit write.
6. Signed editor cannot create a column without board manager permissions.
7. Viewer and cross-workspace writes are denied.
8. Revoked, expired and absent signed-session claims are denied by the staged session validator.
9. A malformed later row rolls back all earlier rows and leaves columns, audit and board revision unchanged.
10. Repeating a successful request with the same expected board revision is rejected; no second matching item is inserted.

## Read-only live production evidence

The existing WatchdogWorkspace Supabase project's function:
public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb)

Installed source MD5 observed: 1f928b22da5c2e762999fcd87f53484f
Authenticated EXECUTE: true
Anon EXECUTE: false
New unconditional active-session guard present: **false**

Therefore the live production import RPC has **not** been hardened to require a still-active auth.sessions record for every import. The staged migration is NOT authorized for deployment solely because disposable tests passed. Production activation requires separate, explicit permission-change/security approval and a real signed-user denial/refresh audit check.

## Remaining acceptance

- Genuine signed Supabase Auth HTTPS request with an approved disposable ordinary-board fixture.
- Real browser CSV and XLSX upload (including multi-worksheet), mapping and consent.
- Verify page refresh persistence and authoritative audit with real signed user.
- Genuine viewer, foreign workspace, revoked/expired session and permission-ceiling denial using real authenticated requests.
- Confirm update/CAS and rollback behavior under real authenticated concurrency.
- Independently review the staged SECURITY DEFINER writer and production migration before any production execution.

No production SQL, credentials, user roles, permissions, or existing board records were changed during this checkpoint.

## Status

- Isolated database integration and negative tests: VERIFIED.
- Live security gap identification: VERIFIED by read-only function inspection.
- Production migration: IMPLEMENTED-UNVERIFIED (candidate only).
- Genuine live signed-session acceptance: BLOCKED on approval and appropriate nonproduction fixture / signed browser context.
- Production certification: PENDING.

## BIMP-02 continuation — production-side preflight defense in depth

Date: 2026-11-05

- Commit c1c8273dee943ca73233fd0399998965085cdad2 adds a mandatory `wm_board_ui_read` call immediately before `wm_import_board_wizard_atomic` in the ordinary-board frontend. This read-only RPC enforces signed `auth.sessions` membership and board viewing permissions on the server. The returned `board_id` must equal the intended board or the client stops without a write.
- Commit 72e1d7dfdb8f800550d61f9ce68f1466f52c0ddc updates the automated test matrix: verified import invokes an active-session read before exactly one writer call, while revoked/expired-simulation errors and invalid preflight board IDs cause zero import RPC invocations.
- CI: https://github.com/wass-psti/APSYNTRACRM/actions/runs/41967088948 — 942/942 Node frontend tests PASS; frontend and disposable database jobs PASS, including live-Pages validation.
- A subsequent read-only inspection of production function metadata verified that `wm_board_ui_read` is authenticated-only and calls the hardened signed-session validator; the current `wm_import_board_wizard_atomic` remains the earlier MD5 1f928b22da5c2e762999fcd87f53484f.

**Important security boundary:** The browser preflight protects ordinary UI-driven imports but is NOT a security boundary against an attacker invoking the import RPC directly or a session revoked between the read and write. Only an unconditional active-session check inside the transactional import writer closes that gap. The reviewed candidate SQL remains undeployed. No production credentials, roles, policies, sessions, rows, or schemas were changed during this continuation.

**Live browser gate:** The connected browser could not be read from this ChatGPT context (originating-browser-context requirement). Therefore no genuine signed Pages CSV/XLSX upload, read-after-refresh, production audit, or signed HTTP revocation/foreign-workspace test was performed. These requirements remain PENDING/BLOCKED, not PASS.
