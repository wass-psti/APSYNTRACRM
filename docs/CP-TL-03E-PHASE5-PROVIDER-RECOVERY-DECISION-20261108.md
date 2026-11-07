# CP-TL-03E / Phase 5 — Provider Recovery Feasibility and Infrastructure Decision

**Date:** 2026-11-08, Asia/Manila  
**Scope:** existing, single Supabase project `WatchdogWorkspace` (`jtlusodorfnyzgyuewkz`), all APSYNTRA CRM applications and Storage  
**Tracking:** [issue #76](https://github.com/wass-psti/APSYNTRACRM/issues/76)  
**Disposition:** **DOCUMENTATION AND READ-ONLY EVIDENCE VERIFIED; PROVIDER-SUPPORTED NONPROJECT ISOLATED RESTORE UNCONFIRMED; NO-GO.**

## 1. Actual owner requirements and execution boundary

- Whole-project **RPO <= 24 hours** and **RTO <= 24 hours**. These are goals, **not** proven operational capabilities.
- A genuinely demonstrated restoration rehearsal is mandatory: **no waiver to proceed without it**.
- Use **only the existing Supabase project**. Do not create a second Supabase project, even a temporary clone, or incur new charges under this gate.
- Do not restore, roll back, pause, export private data, read Storage file bytes, execute production SQL, modify credentials/RLS/roles, or activate TradeLink Stage B. All remain separate approval gates.

## 2. Current evidence (2026-11-08 PHT)

| Item | Verified evidence | Interpretation |
| --- | --- | --- |
| Project | Supabase project API: `ACTIVE_HEALTHY`, `ap-southeast-2`, PostgreSQL `17.6.1.165` | Project metadata, not a recovery test |
| Scheduled backups | Read-only Supabase CLI: **8 COMPLETED** physical backups, from `2026-10-31T17:18:53.474Z` to `2026-11-07T17:18:39.359Z` | List only. No restore or validation of snapshot contents |
| Backup interval | Last two timestamps: `2026-11-06T17:17:11.138Z` to `2026-11-07T17:18:39.359Z`; **24h 1m 28.221s** between scheduled entries | Daily cadence **cannot guarantee** a strict <=24h worst-case RPO; actual recoverable transaction time and incident instant would have to be measured |
| PITR | `pitr_enabled=false`, `walg_enabled=true` | WAL-G enabled does **not** imply PITR is enabled or available |
| Storage | Read-only query at `2026-11-07 18:22:59 UTC`: **7 private buckets**, **0** `storage.objects` metadata rows | Point-in-time metadata counts, not object-byte backup/restore proof; no bucket names or object keys disclosed |
| Prior rehearsal | [Phase 3 PR #81](https://github.com/wass-psti/APSYNTRACRM/pull/81) merged; isolated synthetic PG17 logical dump/restore CI PASS | Does **not** restore an actual provider physical backup |
| Phase 4 | [PR #82](https://github.com/wass-psti/APSYNTRACRM/pull/82) merged with read-only feasibility runbook | Documentation/metadata only, not physical restoration |

## 3. Official provider documentation and supported-options matrix

| Option | Official documentation | Feasibility within current authorization |
| --- | --- | --- |
| **Restore backup into existing project** | [Database Backups](https://supabase.com/docs/guides/platform/backups) says the project is inaccessible during restore | **NO**: production data overwrite and outage, unsuitable for a rehearsal |
| **Restore to a New Project** | [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project) creates a new project, may incur cost, and is database-only | **NO**: conflicts with explicit single-project/no-cost constraint |
| **Download managed physical backup into local or GitHub Postgres** | [Database Backups](https://supabase.com/docs/guides/platform/backups) says physical backups are **not available for direct download**; `supabase db dump` creates a separate logical export | **NOT SUPPORTED via verified self-service path**; logical-export proof is different from managed physical snapshot proof |
| **Enable PITR** | [Database Backups](https://supabase.com/docs/guides/platform/backups) describes PITR add-on and selected restore points | **NOT AUTHORIZED**: prospective cost/config change and does not retrospectively validate current physical backups or supply isolated rehearsal |
| **Managed isolated restore WITHOUT another project** | Not documented as available in reviewed public guide | **UNCONFIRMED**, requires a written provider answer; do not assume available |
| **Local/hosted synthetic logical rehearsal** | [Phase 3 PR #81](https://github.com/wass-psti/APSYNTRACRM/pull/81) | **PASS for synthetic fixture only**, insufficient for genuine physical backup restoration |
| **Recover Storage object bytes from database backup** | [Database Backups](https://supabase.com/docs/guides/platform/backups) says object bodies are excluded; [S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility) says bucket object versioning is unsupported | **NO**: needs separately proven independent object backup/restore; zero recorded objects now does not prove a durable recovery capability |

**Evidence-quality rule:** A vendor capability that has not been expressly verified remains *unconfirmed*, not categorically impossible. These constraints create a **current self-service feasibility blocker**, not proof that Supabase Support cannot offer a special arrangement.

## 4. Ready-to-submit provider inquiry — NOT YET SENT

**Channel:** [Supabase Support](https://supabase.com/support) → **Open support ticket**. Ticket should be submitted by the authorized account owner. Do not paste credentials, connection strings, personal data, document IDs, or raw customer records.

**Subject:** Feasibility confirmation: isolated rehearsal of existing physical backup, no additional Supabase project — WatchdogWorkspace

**Message:**

> We operate one existing Supabase project, WatchdogWorkspace (reference `jtlusodorfnyzgyuewkz`, region `ap-southeast-2`, PostgreSQL 17). It is shared by multiple applications. The dashboard/CLI currently reports completed managed physical backups, with PITR disabled.
>
> Our organizational recovery targets are a maximum 24-hour RPO and maximum 24-hour RTO for the *entire* project. We require a genuine, witnessed restoration rehearsal and cannot create an additional Supabase project or interrupt/overwrite the existing production database. We have already passed an independent synthetic PostgreSQL logical restore, but that does not validate your managed physical-backup restore path.
>
> Please confirm **in writing**:
>
> 1. Can Supabase perform or arrange an isolated, measurable restoration of one of this project's **existing managed physical backup snapshots** without creating another Supabase project and without any write, outage, or configuration change to the live project? If yes, identify its exact supported procedure, target isolation, required plan/entitlements, owner approval, pricing, credentials/data exposure, and how a customer can independently inspect the restored database.
> 2. Can this procedure produce provenance for the snapshot and **last recoverable committed transaction time**, alongside start/end timestamps and logs sufficient to demonstrate <=24h RPO and <=24h full-service RTO? What conditions/limitations prevent a guarantee?
> 3. Which parts of Auth, user/session records, RLS policies, custom roles/passwords, PostgREST, Edge Functions, Realtime, and project settings are recovered or require separate reconstruction? How are these verified without sending email or calling third-party providers?
> 4. Physical database backups do not include Storage object bodies. Is there a provider-supported, independently isolated backup-and-rehearsal path for **Storage file bytes**, including deletion recovery and database-metadata consistency? Is S3 versioning unavailable as documented? What customer-managed backup is recommended?
> 5. If a no-new-project isolated physical restore is **not available**, please explicitly confirm this and identify the least-risk supported alternative, including whether it necessarily involves a second project, cost or production downtime. Please do not initiate any restoration, clone, add-on, billing change, or data export in response to this inquiry without separate explicit authorization.
>
> We need a **capability determination only**, not an executed restore or infrastructure change.

## 5. Owner decision matrix — not yet approved

- **A — Provider confirms isolated actual-backup rehearsal with no new project and no production impact:** mark **PROVIDER METHOD VERIFIED** only after receiving an attributable answer with procedure, scope and cost. Obtain separate approval for exact rehearsal operations and data handling, then demonstrate true RPO/RTO, Auth/RLS, every shared application, and Storage recovery. Issue #76 remains NO-GO until passed and signed.
- **B — Provider confirms no such supported method:** mark **INFRASTRUCTURE CONSTRAINT BLOCKED**. The owner must **separately decide whether to revise the no-new-project constraint** or retain NO-GO. Do **not** treat the mandatory rehearsal as waived, create a project, or use a production restore without new authorization.
- **C — Provider offers only production-impacting restore:** reject it as a nonproduction rehearsal. If the organization later considers a production restore, a **separate destructive, high-risk authorization** and full incident/change management are necessary. No such permission exists.
- **D — No provider response / uncertain answer:** keep **PENDING / NO-GO**; no invented guarantees or closure of issue #76.

## 6. Evidence to attach before resolving issue #76

1. Provider ticket reference, dated official response and decision branch (A/B/C/D).
2. Accountable named whole-project incident/recovery authority, maintenance window, stop/escalation/executor and signed ticket.
3. Backup ID and verified recovered commit cutoff; incident timestamp, measured **actual** RPO <=24h.
4. Real rehearsal restore timeline including complete validation; measured **actual** RTO <=24h.
5. Signed Auth allow/deny and foreign-workspace tests, RLS, audit, cross-module, config/realtime/Edge validation without production side effects.
6. Actual independently recoverable Storage bytes when present, manifest SHA-256 and metadata consistency.
7. Final attributable sign-off explicitly marked **RECOVERY PLAN ACCEPTED**, or **NO-GO**. There is **no restoration waiver** and no authorization for production SQL / Stage B.

**Phase 5 result:** Read-only research and inquiry prepared; live managed physical-backup recoverability still **UNVERIFIED / BLOCKED** until an official provider determination. **No production execution performed.**
