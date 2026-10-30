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
4. The `live-pages` job of `APSYNTRA CRM Frontend Validation` validates public CDN HTML/JS/CSS against the exact checked-out commit with bounded deployment-propagation retries and checks the approved Supabase Auth health endpoint. It uses **no access tokens, cookies, service keys or write requests**.
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
- **Deployment smoke:** independently verified on the Pages-first implementation by the successful `live-pages` job of `APSYNTRA CRM Frontend Validation`. Revalidate against each subsequent source change.
- **Signed persistence (ACCEPTED October 30, 2026):** the user executed the explicit isolated `APSYNTRA QA` write acceptance on the deployed application and reported **6/6 PASS**. A separate read-only Supabase SQL inspection independently confirmed exactly one retained QA document at revision 3, its tombstone, exactly three ordered events (`create → update → remove`) with revisions `1 → 2 → 3`, one consistent actor, and forced RLS/security-invoker views. The stale-revision HTTP 409 is evidenced by the browser acceptance report, not independently reproduced with SQL. No additional test write was performed for this review.
- **Native Huly + 12 application parity:** not yet migrated to an approved hosted service, so full local-host retirement and production certification remain **PENDING**.

## Accepted evidence and exact scope

- **GitHub Pages UI signed-user behavior:** authentication, active workspace, permissioned board view and Huly RLS read checks were previously reported PASS (6/6 browser, 4/4 independent CLI).
- **Signed write test:** PASS 6/6 reported by the real user using the explicitly isolated `APSYNTRA QA` board via `#/acceptance`. Existing Postgres state corroborates the transaction and audit sequence.
- **Database read-only independent verification:** one QA document, `revision=3`, `deleted_at IS NOT NULL`, exactly three events across one document and one actor, and event revisions `[1,2,3]`.
- **Fail-closed controls:** anonymous `huly_sb06_transact` unavailable, authenticated execution available; RLS forced on both Huly tables; both public views are `security_invoker`; authenticated direct audit INSERT privilege denied.
- **Certification boundary:** the **Pages-served, Supabase-backed CRM Issue CRUD and signed persistence path is accepted**. This is not independent acceptance of full Node Huly TxProcessor, cross-workspace role revocation, all standalone application boards, realtime, storage attachments, or original Huly middleware. The local 5173 host is unnecessary for these Pages-supported workflows but cannot be declared retired for unported services.
