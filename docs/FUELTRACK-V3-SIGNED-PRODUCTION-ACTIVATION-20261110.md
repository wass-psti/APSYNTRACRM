# FuelTrack+ v3 — Controlled production migration deployment record

Date: 2026-11-10 (Asia/Manila)
Project: existing WatchdogWorkspace Supabase jtlusodorfnyzgyuewkz
Scope: FuelTrack Board 7af78b3f-67bf-4600-9aa1-9006d19d486e
Status: PRODUCTION SCHEMA DEPLOYED AND CATALOG VERIFIED; SIGNED USERS PENDING

## Owner authorization and policy baseline

Two already-reviewed FuelTrack production migrations were previously
authorized, and the owner expressly requested their controlled deployment.
Receipt policy Option A preserves existing private Board-viewer reads and
authorized manager/owner Storage deletion. Recovery-policy retirement
was authorized and merged to main in PR #196. No AWS or numerical recovery
objective remains a FuelTrack release prerequisite.

## Actual live migration operation

Before deployment:
- Exact FuelTrack Board was active in workspace
  00000000-0000-4000-8000-000000000001, one group, no items.
- All shared signed Board/module helper functions existed.
- FuelTrack tables and RPCs were absent; neither migration recorded.
- Prior isolated PostgreSQL migration + Board + receipt + denial tests passed.

Two owner-approved SQL payloads were applied to the existing Supabase project
using the connected Supabase migration API, sequentially:

1. fueltrack_v3_backend_core — SUCCESS.
   Provider migration history version: 20261110021141.
   SQL SHA-256: a0026499b12a647fad70b6f92c8710f32cf3ff1f1f253c4fbab62554f6ad68d6.
2. fueltrack_v3_board_receipts — SUCCESS.
   Provider migration history version: 20261110021200.
   SQL SHA-256: e286e380b2a743021ff068bd13ff64701c9537862d9a6780332f879e17c99f6a.

Source migration filenames and isolated acceptance references were renamed to
match the provider-generated applied versions; SQL payload bytes remain
unchanged. This avoids a future CLI attempting to reapply older filenames.
No duplicate migration was created and no production migration history
was directly edited.

## Post-migration catalog verification

- public.fueltrack_v3_requests, fueltrack_v3_receipts,
  fueltrack_v3_audit_events: PRESENT, RLS ENABLED.
- Direct SELECT/INSERT/UPDATE/DELETE for authenticated: DENIED on all
  three tables; anonymous direct SELECT also denied.
- All 15 FuelTrack domain RPC/helper functions are present. Ten user-facing
  functions have authenticated EXECUTE; internal helpers are restricted.
  Anonymous EXECUTE is denied on all FuelTrack functions.
- Triggers fueltrack_v3_audit_immutable and
  fueltrack_v3_guard_link_transition: enabled.
- Exact active Board and single group still exist.
- Storage bucket work-board-files: private, 20,971,520 byte limit;
  existing SELECT/INSERT/DELETE policies for authenticated remain.
- FuelTrack requests/receipts/audit rows: 0/0/0 immediately after deploy.
  No user data or private file bytes were created/deleted by the rollout.

## Signed runtime acceptance: PENDING

The local shell had no FT3_SUPABASE_URL, FT3_PUBLISHABLE_KEY,
FT3_ACCESS_TOKEN or FT3_WORKSPACE_ID environment entries.
Connected browser tab access was unavailable from the current chat context.
An administrator's SQL connection is not a signed end-user session and
cannot prove tenant isolation, expired/revoked denial, or Storage RLS.

The next acceptance must exercise real existing authorized Admin and
User sessions, without creating synthetic production accounts:

- Admin/User scoped read/analytics, Admin-only audit and User audit denial.
- Request submission/idempotent retry, Board-item creation, Board notes,
  stale-revision denial, state change through approval/refuel/completion.
- Signed receipt prepare/upload/register/read and actual private file
  access, size, MIME and path denials; no public Storage access.
- Wrong Board, foreign workspace, cross-user, anonymous and revoked
  session denials, audit append-only, page refresh and logout persistence.
- Verified live frontend release and browser interactions, after approved
  GitHub merge/deployment.

Do not claim any of these live signed checks passed until actual evidence
exists. Do not run synthetic SQL production fixtures or create QA accounts.

## Release classification

Migration deployment: VERIFIED.
Database catalog/grant/RLS/trigger preflight: VERIFIED.
Option A private bucket policy unchanged: VERIFIED.
Signed Admin/User lifecycle, receipts and browser: PENDING.
Full production functionality / final acceptance: NOT YET VERIFIED.
