# APSYNTRA CRM — GitHub Pages–first runtime and acceptance baseline

## Architecture decision

**Primary frontend URL:** https://wass-psti.github.io/APSYNTRACRM/#/overview

| Layer | Production / acceptance owner | Public browser connection |
|---|---|---|
| Static HTML, CSS and ES modules | GitHub Pages, deployed from APSYNTRACRM/main | GitHub Pages HTTPS |
| Interactive sign-in, session renewal and sign-out | Existing WatchdogWorkspace Supabase Auth | `https://jtlusodorfnyzgyuewkz.supabase.co/auth/v1/*` |
| Workspace isolation, board RBAC and board-item operations | Existing authoritative `wm_*` RPCs | `/rest/v1/rpc/*` on same Supabase HTTPS origin |
| Issue reads | Existing `public.huly_sb02_documents` security-invoker RLS view | Supabase PostgREST |
| Issue create/update/tombstone | Existing `public.huly_sb06_transact` security-invoker RPC | Supabase PostgREST with real bearer |
| Immutable Huly event ledger | Existing `public.huly_sb06_events` security-invoker view and restricted trigger | Supabase PostgREST, read-only to browser |
| Full native Huly TxProcessor and Node-only application services | **Not hosted by GitHub Pages** | Requires separate approved HTTPS server runtime; **NOT PRODUCTION ACCEPTED** |
| Database and storage | Existing WatchdogWorkspace Supabase PostgreSQL and Storage | Only via authorized HTTPS APIs and RLS |

The frontend already uses the approved Supabase URL and publishable key; no local API URL or PostgreSQL connection string is included in browser assets. Node middleware in `packages/huly-supabase` remains source for unported native host operations, **not a Pages API endpoint**.

**No server or database is created by GitHub Pages.** Do not point production clients at localhost or create an unauthenticated proxy or a service-role frontend SDK. The Mac Vite host is optional for local debugging and any host-dependent development that has not yet been migrated.

## Production workflow

1. Commit frontend, documentation and validation changes directly to `main`, honoring the standing development authorization.
2. `APSYNTRA CRM Frontend Validation` checks ES-module syntax, authentication/contract tests, source security boundary and acceptance-test safeguards.
3. GitHub's existing `pages build and deployment` workflow publishes the repository's static frontend; `.nojekyll` avoids unnecessary Jekyll preprocessing.
4. `APSYNTRA Pages Post-Deployment Acceptance` runs after a successful Pages workflow, fetches live HTML/JS/CSS from the public GitHub Pages URL, compares their hashes to the exact deployed commit, and checks the approved Supabase Auth health endpoint. It has **no access tokens, cookies, service keys or write requests**.
5. Inside the deployed application, Settings → **Verify backend connection** runs six signed read-only checks under the genuine user session. This path has already been user-verified (6/6) and CLI-verified (4/4 direct backend checks).
6. For actual persistence acceptance, create an **isolated, authorized, nonproduction board exactly named `APSYNTRA QA`** using the application's existing board creation control. Only after confirming it is isolated, go to **Pages acceptance**, type `APSYNTRA QA`, and explicitly initiate the signed write test. This tests one uniquely named Issue: create/read, update/read, stale CAS denial, tombstone/view exclusion, and audit actor/event evidence. It creates no accounts. Audit rows and tombstones remain by design. No normal board is eligible for automatic test writes.

Browser-accessible checks cannot certify the unhosted Node native transaction adapter, original Huly notifications, attachment pipeline, websocket/collaboration runtime, or all 12 standalone applications. These are **separate integration gates**; their local host may be stopped when not being developed, but those features must not be labeled Pages-ready until a hosted API has passed independent signed acceptance.

## Rollback and safety

- Rollback Pages to a previous verified commit through the already-approved GitHub main deployment workflow. Never roll back Supabase database schema or disable RLS to fix a frontend regression.
- The Pages deployment is static, cannot access environment-held server secrets, and must include only a public publishable API key. Never copy database credentials, pooler strings, service/secret keys or user tokens into public code or Actions logs.
- Tokens stay in the existing tab-scoped `sessionStorage` and refresh through Supabase Auth; session expiration and invalid memberships fail closed. Validate any sensitive role changes independently under the centralized policies.
- Prefer live Pages for routine use. Retain Node/Vite locally only when debugging or developing host-only services; **no continuously running `127.0.0.1:5173` instance is required for the Pages-supported CRM capabilities**.

## Acceptance classification

- **Verified:** prior actual Pages login and 6/6 real signed browser reads; 4/4 independent signed direct-Supabase checks; authoritative RPCs, force-RLS and grants; GitHub CI and Pages deployment after relevant commits.
- **Deployment smoke:** independently verified only when `APSYNTRA Pages Post-Deployment Acceptance` reports success against the latest commit.
- **Signed persistence:** unverified until the user performs the explicit isolated `APSYNTRA QA` write acceptance. An empty Issue view is not proof of create/update/tombstone.
- **Native Huly + 12 application parity:** not yet migrated to an approved hosted service, so full local-host retirement and production certification remain **PENDING**.
