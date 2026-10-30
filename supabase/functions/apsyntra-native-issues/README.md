# APSYNTRA native Issue Edge Function

Server endpoint: `https://jtlusodorfnyzgyuewkz.supabase.co/functions/v1/apsyntra-native-issues`.

The `vendor/*.ts` files are **generated snapshots** of the existing `packages/huly-supabase/src/*.ts` gateway contract, with local `.js` import suffixes adjusted to `.ts` for the Deno Edge runtime. Do not make independent changes to vendor files; regenerate them from the original sources. Native Issue transaction types, operator subsets, workspace authorization and SQL storage remain the same; there is no second membership store and no bypass-RLS credentials.

Deployed with `verify_jwt=true`. Browser CORS is restricted to `https://wass-psti.github.io`; clients pass a real Supabase Auth bearer and project publishable key. Requests use POST `{ boardId, workspaceId, txes: [...] }`. Results are `{ receipts, applied }`.

**Subset scope:** Issue `TxCreateDoc`, `TxUpdateDoc`, `TxRemoveDoc` using the existing server-side validator and atomic `huly_sb06_transact` backend. This is **not** the entire upstream Huly TxProcessor, notifications, realtime or all twelve integrated applications.

No service role, privileged API key or PostgreSQL URI is placed in this function. Runtime uses the Supabase-provided project URL and legacy anonymous key only for requests governed by the user's actual bearer token. Do not make any database schema change to deploy this adapter.
