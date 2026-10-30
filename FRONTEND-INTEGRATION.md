# APSYNTRA CRM — Frontend Integration

The first user-facing frontend lives in `index.html` and `frontend/`, on `main`. It is a dependency-free ES module SPA with no Docker, new database, service-role key or standalone development server.

## Login and navigation

**Production and primary acceptance URL:** https://wass-psti.github.io/APSYNTRACRM/#/overview . GitHub Pages serves the static frontend; **the existing WatchdogWorkspace Supabase HTTPS endpoint** serves Auth, board RPCs, RLS-backed Issue reads/writes and event reads. Port `127.0.0.1:5173` is no longer a frontend deployment prerequisite. Use that existing local host only for optional debugging or legacy Node-only native Huly adapters that have not yet been assigned approved HTTPS hosting. Do not start a second listener or replace existing backend APIs.

Sign in with an **existing** WatchdogWorkspace Supabase Auth email/password account. No account creation is implemented. The frontend requests an actual access/refresh token from `/auth/v1/token?grant_type=password`, verifies it with `/auth/v1/user`, stores the session in tab-scoped `sessionStorage`, and refreshes tokens when near expiration. Sign-out calls Supabase Auth and clears the session. No password is persisted.

Upon sign-in, authorization is checked server-side with existing `wm_auth_access_context`. Boards are loaded through `wm_list_boards`; individual board data through `wm_get_board`; add/update actions use the existing Work Management RPCs. The Huly Issues tab uses the existing forced-RLS `huly_sb02_documents` view and atomic `huly_sb06_transact` function. All calls use the actual bearer token, never elevated keys.

**First option (no token copy):** Account & Security → **Verify backend connection** checks the live Supabase Auth identity, authoritative workspace context, board list/details, board access and Huly RLS view using the current browser session. The results are read-only and do not certify native transaction writes or the separate 5173 host.

**Second option (for signed command-line acceptance):** Account & Security → **Copy short-lived access token**, then run the self-locating launcher shown below. The token is pasted into a hidden Terminal prompt, never a command argument, saved file, URL or log. Never share it in chat/GitHub.

## Navigation

The hash-based routes are `#/overview`, `#/boards`, `#/boards/<uuid>`, `#/boards/<uuid>/issues`, and `#/settings`. The app is static and hash-based, making GitHub Pages the authoritative frontend. The optional local Vite host may serve the same assets for debugging, but is no longer canonical for Pages-supported features. The live hosted URL and release controls are documented in `docs/PAGES-OPERATIONS.md`.

## Scope and limitations

This is a **working frontend for the existing Supabase workspace/board and Huly Issue contracts**, not a fabricated full port of all 12 standalone applications or Huly's entire frontend monorepo. Existing board RPCs enforce RBAC; unavailable modules are not shown as working. The user previously verified genuine signed browser read acceptance (6/6) and CLI direct-Supabase acceptance (4/4). Signed persistence is still pending until the explicit `APSYNTRA QA` acceptance test succeeds; Node-only native host operations and full 12-board parity remain pending separate hosted integration.

## Checks

Run `node --test frontend/tests/*.test.mjs` and `node --check frontend/app.js`. GitHub Actions runs these checks automatically on `main`.

## Security notes

`frontend/config.js` contains only the project's **public publishable key and URL**, intended to be exposed to browsers. Never put the database password, service-role key, secret API key, or user access tokens in Git. Content Security Policy restricts scripts/styles to same origin and network connections to the specified Supabase project.

## CP-HULY-SB07: corrected signed acceptance workflow

The earlier `npm run test:live:sb07` failure from `~` was `ENOENT`: npm looked for `~/package.json`, so **the test never ran**. The new launcher finds the repository from its own script path; no `cd`, separate env exports, database password, or test user is required.

Clone/update the existing `APSYNTRACRM-SB07` checkout (or the equivalent `APSYNTRACRM` directory) and run **from any Terminal directory**:

```bash
git -C "$HOME/APSYNTRACRM-SB07" pull --ff-only origin main
bash "$HOME/APSYNTRACRM-SB07/bin/apsyntra-sb07-accept.sh" --supabase-only
```

Paste a current access token into the hidden prompt. The launcher imports public Supabase URL/key from `frontend/config.js`, checks the actual Auth user, authoritative workspace and permitted active board, then verifies the live Huly RLS view. **The `--supabase-only` result certifies only signed direct-Supabase connectivity, not the 5173 host or native writes.**

For the existing Mac 5173 host's middleware and signed read-only host gate, run:

```bash
bash "$HOME/APSYNTRACRM-SB07/bin/apsyntra-sb07-accept.sh" --full
```

The legacy `--full` mode is now an **optional developer check for the unported Node native API only**, not a GitHub Pages production acceptance requirement; it requires the same-origin Huly API to be mounted on the existing `http://127.0.0.1:5173` host and fails explicitly if unavailable. **Write acceptance is disabled** unless both original `SB07_WRITE_APPROVED=yes` and `SB07_NONPRODUCTION_BOARD=yes` are set AND an explicitly selected, approved isolated nonproduction board/workspace is supplied. The launcher will never auto-select a production board for writes. Genuine signed host and native transaction acceptance is still pending until executed successfully.

## GitHub Pages-first workflow

See [docs/PAGES-OPERATIONS.md](docs/PAGES-OPERATIONS.md). Changes committed to `main` trigger frontend CI and the existing GitHub Pages deployment. A separate post-deployment workflow verifies the exact deployed asset hashes and Supabase Auth endpoint without credentials. Within the app, Settings → Verify backend connection provides six genuine signed read-only checks. For write/persistence acceptance, manually establish an **isolated** `APSYNTRA QA` board and navigate to `#/acceptance`. Only a clearly confirmed QA board can receive the optional create/update/CAS/removal/audit test. There is no continuously running local host requirement for these supported features.

## October 30, 2026 — QA persistence acceptance

The `APSYNTRA QA` user-driven acceptance was reported **6/6 PASS** on the GitHub Pages application. Independent read-only PostgreSQL queries confirmed one tombstoned QA document at revision 3 and an exact, single-actor create/update/remove ledger sequence at revisions 1/2/3. This **closes the Pages-backed signed Issue persistence gate**, not the separate full Huly/12-application parity gate. See [docs/PAGES-OPERATIONS.md](docs/PAGES-OPERATIONS.md) for evidence and operating scope. No continuous local Vite host is needed for the accepted Pages workflows.
