# CP-FM1-CORE-03 — Production activation and signed runtime acceptance

Date: 2026-11-16
Status: IMPLEMENTED-UNVERIFIED / PRODUCTION ACTIVATION BLOCKED
Repository: wass-psti/APSYNTRACRM
Supabase project: APSYNTRACRM (jtlusodorfnyzgyuewkz)

## Verified production baseline

- The existing Supabase project is ACTIVE_HEALTHY on PostgreSQL 17.6.1.165.
- The production migration history does not contain migration 20261116055815.
- Read-only production catalog queries returned no private.fm1_* tables or fm1_* functions.
- The production FM1 route is present, but the live queue reports that the ticket service is not connected. No server-backed ticket creation or SLA processing is live.
- No production migration, ticket write, notification, cron job or role change was performed.
- PR #426 remains open and its previous required checks passed. The FM1 source has not been merged to main.

## Functional completion added during CP-FM1-CORE-03 preparation

The ticket detail UI now uses the existing DomainApi and existing FM1 RPCs for:

- Requested, effective and confirmed priority changes with reason and revision refresh.
- Dependency hold requests with metric, reason, external owner, required action, evidence and optional review time.
- Hold validation/rejection with review evidence.
- Engineering-start hold validation with explicit remote/guided diagnosis blocked evidence.
- Ending a validated hold and refreshing the authoritative SLA due time.
- Retry-safe mutation keys retained on the active form after uncertain responses.

No new CRM roles, role hierarchy, client-side permission gate or authentication mechanism was added. Pending holds do not pause SLA clocks.

## Verification completed locally

- Full frontend regression: 2,386 passed, 0 failed.
- FM1 focused suite: 36 passed, 0 failed.
- npm run check: PASS.
- npm run lint: PASS.
- npm run build: PASS (existing Vite bundle-size and legacy static-script warnings remain).
- Native ESM Chromium acceptance: PASS.
- Browser workflow acceptance with an isolated mock RPC backend: PASS for priority update, hold request, hold validation and hold resumption.
- Desktop/mobile layout, local draft isolation and WCAG 2.2 AA axe checks: PASS.
- Disposable PostgreSQL 17 CP-FM1-CORE-02 lifecycle/SLA acceptance: previously PASS.

The mock-backed browser workflow is not a production signed-session test.

## Production activation gate

The CP-FM1-CORE-02 migration contains these production permission and operational changes:

1. Grants USAGE on the existing private schema to authenticated.
2. Revokes public/anonymous execution from internal FM1 functions and grants execution of the FM1 implementation functions to authenticated.
3. Revokes default/public execution on the FM1 public RPC wrappers and grants execution to authenticated.
4. Creates pg_cron if the extension is available.
5. Grants USAGE on the cron schema to postgres.
6. Schedules fm1-sla-deadline-processor every 30 seconds and a daily cron-history cleanup job.

These are the API execution grants and worker activation present in the migration, but they are production privilege/scheduler changes. The user explicitly required production migration application only after the relevant permission-change approval. No approval for these exact changes has yet been recorded in this milestone; therefore production application is blocked pending that approval.

## Remaining acceptance

- Merge PR #426 only when the production release sequence is approved; merging the frontend before its RPCs exist would expose a nonfunctional live ticket queue.
- Apply migration 20261116055815 to the existing project after approval and after merge.
- Verify migration history, catalog objects, function signatures, grants, indexes, constraints, triggers, and cron job installation.
- Verify worker run history and duplicate-run behavior.
- Run genuine signed-session read/write acceptance against the production CRM session.
- Verify end-to-end ticket lifecycle, priority history, hold lifecycle, immutable audit readback, deadline processing, and outbox persistence.
- Keep external email/SMS/paging delivery disabled until real operational recipients and channels are configured.
- Complete user-facing operational acceptance.

## Rollback and data handling

No production FM1 records exist at the verified baseline. Do not drop shared schemas, remove shared roles, or reset the production project as a rollback. Any rollback must be a separately reviewed, additive FM1-specific migration that preserves unrelated CRM data and migration history.
