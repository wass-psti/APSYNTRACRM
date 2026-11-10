# ADR — FuelTrack+ v3 recovery architecture and production release decision

Date: 2026-11-10
Status: BLOCKED — official provider answer or architectural exception required
Related: FuelTrack+ PR #185; recovery issue #189; WatchdogWorkspace issue #76

## Existing authorization and constraints

- Use the existing WatchdogWorkspace Supabase project jtlusodorfnyzgyuewkz. No additional Supabase project.
- Do not disrupt or replace the live production database for a rehearsal.
- A 24-hour RPO, 24-hour RTO and mandatory recovery rehearsal apply to the full WatchdogWorkspace including private Storage.
- FuelTrack+ production migrations are authorized. Receipt policy Option A retains existing private Board permissions.
- Isolated SQL and frontend CI do not establish provider physical-backup restoration or real signed runtime acceptance.

## Confirmed technical limitations

Physical backups from the current Supabase backup pipeline are not directly downloadable. A manual Supabase CLI database dump or pg_dump produces a logical backup, not the provider physical backup. Official restore paths are an in-place database restoration with downtime, or restoration into a new, separately billable Supabase project. A clone does not include private Storage objects.

Sources:
https://supabase.com/docs/guides/platform/backups
https://supabase.com/docs/guides/platform/clone-project
https://supabase.com/kb/troubleshooting/download-logical-backups

## Decision alternatives

A. Provider exception or supported segregated physical-backup restoration without new project/downtime. Status: UNVERIFIED. Requires written confirmation, an actual isolated rehearsal, 24-hour RPO/RTO evidence and independent Storage-byte recovery.

B. Temporary separately billable Supabase restore project. Documented and technically feasible for database contents, but NOT AUTHORIZED and excludes Storage object bytes. Would require separate cost/project authorization and Storage recovery rehearsal.

C. In-place physical-backup restoration. Documented but NOT AUTHORIZED because it interrupts production and replaces current data. Would require separate destructive/downtime authorization and recovery rollback.

D. Independently retained offsite logical PostgreSQL plus private Storage-object backups restored to isolated local infrastructure. This does not require another hosted Supabase project; existing local rehearsals demonstrate a subset. However, substituting this for the required provider-physical backup rehearsal is an architectural/policy change requiring separate approval, a documented backup cadence, secure offsite retention, integrity verification and measured 24-hour RPO/RTO across database and Storage.

E. Preserve current production and defer FuelTrack backend activation. This is the currently authorized NO-GO fallback until recovery requirements are met.

**Current decision: E.** Do not infer that general standing implementation authorization permits exceptions to cost, production disruption, project count, or mandatory recovery policy.

## Exact provider questions

Use the prepared inquiry in issue #189. Ask Supabase Support whether a supported physical-backup validation or isolated restore is possible without a second hosted project or downtime; how to verify an actual 24-hour RPO and hosted RTO; how to recover actual Storage bytes independently; and what minimum plan, billing and operational changes would otherwise be required.

Do not close issue #189 on documentation alone. Link a written provider response and measured recovery evidence. No official response or submitted support ticket is yet verified.

## After the recovery gate passes

1. Recheck live migrations, signed access functions, Board group and private Storage policies.
2. Apply only the two previously reviewed FuelTrack migrations sequentially through the established migration mechanism; never run disposable fixtures in production.
3. Perform genuine signed Admin/User request, approval, refueling, Board synchronization, receipt upload/read, audit and persistence tests plus foreign-workspace, wrong-Board and revoked-session denials.
4. Verify release checks, merge policies and deployed frontend; close production milestone only with actual end-to-end and recovery evidence.

## Evidence classification

Local logical database and Storage rehearsal: VERIFIED LOCALLY, not provider physical.
Physical restore and 24-hour hosted RTO: BLOCKED.
Storage continuing 24-hour recoverability: PENDING.
Production schema changes: NONE.
Option A receipt privacy and migrations: AUTHORIZED.
Production deployment: NO-GO.

## November 10 nonproduction archive integrity increment

The optional independently managed logical+Storage recovery alternative
now has an on-demand SHA-256 integrity tool at
scripts/ft3-recovery-archive-audit.mjs. Local verification passed on four
SQL exports and five actual private Storage objects (13,209,995 bytes).
The manifest was created with owner-only file permissions and was kept
outside GitHub. Eight unit tests passed. See
docs/FUELTRACK-V3-OFFLINE-RECOVERY-ARCHIVE-AUDIT-20261110.md.

