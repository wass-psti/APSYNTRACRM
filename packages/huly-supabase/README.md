# Huly → Supabase backend rewrite

This is an incremental authoritative backend integration, **not** a completed import of the Huly application monorepo. It uses the existing WatchdogWorkspace Supabase project, its users, board permission RPCs and RLS.

## Source

`src/sb02.ts`: typed board gateway; `src/supabase-live.ts`: signed Supabase Auth, central permissions, RLS document repository, atomic mutation adapter; `src/http-handler.ts`: GET/PUT/POST HTTP; `src/node-middleware.mjs`: same-origin 127.0.0.1:5173 Connect/Vite host adapter; `src/huly-issue.ts`: lossless tracker Issue snapshot projection; `src/transactions.ts`: batch transaction contract.

## Verification

Node 22+, then `npm install` and `npm test`. No Docker or local database. TypeScript version is pinned at 5.8.3; package lockfile generation was unavailable in the offline implementation environment and is pending. The `migrations/` directory records already-applied additive Supabase migrations, including historical SB02 policy corrections. Do not reapply installed migrations blindly.

The canonical host remains http://127.0.0.1:5173/#/ . Mount `src/node-middleware.mjs` after existing guards and before SPA fallback. This repository does not contain the Mac's live `cp1612h-start-board-host.mjs` and cannot itself prove host mount or signed-user acceptance. Do not expose a service-role key or establish another user/role system.

## Limitations

Huly source monorepo, full TxProcessor, notifications, attachment storage, relationship graph, live collaboration and 12-board functional acceptance are not migrated yet. No merge to main before authenticated regression and architecture acceptance.
