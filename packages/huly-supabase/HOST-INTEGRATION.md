# Existing 5173 Host Integration

The authoritative existing local host is `http://127.0.0.1:5173/#/`. This package does not start any server or Docker database.

1. Install dependencies and run `npm run build` in `packages/huly-supabase`.
2. In the existing WatchdogWorkspace Vite/Connect runtime factory (not in this APSYNTRACRM repo), mount `mountHulyHost` from `src/node-middleware.mjs` after the existing guards and before the SPA fallback. Supply `supabaseUrl: process.env.SUPABASE_URL` and `publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY`. Do not add a service-role key or use a second port.
3. Preserve existing `/api/v1/boards` handlers. The new integration only intercepts `/api/v1/huly/**`.
4. Run `node scripts/sb03-host-acceptance.mjs` with a genuine, existing `SUPABASE_ACCESS_TOKEN`, `HULY_BOARD_ID` and `HULY_WORKSPACE_ID` supplied securely via environment, not committed to the repository.
5. Writes on an approved isolated nonproduction board require both `HULY_SB03_WRITE_APPROVED=yes` and `HULY_SB03_NONPRODUCTION_BOARD=yes`.

Both the original host mount and signed-user integration are PENDING; only isolated unit tests and read-only Supabase catalog checks are verified. Do not claim final acceptance.
