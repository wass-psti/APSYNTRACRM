# Huly → Supabase backend rewrite

This is an incremental authoritative backend integration, **not** a completed import of the Huly application monorepo. It uses the existing WatchdogWorkspace Supabase project, its users, board permission RPCs and RLS.

## Source

`src/sb02.ts`: typed board gateway; `src/supabase-live.ts`: signed Supabase Auth, central permissions, RLS document repository, atomic mutation adapter; `src/http-handler.ts`: GET/PUT/POST HTTP; `src/node-middleware.mjs`: same-origin 127.0.0.1:5173 Connect/Vite host adapter; `src/huly-issue.ts`: lossless tracker Issue snapshot projection; `src/transactions.ts`: batch transaction contract.

## Verification

Node 22+, then `npm install` and `npm test`. No Docker or local database. TypeScript version is pinned at 5.8.3; package lockfile generation was unavailable in the offline implementation environment and is pending. The `migrations/` directory records already-applied additive Supabase migrations, including historical SB02 policy corrections. Do not reapply installed migrations blindly.

The canonical host remains http://127.0.0.1:5173/#/ . Mount `src/node-middleware.mjs` after existing guards and before SPA fallback. This repository does not contain the Mac's live `cp1612h-start-board-host.mjs` and cannot itself prove host mount or signed-user acceptance. Do not expose a service-role key or establish another user/role system.

## Limitations

Huly source monorepo, full TxProcessor, notifications, attachment storage, relationship graph, live collaboration and 12-board functional acceptance are not migrated yet. No merge to main before authenticated regression and architecture acceptance.

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
- **Security review pending:** existing `huly_rewrite.transaction_events` column-level INSERT grants to `authenticated` may permit a board editor to fabricate ledger records without corresponding document mutation. Treat audit authenticity as **not accepted** until a reviewed privilege/trigger hardening change is approved and independently tested. No live privilege or production-data changes were made by SB07.
