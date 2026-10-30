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
