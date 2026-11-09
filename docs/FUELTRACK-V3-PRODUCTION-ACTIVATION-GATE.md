# FuelTrack+ v3 — Controlled Production Activation Gate

**Status: NOT AUTHORIZED FOR PRODUCTION DEPLOYMENT UNDER THIS RECORD.** These preflight checks are read-only. Production schema deployment requires separate authorization. Never run acceptance fixtures on production.

## Live baseline (November 10, 2026)

- Repository: wass-psti/APSYNTRACRM; PR #185 remains draft.
- Existing WatchdogWorkspace Supabase project only. No new project, bucket, test users or secrets.
- Board 7af78b3f-67bf-4600-9aa1-9006d19d486e is active in workspace 00000000-0000-4000-8000-000000000001, with the expected module description, one group, and zero Board items at inspection.
- public.fueltrack_v3_requests, public.fueltrack_v3_receipts, and FuelTrack v3 RPCs are absent. Neither proposed migration is active.
- Existing Board RPCs wm_add_board_item(uuid,uuid,text) and wm_register_board_item_file(uuid,text,text,text,bigint) were inspected. The real Board item has a notes column.
- Private work-board-files Storage currently allows Board viewers to read registered files, and authorized owners/managers to delete files. It is not FuelTrack Admin-only; no Storage policy changes are staged.
- Passing disposable PostgreSQL and frontend tests do not prove actual JWT authorization, live upload/storage policy behavior, session persistence or deployment success.

## Production execution gates

1. Recheck Board/workspace identity, group, RPC signatures, migration history, Storage bucket and policy scope immediately before deployment.
2. Decide whether existing Board-wide receipt visibility/deletion rights meet policy; narrower permissions require separately approved production changes.
3. Obtain explicit authorization for both schema migrations, with existing recovery rehearsals and 24-hour RPO/RTO objectives treated as separate unverified prerequisites.
4. Apply core migration 20261109115106 before Board/Storage migration 20261109235500 through the existing Supabase migration mechanism. No disposable SQL fixtures in production. The second migration blocks old unlinked requests.
5. Validate genuine signed Admin and User sessions for submission, same-item retry, stale denial, approval/refueling/completion, item link, receipt registration, private signed URL, and refresh/logout persistence.
6. Verify signed-out, revoked, foreign-workspace, wrong-board, cross-user, MIME, size and wrong-path denials.
7. After acceptance and protected-branch checks pass, merge PR #185 and verify GitHub Pages publication, current production bundle, and actual signed browser interactions.

## Outstanding material risks

- Board viewers can access Board-linked receipts through current private Storage permissions.
- Authorized owners/managers can delete receipt Storage bytes under current policies.
- All Requests currently reads at most 200 records, without older-page cursor support.
- No genuine signed production user write/read acceptance has been completed.
- Mandatory recovery rehearsal and live RPO/RTO assurance have not been established here.

**Release decision: NO-GO** for production activation pending explicit schema authorization, permission visibility decision, provider recovery prerequisites, and genuine signed runtime acceptance.

## Non-mutating signed runtime acceptance runner

Run scripts/fueltrack-v3-signed-read-acceptance.mjs using existing authorized
session credentials supplied at invocation time through FT3_SUPABASE_URL,
FT3_PUBLISHABLE_KEY, FT3_ACCESS_TOKEN, FT3_WORKSPACE_ID and optionally
FT3_EXPECTED_ROLE. Never commit, paste or log signed access tokens in a repo.
The runner targets only the existing WatchdogWorkspace project and the exact
FuelTrack Board, verifies the Auth user, reads scoped requests and analytics,
verifies the immutable audit role, and checks wrong Board and anonymous access
denial. It performs no writes, file uploads or migrations. Use both genuine
Admin and User sessions for complete role coverage.

The local unit test scripts/fueltrack-v3-signed-read-acceptance.test.mjs
uses synthetic tokens with mocked responses, and its success is not a live
signed-user proof. Unavailable RPCs explicitly fail acceptance.

## Receipt privacy decision required

Current private Board Storage allows members with Board view access to read
receipt files, and permitted owners/managers may delete the underlying bytes.
Private does not mean FuelTrack Admin-only.

Decision required before activation:
- Preserve existing Board-viewer receipt access and current deletion rights; or
- Require FuelTrack Admin-only visibility and stronger retention, which
  necessitates separately authorized Storage policy changes and isolation tests.

This PR neither changes production policies nor creates a second bucket.


## November 10, 2026 — Option A selected, production migration authorized

The owner explicitly selected **Option A**: preserve the existing private
`work-board-files` Board-viewer read and authorized owner/manager deletion
rights. No new Storage bucket or narrower Storage policies are authorized or
required for this release. The owner also authorized deploying the two
reviewed FuelTrack migrations to the existing production project **subject
to the previously binding recovery prerequisite**. This authorization
does not waive the whole-Workspace 24-hour RPO, 24-hour RTO, or mandatory
rehearsal requirements.

### Production-shaped local migration rehearsal

Verified on November 10 against an **isolated network-disabled PostgreSQL
17** container. Source: prior November 9 locally archived production schema
and data exports. No new Supabase project or production writes. Do not
commit or redistribute the source exports.

- Restored schema and data successfully; production-shaped inventory
  included 41 profile records, 76 Board records and the single expected
  FuelTrack Board group.
- Applied `20261109115106_fueltrack_v3_backend_core.sql`: **PASS**.
- Applied `20261109235500_fueltrack_v3_board_receipts.sql`: **PASS**.
- Confirmed three FuelTrack tables have RLS enabled; direct table SELECT
  and INSERT by `authenticated` were denied; FuelTrack submission RPC
  executable by `authenticated` and not by `anon`.
- New tables were empty (0 fuel requests, 0 receipts) on the local restored
  snapshot. The isolation container was removed after testing.
- Earlier synthetic transaction, Board synchronization, receipt-denial
  and migration-repeat tests remain passing in the disposable acceptance
  workflow.

**Limitations:** The restored snapshot is from November 9, not a
November 10 physical provider backup. The previous local recovery rehearsal
proved logical database and private Storage-object recovery, not hosted
physical-backup isolation or the provider's real restore time. The existing
recovery record confirms PITR disabled and that hosted 24-hour RTO/Storage
RPO have not been established. These are release-blocking prerequisites
for the user's whole-project recovery policy, not grounds to fabricate a
GO decision.

**Deployment classification: AUTHORIZED BUT BLOCKED.** Production DDL has
not run. Next actions: secure official provider restore feasibility and
perform the required isolation/Storage recovery rehearsal without creating
another Supabase project or disrupting production; verify 24-hour objectives;
then execute the two reviewed migrations through the approved migration
mechanism, followed by real signed-user runtime acceptance and release
verification. Do not use synthetic JWTs or production fixture users.
