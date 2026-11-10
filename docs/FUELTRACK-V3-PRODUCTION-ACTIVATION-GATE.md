# FuelTrack+ v3 — Controlled Production Activation

**Effective policy: November 10, 2026 — Recovery policy retirement AUTHORIZED.**
Current authority: config/production-release-policy.json and docs/RECOVERY-POLICY-RETIREMENT-20261110.md.

The owner explicitly retired the mandatory 24-hour RPO, 24-hour RTO,
provider physical-backup restore rehearsal, independent offsite backup
and AWS infrastructure gates from the entire WatchdogWorkspace/APSYNTRA
CRM release policy. These are NOT prerequisites to FuelTrack production.
Historical documents and optional tools are superseded wherever they
describe such requirements as mandatory.

Preserve existing Supabase backups, security, RLS, authentication, private
Storage controls, audit trail, repository protections, rollback planning,
verification and authorized operational ownership. No backup was deleted.

## Current production baseline

- Repository wass-psti/APSYNTRACRM, draft PR #185.
- Only existing WatchdogWorkspace Supabase project jtlusodorfnyzgyuewkz.
- FuelTrack Board 7af78b3f-67bf-4600-9aa1-9006d19d486e.
- Two production migrations already authorized and tested in isolated PG.
- Option A receipt policy approved: preserve existing private Board-viewer
  read and owner/manager delete behavior. Do not silently change roles.
- Synthetic PostgreSQL and frontend tests do not prove real signed runtime.

## Remaining production execution and acceptance

1. Read-only preflight: verify exact live project, Board/workspace/group,
   migration history, data shape, RPC signatures, private Storage bucket
   and policies, and currently deployed code. Check migration SQL integrity.
   Preserve existing provider backup capabilities where available, but no
   recovery rehearsal or numerical RPO/RTO is a release requirement.
2. Controlled schema rollout: apply already approved core migration
   20261110021141_fueltrack_v3_backend_core.sql, followed by Board/receipt
   migration 20261110021200_fueltrack_v3_board_receipts.sql, only through
   established safe production migration process. No disposable fixtures.
3. Genuine Admin/User signed acceptance: submission/retry/CAS, approval,
   refueling/completion, Board links, receipt register/read, persistence
   across refresh/logout and required role-specific visibility.
4. Security negative acceptance: signed-out, wrong Board, foreign workspace,
   cross-user, revoked session, wrong MIME/size/path and stale update denial.
   Verify RLS/RBAC and audit immutability, including Option A receipt access.
5. Pass relevant GitHub branch protections and CI, deployed application
   bundle and real signed browser regression.

## Evidence classification

Recovery policy retirement: AUTHORIZED / IMPLEMENTED.
AWS/offsite backup project: OPTIONAL AND RETIRED FROM REQUIRED ROADMAP.
Migration authorization: EXISTING, but actual live deployment not assumed.
Real signed Admin/User end-to-end acceptance: PENDING.
Production readiness: NOT YET VERIFIED.

One-shot policy and functional-readiness assessment:

    node scripts/ft3-release-readiness.mjs

That tool is non-mutating and does not certify real signed users.
The optional signed read-only acceptance runner is
scripts/fueltrack-v3-signed-read-acceptance.mjs.

Pre-retirement investigation preserved at
docs/historical/FUELTRACK-V3-PRODUCTION-ACTIVATION-GATE-PRE-RETIREMENT-20261110.md.


## November 10 live read-only post-policy preflight

- Exact board 7af78b3f-67bf-4600-9aa1-9006d19d486e exists with name
  FuelTrack+ v3, active status, workspace
  00000000-0000-4000-8000-000000000001, no archive/trash markers.
- Private Storage bucket work-board-files exists, public=false and
  file size limit 20,971,520 bytes. Existing Option A behavior is
  retained; no Storage policy updates were applied.
- Production pg_catalog showed no public.fueltrack_v3_requests,
  fueltrack_v3_receipts, fueltrack_v3_audit_events or submission RPC.
- Neither reviewed migration version appears in
  supabase_migrations.schema_migrations.
- No live schema, policy, role or user records were modified in preflight.

This verifies release prerequisites and identifies missing runtime
deployment, not a production migration failure or signed acceptance.


## November 10 — Production schema deployment completed

The existing owner-authorized migrations were applied successfully through
the connected Supabase migration API. Actual provider migration versions
are 20261110021141 (fueltrack_v3_backend_core) and 20261110021200
(fueltrack_v3_board_receipts); all source SQL bytes are unchanged.
Three tables have RLS enabled and direct client table access revoked.
Anonymous FuelTrack RPC EXECUTE is denied; authenticated public RPC grants
and audit/Board-link triggers are verified. Private receipt Storage policy
Option A was preserved. Initial request/receipt/audit counts: 0/0/0.
**Signed Admin/User and binary receipt acceptance is still PENDING.**
See docs/FUELTRACK-V3-SIGNED-PRODUCTION-ACTIVATION-20261110.md.
