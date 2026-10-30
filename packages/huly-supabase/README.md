# Huly → Supabase backend rewrite

This is an incremental authoritative backend integration, **not** a completed import of the Huly application monorepo. It uses the existing WatchdogWorkspace Supabase project, its users, board permission RPCs and RLS.

## Source

`src/sb02.ts`: typed board gateway; `src/supabase-live.ts`: signed Supabase Auth, central permissions, RLS document repository, atomic mutation adapter; `src/http-handler.ts`: GET/PUT/POST HTTP; `src/node-middleware.mjs`: same-origin 127.0.0.1:5173 Connect/Vite host adapter; `src/huly-issue.ts`: lossless tracker Issue snapshot projection; `src/transactions.ts`: batch transaction contract.

## Verification

Node 22+, then `npm install` and `npm test`. No Docker or local database. TypeScript version is pinned at 5.8.3; package lockfile generation was unavailable in the offline implementation environment and is pending. The `migrations/` directory records already-applied additive Supabase migrations, including historical SB02 policy corrections. Do not reapply installed migrations blindly.

The canonical host remains http://127.0.0.1:5173/#/ . Mount `src/node-middleware.mjs` after existing guards and before SPA fallback. This repository does not contain the Mac's live `cp1612h-start-board-host.mjs` and cannot itself prove host mount or signed-user acceptance. Do not expose a service-role key or establish another user/role system.

## Limitations

Huly source monorepo, full TxProcessor, notifications, attachment storage, relationship graph, live collaboration and 12-board functional acceptance are not migrated yet. Source is developed on `main` under the user's standing authorization; final production acceptance requires separate signed-user runtime verification.

## CP-HULY-SB05 — Native Issue transactions

- Endpoint: `POST /api/v1/huly/boards/:boardId/native-transactions?workspace_id=:workspaceId`, authenticated Bearer token and JSON `{ "txes": [...] }`.
- Only `core:class:TxCreateDoc` and `core:class:TxUpdateDoc` of `tracker:class:Issue` are currently supported.
- Rejects unsupported TxRemoveDoc, TxMixin, `$`-operators, dotted field paths, attached collections, duplicate object IDs and claimed actors other than the Supabase Auth identity.
- Performs RLS-protected Issue reads, projects lossless JSON snapshots, and applies one existing SB04 atomic compare-and-swap RPC (25 operations maximum).
- Native transactions are only partially compatible: Huly uses PersonId identifiers and richer TxProcessor/domain middleware than the current Supabase Auth UUID mapping. No live signed-user or complete original Huly integration has yet been verified. Do not treat the implementation as production-ready.
- No new database migration or local Docker/database is needed for this slice. Host integration must still be verified on the existing `127.0.0.1:5173` runtime.

## CP-HULY-SB07 — Native operator compatibility and signed-user acceptance

- Confirmed from `platform-develop/foundations/core/packages/core/src/operator.ts` (EPL-2.0): native `$update` matches embedded array records by direct equality, `$rename` moves fields, `$push.$each` defaults to position 0, and `$inc` initializes a missing numeric field to zero.
- Implementation: guarded `$update` and `$rename`, safe embedded `$pull`, corrected `$push.$each` position and `$inc` initialization; rejects prototype keys, immutable metadata, ambiguous updates, dotted paths, and unsupported full Huly mixin operations.
- Automated verification: `npm test` (TypeScript build, acceptance script syntax and test/*.test.mjs). This does **not** replace a signed browser/host test.
- Genuine acceptance runner: `npm run test:live:sb07` (must run from the machine hosting `127.0.0.1:5173`, using an existing `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HULY_BOARD_ID`, and `HULY_WORKSPACE_ID` supplied privately via environment). Default is **read-only**; use both `SB07_WRITE_APPROVED=yes` and `SB07_NONPRODUCTION_BOARD=yes` exclusively for an isolated nonproduction board. Test tombstones and audit evidence are retained by design. Never commit access tokens.
- Acceptance status: real signed-user host reads/writes remain **BLOCKED** until executed in the existing authenticated 5173 environment. No new test user or local PostgreSQL/Docker database is required.
- **Audit integrity hardening deployed:** `cp_huly_sb07_event_integrity_hardening` removes direct authenticated INSERT privileges on the event ledger and restricts event writes to a private document AFTER trigger (security definer, empty search_path, actor/workspace/board checks, no direct function EXECUTE grant). Verified live: direct INSERT as `authenticated` rejected with SQLSTATE `42501`; no-session read reveals 0 rows; security advisory has no new Huly findings. The actual event-trigger write path **still requires a genuine signed-user integration test** and is not production-certified.

## SB07 terminal cwd remediation and in-app verification

`npm run test:live:sb07` must run in `packages/huly-supabase`; running it in the home directory fails with `ENOENT` before executing any authentication checks. Use `bin/apsyntra-sb07-accept.sh` at the repository root instead. It discovers the actual authorized board and workspace from a genuine Supabase session and refuses write mode without an explicitly approved nonproduction scope. The `--supabase-only` flag runs signed read-only direct Supabase checks; `--full` adds the original 5173 host assertions. The frontend's Settings page also has a read-only verified-session check that does not require token export.

## SB07 canonical host preflight

The fully authenticated browser and signed direct-Supabase checks have passed (6/6 and 4/4 reported on October 30, 2026). The local host check returned `fetch failed`, **not** an authentication rejection. The improved `--full` launcher now performs a **token-free** preflight against the canonical `127.0.0.1:5173` origin before requesting another token. Results distinguish `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT`, `SPA_FALLBACK`, `ROUTE_NOT_FOUND`, and `AUTH_GUARD_ONLY`. Huly Connect responses include `x-apsyntra-huly: board-api-v1` for positive route-mount evidence. No listener or database is started by the probe.

If the local host is stopped, use the already-approved `~/WatchdogWorkspace/scripts/cp1612h-start-board-host.mjs` launcher to start the existing host; do not create a second port or substitute an independent server. The Huly middleware still needs to be mounted in that host's Vite/Connect pipeline, after established authorization guards and before the SPA fallback. Direct access to the local host source is not available through the APSYNTRACRM repository, so **mount and signed host acceptance remain pending until verified on the Mac**.
