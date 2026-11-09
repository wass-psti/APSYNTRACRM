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
