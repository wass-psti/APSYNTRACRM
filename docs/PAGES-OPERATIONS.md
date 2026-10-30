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
| APSYNTRA native Issue transaction subset | **Supabase Edge Function `apsyntra-native-issues`** | Signed HTTPS `/functions/v1/apsyntra-native-issues`, existing RBAC/RLS and atomic RPC; live signed native acceptance pending |
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
- **Hosted native Issue subset (ACCEPTED October 30, 2026):** user-run signed native acceptance reported **6/6 PASS**; a separate read-only PostgreSQL inspection independently confirmed the QA native Issue revision/tombstone and three ordered, same-actor audit events. The verified Supabase Edge Function `apsyntra-native-issues` is ACTIVE with `verify_jwt=true`. This does **not** certify the full upstream transaction processor or all application services.
- **12-application operational acceptance:** explicitly **DEFERRED by user direction**; no application-wide certification or local-host retirement for unported Node-only capabilities is asserted.

## Accepted evidence and exact scope

- **GitHub Pages UI signed-user behavior:** authentication, active workspace, permissioned board view and Huly RLS read checks were previously reported PASS (6/6 browser, 4/4 independent CLI).
- **Signed write test:** PASS 6/6 reported by the real user using the explicitly isolated `APSYNTRA QA` board via `#/acceptance`. Existing Postgres state corroborates the transaction and audit sequence.
- **Database read-only independent verification:** one QA document, `revision=3`, `deleted_at IS NOT NULL`, exactly three events across one document and one actor, and event revisions `[1,2,3]`.
- **Fail-closed controls:** anonymous `huly_sb06_transact` unavailable, authenticated execution available; RLS forced on both Huly tables; both public views are `security_invoker`; authenticated direct audit INSERT privilege denied.
- **Certification boundary:** the **Pages-served, Supabase-backed CRM Issue CRUD and signed persistence path is accepted**. This is not independent acceptance of full Node Huly TxProcessor, cross-workspace role revocation, all standalone application boards, realtime, storage attachments, or original Huly middleware. The local 5173 host is unnecessary for these Pages-supported workflows but cannot be declared retired for unported services.

## CP-HULY-SB08 — Hosted APSYNTRA native Issue subset

- The **native Issue subset** is now deployed as an ACTIVE JWT-protected Supabase Edge Function (`apsyntra-native-issues`) in the existing project. This reuses the validated server-side native gateway from `packages/huly-supabase/src` and calls the established `huly_sb06_transact` database RPC, without a privileged key, new user directory, database schema, or Mac listener.
- The gateway runs the established `TxCreateDoc`, `TxUpdateDoc` and `TxRemoveDoc` validations for Issue records and their supported operators; unsupported native classes fail closed. The published browser client uses the Supabase publishable key plus the actual user's bearer, while the server independently validates user identity and Work Management board edit privileges.
- UI branding is **APSYNTRA CRM**, **APSYNTRA Issues**, and **Native transactions**. Underlying `huly.*` document identities, JSON kinds, SQL/RPC names, and vendor snapshots are **compatibility identifiers**, not user-visible product branding. Renaming them would disrupt existing database records, audit trails, signed transaction contracts, or source attribution.
- Existing stable direct-RPC Issue CRUD is preserved. Native Issue creation, editing, and removal are explicitly selectable; the separate Pages acceptance screen provides an opt-in isolated QA test for server-native create, update `$inc`, identity spoof rejection, workspace isolation, tombstone and audit sequence.
- **Live signed native transaction acceptance is now PASS 6/6**, corroborated by independent PostgreSQL persistence and event-order queries. The prior SB07 Pages persistence PASS remains valid without repetition. **12-board operational acceptance remains deferred by user decision.**
- The full upstream Huly TxProcessor, attachments, websocket collaboration, and separate Node-only application services are not provided by this Edge Issue subset. Do not mark all legacy host dependencies retired.

### Native acceptance procedure

1. Sign into `https://wass-psti.github.io/APSYNTRACRM/#/acceptance` with your existing account.
2. Confirm an isolated nonproduction board exactly named `APSYNTRA QA` is available and authorized; do not run this against any production board.
3. Select **Verify hosted native transactions**, type `APSYNTRA QA` in the confirmation, and run the signed test once.
4. Expect six checks: authorized scope, create persistence, server operator update, forged-actor denial, cross-workspace denial, removal plus independent audit evidence.
5. If it passes, inspect the additional tombstone and three ledger rows independently in Supabase. If it fails, inspect the displayed failure before retrying; the report distinguishes whether cleanup succeeded.

### October 30, 2026 — Independent SB08 acceptance record

**Certification:** `CP-HULY-SB08: ACCEPTED` for the **APSYNTRA native Issue transaction subset on GitHub Pages + Supabase Edge Function**, not for the entire upstream platform.

**Genuine user session (user-reported):** 6/6 native acceptance gates passed: board edit scope, native create and persisted read, direct update and `$inc` with persisted revision increment, forged actor rejection, cross-workspace rejection, and native removal with audited tombstone. The user separately reported 6/6 passed for the already accepted Pages direct-RPC persistence path.

**Independent read-only database evidence (October 30, 2026):** exactly three QA documents were observed, all tombstoned at revision 3, each with exactly three event rows in the correct `create → update → remove` order at revisions `[1,2,3]` and one consistent authenticated actor. One document had the `APSYNTRA-NATIVE-QA-` title prefix, distinguishing the hosted native acceptance from the earlier direct-RPC QA tests. The database inspection did not itself reproduce forged-actor or cross-workspace denial requests; those checks are supported by the user-run signed acceptance report. No additional database writes or repeat acceptance tests were performed for this review.

**Deployment evidence:** Edge Function `apsyntra-native-issues` is ACTIVE, version 1, and JWT verification is enabled. GitHub `main` at `8eba820dab9fefbec89d4f862e36bc87372d62c9` had passing frontend validation and GitHub Pages deployment. No continuously running local development host is required for the accepted native Issue subset.

**Remaining boundary:** Full upstream transaction-processing parity, attachments/realtime, role-revocation scenarios, and the 12 standalone application boards are outside this certification. In particular, **12-board operational acceptance is deferred until separately directed**. Keep internal storage and RPC compatibility identifiers unchanged even while visible branding is APSYNTRA CRM.