This adds local integrity assurance, not continuous backup retention,
24-hour RPO, hosted 24-hour RTO, or a provider physical restoration. It
does not change the selected NO-GO fallback or authorize recovery
architecture option D. No production data or permissions changed.

## November 10 — Measured offline logical and private Storage recovery

The on-demand runner scripts/ft3-recovery-rto-rehearsal.mjs verifies the
historical private archive, restores PostgreSQL and copies/checks real
private Storage bytes inside local, isolated disposable infrastructure.
Observed successful elapsed times: 4.87 seconds, 6.45 seconds and final
recorded 8.43 seconds. Five Storage files and expected archived record
counts were verified. Only a private evidence JSON file remains on the
authorized Mac (owner-only mode 0600); recovery containers were removed.

See docs/FUELTRACK-V3-RECOVERY-RPO-RTO-REHEARSAL-20261110.md.
This establishes local historical snapshot recoverability and measured
partial restore time. Provider physical backup recovery, a continuing
24-hour database/Storage RPO, and full hosted 24-hour RTO remain unverified.
NO-GO and the recovery-policy decision remain unchanged.

## November 10 — On-demand physical cadence vs local Storage snapshot RPO

New one-shot observation tool scripts/ft3-rpo-observation.mjs verifies the
archived checksum manifest, computes backup inventory completion intervals,
and measures ages of local SQL/Storage files. A real Supabase CLI inventory
returned eight completed physical backups, newest 2026-11-09 17:17:15 UTC,
latest age 0.77 hours and maximum observed completed-backup interval
24.03 hours. The local independent archive had SQL/Storage oldest file
birth ages approximately 12.70/12.73 hours. The five archived Storage
objects' combined 114,010 bytes matched the separate live metadata
count/size, but no live-byte checksum comparison was performed.

Only one independent historical local snapshot is available; local birth
timestamps do not certify a live recovery point or a sustained 24-hour
backup schedule. The tool always returns NO-GO without changing production.
See docs/FUELTRACK-V3-ROLLING-RPO-OBSERVATION-20261110.md.

## November 10 — Verified retention evidence versus retention enforcement

A new one-shot local gate checks independently retained logical database
and private Storage sets, SHA-256 integrity, combined RPO capture-age and
cadence gaps. It never deletes files, schedules backups or contacts Supabase.
A proposed seven-daily-set history is for testability, NOT an approved
retention period. The binding requirements remain 24-hour RPO/RTO and the
mandatory full recovery rehearsal. The existing independent local archive
contains only one verified capture, about 12.86 hours old at inspection.

No recurring retention, remote immutable backup, physical provider restore,
or hosted 24-hour RTO is verified. No alternate architecture is approved.
The implementation and pending decision are recorded in
docs/FUELTRACK-V3-RETENTION-ARCHITECTURE-APPROVAL-20261110.md.

## November 10 — Atomic local recovery-set staging

Implemented scripts/ft3-recovery-set-stage.mjs with SHA-256 revalidation,
owner-only local staging, all-or-nothing directory publication, overwrite
refusal and provenance that prevents copied historical sets being counted
as new independent backups or offsite retention. Seven synthetic security
and integrity tests passed. See the recovery set staging report.

No offsite destination, storage budget, recurring cadence, live production
export, provider physical restore exception or alternate retention policy
was approved. The binding recovery NO-GO remains unchanged.

## November 10 — Local authenticated encryption component

Added provider-neutral AES-256-GCM local backup file encryption/decryption,
exclusive publication and tamper/wrong-key denial tests. This does NOT
activate any offsite destination, immutable retention, live production
export, recurring capture or credential/key custody infrastructure. No
architecture-policy exception is authorized. See
docs/FUELTRACK-V3-BACKUP-ENCRYPTION-PREFLIGHT-20261110.md.

## November 10 — Provider-neutral offsite configuration preflight

An offline preflight for a separately approved offsite destination plan is
implemented with twelve disposable tests. AWS S3 Object Lock COMPLIANCE is
a preferred strict retention candidate; Cloudflare R2 lock rules are a
configurable alternative. No account, bucket, retention duration, cost,
credential or key-custody arrangement is approved. No provider state is
attested or altered. See the offsite provider preflight report.
