# CP-NATIVE-APP-AUTOSYNC-11 — Staging compatibility and signed assignment acceptance

## Disposition

LOCAL COMPATIBILITY VERIFIED. GENUINE SIGNED QA, COMPLETE STAGING BASELINE AND NEW-MODULE WRITER BLOCKED.

This checkpoint does not change staging/production databases, identities, permissions, or persistent roles. Existing draft PR #760 remains unmerged.

## Live staging evidence (read-only November 22, 2026)

- Existing staging branch: apsyntra-invites-staging, project ref jeqwjlxubntsddeauvqa.
- Two Auth users, two workspace memberships, zero migration ledger entries.
- Canonical boards, signed role snapshot, registry projection absent; existing role assignment/audit/scope infrastructure previously confirmed missing.
- Staging public.profiles has six columns; local CRM profile foundation has eight. Missing fields: platform_role text NOT NULL DEFAULT employee and created_at timestamptz NOT NULL DEFAULT now().
- No approved three-way signed staging sessions at loopback CDP ports 9222, 9223, 9225, 9226 or 9333.
- No specific new module role vocabulary and authoritative role assignment writer defined. Board registration alone is insufficient.

## Delivered implementation

- sql/acceptance/cp-native-app-autosync-11-profile-compatibility.sql rehearses both missing profile columns in a staging-shaped TEMPORARY table populated with two synthetic rows; checks role default, row integrity and inactive status; ROLLBACK. Does not edit live profiles.
- CP10 disposable PostgreSQL clone harness now executes this rehearsal after a successful isolated restore.
- Fixed the clone harness cleanup trap ordering: an occupied clone database name now fails after cleanup registration, preventing the exclusive lock from leaking.
- Four focused tests enforce temp-table-only schema rehearsal, unchanged authorization, legacy unknown-module rejection and cleanup ordering.
- Local isolated PostgreSQL 17 clone tests passed scoped schema restore, profile-compatibility rehearsal, registry lifecycle, synthetic two-member SQL assignment, independent SQL readback, unknown module denial and exact restoration. Temporary clone and archive removed.

## Acceptance state

VERIFIED: isolated compatibility rehearsal, synthetic SQL persistence and rollback, cleanup safeguards, focused tests.
BLOCKED: actual staging backend recovery; three independently signed QA profiles; new module writer; real signed individual/bulk persistence, cross-browser authoritative readback and restoration.
PENDING: GitHub CI on the current PR head, production deployment certification.
NOT APPLICABLE: production mutations, new Supabase projects, or new security restrictions.

## Next checkpoint if signed acceptance remains blocked

CP-NATIVE-APP-AUTOSYNC-12 — Existing Staging CRM Baseline Dependency Plan, Genuine Three-Session QA Enrollment, Explicit New-Module Writer Integration, and Signed Reversible Acceptance.

Reconcile complete CRM migration dependencies against the existing invitation/workspace staging schema before any nonproduction activation. Use an approved staging-compatible clone, not the partial local CRM simulation, to test migration compatibility. Establish genuine authorized signed sessions and a concrete module role/writer contract; then verify persisted writes and restoration. Keep PR #760 draft and production untouched until independently accepted.
