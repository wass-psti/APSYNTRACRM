# APSYNTRA CRM — Frontend Integration

The first user-facing frontend lives in `index.html` and `frontend/`, on `main`. It is a dependency-free ES module SPA with no Docker, new database, service-role key or standalone development server.

## Login and navigation

Open the repository's published GitHub Pages site (when Pages is configured to publish from the repository root), or serve the same static files from your existing authoritative local host at `http://127.0.0.1:5173/#/`. The static assets must be exposed at `/frontend/...` relative to `index.html`. Do not start a second listener or replace existing backend API routes.

Sign in with an **existing** WatchdogWorkspace Supabase Auth email/password account. No account creation is implemented. The frontend requests an actual access/refresh token from `/auth/v1/token?grant_type=password`, verifies it with `/auth/v1/user`, stores the session in tab-scoped `sessionStorage`, and refreshes tokens when near expiration. Sign-out calls Supabase Auth and clears the session. No password is persisted.

Upon sign-in, authorization is checked server-side with existing `wm_auth_access_context`. Boards are loaded through `wm_list_boards`; individual board data through `wm_get_board`; add/update actions use the existing Work Management RPCs. The Huly Issues tab uses the existing forced-RLS `huly_sb02_documents` view and atomic `huly_sb06_transact` function. All calls use the actual bearer token, never elevated keys.

Use Account & Security → **Copy short-lived access token** only when performing your authorized local SB07 acceptance runner. This user-initiated copy never renders the token into HTML, URL, or logs. Do not share access tokens in chat or GitHub.

## Navigation

The hash-based routes are `#/overview`, `#/boards`, `#/boards/<uuid>`, `#/boards/<uuid>/issues`, and `#/settings`. The app is static and hash-based, so it works on GitHub Pages and can be embedded as a frontend bundle in the approved port-5173 host. The root route of the existing host remains canonical; changing that host's SPA fallback requires access to its source repository, which is not provided in this repository.

## Scope and limitations

This is a **working frontend for the existing Supabase workspace/board and Huly Issue contracts**, not a fabricated full port of all 12 standalone applications or Huly's entire frontend monorepo. Existing board RPCs enforce RBAC; unavailable modules are not shown as working. End-to-end signed browser acceptance and the existing Mac host asset integration remain pending until actually executed.

## Checks

Run `node --test frontend/tests/*.test.mjs` and `node --check frontend/app.js`. GitHub Actions runs these checks automatically on `main`.

## Security notes

`frontend/config.js` contains only the project's **public publishable key and URL**, intended to be exposed to browsers. Never put the database password, service-role key, secret API key, or user access tokens in Git. Content Security Policy restricts scripts/styles to same origin and network connections to the specified Supabase project.
