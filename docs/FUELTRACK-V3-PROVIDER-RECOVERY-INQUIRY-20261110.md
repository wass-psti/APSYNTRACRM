> **Superseded recovery policy — 2026-11-10:** The owner retired mandatory
> 24-hour RPO/RTO, disaster-recovery rehearsal and AWS/offsite backup
> release gates across WatchdogWorkspace/APSYNTRA CRM. References below
> to their mandatory status are historical only. Existing backups,
> authentication, RBAC/RLS, audit and signed acceptance remain required.
> See [current owner decision](RECOVERY-POLICY-RETIREMENT-20261110.md).

# FuelTrack+ v3 — Supabase Provider Recovery Inquiry

**Existing project:** WatchdogWorkspace, ref jtlusodorfnyzgyuewkz, ap-southeast-2, PostgreSQL 17.

**Scope:** Read-only provider feasibility inquiry. No production restoration, new Supabase project, PITR purchase, production data modification or Storage policy changes are authorized by this inquiry.

## Verified on November 10, 2026

- Existing Supabase project was active; WAL-G infrastructure enabled; PITR disabled.
- Read-only Supabase CLI inventory reported completed physical backups November 2–8 UTC, with the latest listed completed backup at 2026-11-08 17:17:15 UTC. No later completed backup appeared in that inventory.
- The existing project has eight private Storage buckets. account-avatars contained five objects (114,010 metadata bytes); work-board-files contained zero. This is metadata inventory, not independent recovery of bytes.
- November 9 logical PostgreSQL restoration and independent private Storage API checksum verification were previously performed. The two FuelTrack migrations also applied to a network-disabled restoration of production-shaped PostgreSQL 17 schema and data.
- These results do not verify isolated restoration of the provider's physical backup, hosted RTO or ongoing 24-hour RPO for Storage bytes.
- Official Supabase guidance documents restoring a physical backup into a new project (which creates a separate project with ongoing costs), or restoring in place (which causes downtime). Database backups do not contain the Storage objects themselves.
- A read-only search of connected mail for recent Supabase recovery correspondence produced no matching message; no official provider answer or support ticket submission is evidenced by this work.

## Exact questions for Supabase Support

We are not requesting Supabase to perform a restoration now. Please confirm in writing:

1. Can this specific existing project's physical backup be restored in isolation **without** creating a new Supabase project and **without** replacing or disrupting the live production database? If so, please give the provider-supported procedure and account prerequisites.
2. If not, is a provider-backed integrity/recoverability test available without using either of those paths? Please distinguish mere backup validation from a genuine restore rehearsal.
3. Can Supabase provide supported evidence of the 24-hour RPO and 24-hour RTO for this project/plan, including measured hosted recovery time? If not, state the limitations.
4. What supported independent backup/restore procedure recovers the actual private Storage object bytes and validates checksums, with a continuing 24-hour Storage RPO, without creating a new hosted project or modifying live objects?
5. How should the customer verify timely completion of new physical backups when the latest inventory approaches 24 hours? Are there documented backup completion objectives?
6. If these constraints cannot be satisfied, what is the minimum plan, infrastructure, architecture or policy change needed, and its pricing/downtime impact? Do not execute that change.

## Release and evidence

**NO-GO** for the production FuelTrack migration until the binding full-Workspace 24-hour RPO, 24-hour RTO and mandatory physical/Storage recoverability rehearsal are verified. Option A receipt Storage visibility is approved; both schema migrations are authorized but gated on recoverability assurance. No production DDL was applied.

Official support channel: https://supabase.com/support

Do not send database credentials, bearer tokens, personal records, raw backup files or user identities with the inquiry. Link the provider's written response in the PR/release record. No ticket has been submitted by this workflow.

## On-demand read-only backup freshness preflight

From the owner's already authenticated Supabase CLI:

    set -o pipefail
    supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json | node scripts/fueltrack-v3-provider-backup-gate.mjs

The tool intentionally returns exit code 2 even for a fresh backup. A backup age check cannot certify an isolated physical restoration, hosted recovery time or Storage object recovery. No continuous monitoring agent is installed.
