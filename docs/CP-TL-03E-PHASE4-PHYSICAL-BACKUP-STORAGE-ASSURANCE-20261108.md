# CP-TL-03E / Phase 4 — Physical Backup Recoverability and Storage Assurance

**Date:** 2026-11-08 (Asia/Manila)  
**Project:** the existing shared WatchdogWorkspace Supabase project, ref `jtlusodorfnyzgyuewkz`  
**Disposition:** **READ-ONLY FEASIBILITY ASSESSED / GENUINE PHYSICAL RESTORE BLOCKED / PRODUCTION NO-GO**  
**Tracking:** [Issue #76](https://github.com/wass-psti/APSYNTRACRM/issues/76)  
**Prior synthetic exercise:** [PR #81](https://github.com/wass-psti/APSYNTRACRM/pull/81) (merged); this does **not** prove recovery from a Supabase physical backup.

## 1. Scope and nonnegotiable controls

The stated whole-project thresholds are **RPO <= 24 hours** of actual recoverable data and **RTO <= 24 hours** of total interruption, including restoration and validation across all shared applications, Auth/RLS, Realtime, functions, configuration and Storage files. The recovery owner explicitly **requires a demonstrated restore rehearsal** and has **not granted a rehearsal waiver**.

This checkpoint is confined to provider documentation, read-only project/backup inventory, safe aggregate Storage metadata and a candidate rehearsal decision tree. It **does not** approve or perform production SQL, credential changes, data exports, whole-project restore, Storage reads/writes, a second Supabase project, a paid add-on, or Stage B activation. Separate organizational authority and release approvals are still required.

## 2. Verified evidence (2026-11-08 PHT)

| Finding | Evidence | Interpretation |
| --- | --- | --- |
| Project health | Supabase project details: `ACTIVE_HEALTHY`, `ap-southeast-2`, PostgreSQL `17.6.1.165` | Metadata only, not restorability |
| Provider backups | Authenticated `supabase backups list --project-ref jtlusodorfnyzgyuewkz --output-format json`: **8** `COMPLETED` physical backups; latest reported `2026-11-07T17:18:39.359Z`, previous `2026-11-06T17:17:11.138Z` | Provider listing only; no snapshot opened or restored |
| WAL-G/PITR | WAL-G true, PITR **false** | Daily snapshots do not guarantee a worst-case <=24-hour RPO; actual gap must be measured at incident time |
| Storage metadata | **7 bucket records, 0 object-metadata rows**, obtained via aggregate read-only SQL | No database-recorded Storage objects at query time; not proof of remote object-body backup, no future-data guarantee |
| Phase 3 | Merged synthetic-only PR #81 and successful disposable PG17 tests | Verified logical/synthetic restoration only, **not** hosted physical-backup disaster recovery |
| Local host | Supabase CLI `2.121.0`, Docker CLI present but daemon unavailable | Does not affect hosted GitHub synthetic CI; no local production backups made |

Repeatable read-only Storage query: `sql/tests/cp-tl03e-phase4-readonly-storage-inventory.sql`. Publish **only aggregate counts**, not bucket names, object keys, signed URLs, secrets or document contents. A count of zero is not a substitute for proving recovery when objects exist later.

## 3. Actual provider restore feasibility — decision tree

### A. Restore old backup into the same existing project: **REJECT FOR REHEARSAL**

Supabase's in-place Dashboard restore reverts the **shared production database**, interrupts availability and may discard newer writes across unrelated applications. This is a material, destructive production action. It cannot be used as a nonproduction rehearsal under current instructions; it needs its own emergency/maintenance authorization, whole-project data-loss approval and verified recovery controls. No such approval has been granted.

### B. Restore a physical backup to a new Supabase project: **DOCUMENTED BUT PROHIBITED**

The provider's [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project) feature creates **an additional project** and potentially additional fees. Its clone is database-only: Storage file bytes, Edge Functions, Auth settings/API keys and Realtime settings require separate reconfiguration. The user explicitly forbids creating another Supabase project. Do not invoke it or silently reinterpret permission.

### C. Download provider physical backup to GitHub/local PostgreSQL: **NO SUPPORTED SELF-SERVICE PATH VERIFIED**

The current CLI inventory lists physical backups; it does not expose a portable downloadable physical archive for replay into a disposable PostgreSQL service. The Phase 3 `pg_dump`/`pg_restore` workflow creates a different **logical** archive from synthetic data and cannot establish physical-backup recoverability. Never connect its runner to production to mask this distinction.

### D. Existing non-project isolated physical-restore target through Supabase Support: **PENDING PROVIDER CONFIRMATION**

An isolated provider-managed target or equivalent provider-supported mechanism could be acceptable **only if** Supabase explicitly supports it **without creating another project**, guarantees no writes/outage to the existing production project, identifies costs, privacy/data boundaries, full Auth/config/Storage limitations and an evidence-producing restoration test. **No such capability or entitlement was confirmed**. Do not assume support can offer it. If no acceptable mechanism exists, the mandatory rehearsal requirement remains a blocker, not a reason to restore production or waive it.

### E. Separate logical/Storage backup strategy: **POTENTIAL SUPPLEMENT, NOT REPLACEMENT**

An organization-approved, encrypted local `pg_dump` of production plus independently backed-up Storage bytes could substantiate **logical** data portability, but extracting production data and object bytes introduces privacy, credentials, operational and retention risks requiring **separate authorization**. It does not prove the completed Supabase physical snapshots can be restored or that hosted Supabase's full RTO is within 24 hours. Do not perform it under this Phase 4 gate.

## 4. Storage object recovery contract

- Database `storage.buckets`/`storage.objects` metadata and underlying object **bytes** are separate recovery subjects. Supabase [database backups](https://supabase.com/docs/guides/platform/backups) do not contain object bytes.
- Supabase [S3 compatibility documentation](https://supabase.com/docs/guides/storage/s3/compatibility) states **S3 object versioning is unsupported**; do not infer deleted objects can be recovered from native version history.
- An approved independent Storage backup must inventory bucket/key (kept in secure evidence, not public issue), object byte count, hash (SHA-256), creation/update timestamp and backup capture time, verify retrieval and restore into an **authorized isolated destination**, and reconcile every restored object with restored database metadata and RLS access rights.
- The current **0 metadata rows** reduces the presently enumerated object population but does not establish past undeclared objects, recovery capability, application file parity, or continued zero usage. Re-run the aggregate inventory immediately before any approved rehearsal/change. Without recoverable bytes, even a successful database restore leaves missing Storage objects.
- Never export private objects or access signing keys as a substitute for independent approval.

## 5. Required measured acceptance for a genuine rehearsal

1. **Authority, scope and isolation:** Named whole-project recovery owner with actual organizational authority, approved change ticket, accountable executor/stop authority, recovery site/isolation proof, data-handling, encryption and cost approval, and evidence that the live project remains untouched.
2. **Provider backup provenance:** Snapshot ID, actual completed backup date/time UTC, source project reference and independently verified availability/recoverability. Verify that the restored transaction boundary is known; do not equate schedule timestamp to data-consistency point without provider evidence.
3. **RPO measurement:** `RPO = simulated incident time - last recoverable committed transaction timestamp`. **PASS only if <= 24 hours** across every required data source, including Storage objects; otherwise FAIL/INCONCLUSIVE. The backup cadence alone is insufficient.
4. **RTO measurement:** Start at declared simulated outage, stop only once the isolated recovered service is fully usable with signed allowed/denied Auth/RLS tests, Board/TimeTracker/TradeLink/other module checks, Edge/Realtime configuration and Storage-object completeness. Record a real monotonic elapsed duration. **PASS only if <= 24 hours**. Synthetic runner's reported zero seconds is not a provider RTO.
5. **Integrity and security:** Schema/functions/source fingerprints, table counts and selected checksums, sequences, FK/audit histories, custom roles/credentials, RLS policies, same-workspace authorized access, foreign-workspace and revoked-session denial, cross-service configuration/replication, no unapproved external communication or secret disclosure.
6. **Evidence and sign-off:** Sanitized timestamps, restore logs, reconciliations, controlled errors, independent reviewer/owner attestation and explicit limitations. No assertion of `RECOVERY PLAN ACCEPTED` until all required checks are evidenced.

## 6. Current decision and next action

**CURRENT:** Backup provider inventory **VERIFIED**; Storage metadata counts **VERIFIED**; physical-backup isolated restore pathway **BLOCKED by no-new-project constraint and absent verified provider alternative**; actual complete Storage restore **NOT DEMONSTRATED**; production RPO/RTO **UNVERIFIED**; organizational recovery sign-off **PENDING**.

**Next external dependency:** Obtain an attributable **written provider answer** confirming whether an approved, independently isolated physical-backup restore is possible **without** provisioning a new Supabase project and without touching the existing project. Ask for exact supported procedure, cost, physical source retention, target isolation, Auth/Storage/Edge/Realtime coverage, and measured evidence options. If rejected or unavailable, keep issue #76 **NO-GO** and return to the accountable owner for an explicit infrastructure decision. Do not infer the user accepts a rehearsal waiver.

**No production mutation, provider restore, new project, credentials, SQL activation or Stage B write grant is authorized by this document.**
