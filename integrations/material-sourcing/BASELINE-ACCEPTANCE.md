# CP-MS-CRM-01 — Baseline acceptance evidence

Date: 2026-11-27. Scope: preserved Material Sourcing source and cloud-only regression baseline, not native CRM runtime activation.

## Evidence

- Source preservation commit: 95dbf7dcb6ff7ab97f0dd1dc88d9d6106f7ea8f9.
- Certified application source / workflow commit: 6ffbecea2a5c185d28beb26907b5d31fc49be748.
- GitHub Actions push run [45969094916](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45969094916), job 140404828265: success.
- PR run [45969101931](https://github.com/wass-psti/APSYNTRACRM/actions/runs/45969101931): success.
- Verified 56 source files, 376314 original bytes, against SHA-256 manifest; no mismatches. First run failed only at browser setup because ubuntu-latest resolved to Ubuntu 26.04, incompatible with Playwright 1.51.1. Pinning Ubuntu 24.04 corrected it without changing dependencies.

| Verification | Result |
| --- | --- |
| Locked install, strict TypeScript, Vite build | PASS |
| Unit checks | 8/8 |
| Frontend browser checks | 9/9 |
| Advanced frontend browser checks | 14/14 |
| Database integration | 6/6 |
| Three migrations, rollback and reapply | PASS |
| Database CRUD browser checks | 14/14 |
| Pricing matrix | 81/81 |
| Pricing additional verification groups | 7/7 |
| Collaboration checks | 10/10 |
| Bulk verification groups | 9/9 |

The CP-MS-BACKEND-05 source is now certified against the recovered baseline in disposable GitHub Actions PostgreSQL, not against deployed CRM. The bulk tests verified invalid batch rollback, concurrent identical imports, repeated part numbers, overlapping/disjoint transactions, targeted patch preservation, archive/restore receipts, quoted TSV and draft recovery, lost-acknowledgement replay, and 5000-record reconciliation.

## Observed CI timings

5000-record import 956 ms, patch 863 ms, archive 460 ms, restore 1002 ms. Frontend 5000-record reload 323 ms; 19 initially rendered rows and 18 at table end; XLSX export/readback 1234 ms. These are individual CI measurements, not a production SLA.

## Main and subsequent development

Enable the same workflow for main pushes affecting the baseline. The source manifest is a frozen transfer attestation; it is deliberately checked unchanged at this checkpoint. When adapting source in CP-MS-CRM-02/03, verify the original hashes against the preserved commit rather than deleting or overwriting the historical manifest, and validate the evolving implementation with current regression tests.

No changes to existing CRM application files, deployed data, application roles, permissions, or production migration directories. The test API and fixtures remain nonproduction only. No local development or training required.

Next gate: CP-MS-CRM-02 — CRM architecture and database contract reconciliation. Compare existing signed MRH board, item/group, commercial-field and task contracts to preserved standalone source. Produce a field/identity map and nonproduction compatibility tests. Preserve current permission policy, existing records and approved interface. Production migration and native route activation are separate, not certified here.
