# APSYNTRA CRM — Frontend Integration

The first user-facing frontend lives in `index.html` and `frontend/`, on `main`. It is a dependency-free ES module SPA with no Docker, new database, service-role key or standalone development server.

## Login and navigation

Open the repository's published GitHub Pages site (when Pages is configured to publish from the repository root), or serve the same static files from your existing authoritative local host at `http://127.0.0.1:5173/#/`. The static assets must be exposed at `/frontend/...` relative to `index.html`. Do not start a second listener or replace existing backend API routes.

Sign in with an **existing** WatchdogWorkspace Supabase Auth email/password account. No account creation is implemented. The frontend requests an actual access/refresh token from `/auth/v1/token?grant_type=password`, verifies it with `/auth/v1/user`, stores the session in tab-scoped `sessionStorage`, and refreshes tokens when near expiration. Sign-out calls Supabase Auth and clears the session. No password is persisted.

Upon sign-in, authorization is checked server-side with existing `wm_auth_access_context`. Boards are loaded through `wm_list_boards`; individual board data through `wm_get_board`; add/update actions use the existing Work Management RPCs. The Huly Issues tab uses the existing forced-RLS `huly_sb02_documents` view and atomic `huly_sb06_transact` function. All calls use the actual bearer token, never elevated keys.

**First option (no token copy):** Account & Security → **Verify backend connection** checks the live Supabase Auth identity, authoritative workspace context, board list/details, board access and Huly RLS view using the current browser session. The results are read-only and do not certify native transaction writes or the separate 5173 host.

**Second option (for signed command-line acceptance):** Account & Security → **Copy short-lived access token**, then run the self-locating launcher shown below. The token is pasted into a hidden Terminal prompt, never a command argument, saved file, URL or log. Never share it in chat/GitHub.

## Navigation

The hash-based routes are `#/overview`, `#/boards`, `#/boards/<uuid>`, `#/boards/<uuid>/issues`, and `#/settings`. The app is static and hash-based, so it works on GitHub Pages and can be embedded as a frontend bundle in the approved port-5173 host. The root route of the existing host remains canonical; changing that host's SPA fallback requires access to its source repository, which is not provided in this repository.

## Scope and limitations

This is a **working frontend for the existing Supabase workspace/board and Huly Issue contracts**, not a fabricated full port of all 12 standalone applications or Huly's entire frontend monorepo. Existing board RPCs enforce RBAC; unavailable modules are not shown as working. End-to-end signed browser acceptance and the existing Mac host asset integration remain pending until actually executed.

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

The `--full` mode requires the same-origin Huly API to be mounted on the existing `http://127.0.0.1:5173` host; it fails explicitly if unavailable. **Write acceptance is disabled** unless both original `SB07_WRITE_APPROVED=yes` and `SB07_NONPRODUCTION_BOARD=yes` are set AND an explicitly selected, approved isolated nonproduction board/workspace is supplied. The launcher will never auto-select a production board for writes. Genuine signed host and native transaction acceptance is still pending until executed successfully.
