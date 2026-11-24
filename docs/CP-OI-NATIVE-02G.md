# CP-OI-NATIVE-02G — Coordinated production activation readiness

2026-11-24. Starting checkpoint 70c5f86e. Local merge f842a1ed integrated upstream main 451982ed without conflicts; remote main confirmed unchanged at final check. No remote push, PR merge, production migration or production data write.

## Fresh production inventory and release policy

Read-only Supabase checks in existing project jtlusodorfnyzgyuewkz: PostgreSQL 17.6; target workspace exists; Order Intake board has zero items; one archived native QA record (revision 2), zero active; legacy table and registry view absent. Existing native RLS enabled, authenticated SELECT granted, anonymous SELECT not granted. Current policy matches candidate workspace/module predicate. Latest production migration 20261124050317; candidate version 20261124075640 has no collision. These are database inventory checks, not signed production user acceptance.

Authoritative current config/production-release-policy.json and docs/RECOVERY-POLICY-RETIREMENT-20261110.md retire mandatory 24-hour RPO/RTO, provider recovery rehearsal, independent offsite backup and AWS infrastructure. These are NOT APPLICABLE, not new release blockers. Existing backup preservation, safe migrations, signed acceptance and branch/deployment protections remain. No deletion or modification of existing backups.

## Reviewed batch and source integrity

Offline activation-readiness.py verifies original workbook hash, manifest hash, every locator and stable identity, unique UUIDs, full fresh native inventory, and zero native UUID/PO overlaps. Six unconfirmed identities deliberately remain snapshot-specific (not cross-export upsert IDs); 903 corroborated source IDs. Eight repeated PO labels preserved. 909 records, 728 unspecified currencies, 909 unknown archive states, missing current client and VAT on 909, historical client evidence unchanged. Scope is exactly the exported snapshot, not unexported or independently uncounted archived source history. Unknown archive state must not be represented as known active status; registry includes unknowns with coverage disclosure. Attachment references only; actual document binaries not migrated.

Private evidence under ~/.apsyntra-work/order-intake-evidence-20261124, mode 0600:
- destination-02g.json: fresh complete native identity snapshot; sha256 2ea1cd73e1f18455689f5e5383da929fe49eec3abac2af2899c1a711f1e36049.
- activation-review-02g.json: 909 UUID/source-key/locator/payload-hash entries; sha256 9faf8b48440579b9bcd3c066e3020cadc7a2c191101e8e824b3a26fbcbdd7dda.
- reviewed-import-02g.sql: private generated SQL, not executed in production; 2287112 bytes; sha256 4c2ef70ff13e3c74a59df56781daf66cc4dcfe10080e2a3080db93eb37a62fe9.
- legacy-compatibility.json: reviewed manifest sha256 8883e5770f030016a2bc5bd2ddd7177273ad6415756700c6e1852759eef800ca.
- original workbook SHA256 c1d5ee520451242a7aabfa8ce5b10df65307c20655eee3a50387ca3b9433dce3.
- SQL candidate SHA256 abe091c68c9f2272637b498f9f3c13b7df5237e6d105c30532b27720fc36db36.

## Import transaction and local verification

Rehearsal generator strengthened: psql ON_ERROR_STOP; bounded lock/statement timeouts; transaction-level locks on two Order Intake tables serialize collision checks and imports without blocking ordinary SELECT; staging inherits constraints, defaults and unique indexes. Refuse native ID/PO overlap, reject changed existing source payload; identical replay no duplicate and full payload readback before commit. The disposable runner tests both changed payload and native PO conflicts, verifies rejected transactions do not damage original records, and removes its private temporary files and containers. No automatic deletion of historical records in production.

Fresh verification after main merge: 3641/3641 frontend tests; 6/6 new offline review tests and 3/3 local persistence tests; build, configured lint, syntax/check, 306 existing migration file hashes and CSS bundle (79 sources) pass. Disposable real PostgreSQL/GoTrue/PostgREST/browser run passed: 909 exact readbacks on initial/replay/rollback/conflict checks; 910 visible rows including one native fixture; ten pages, 12 requests with detail/refresh, zero page errors. Workspace helper fixtures, isolated shell, not live production acceptance. No remaining checkpoint containers or networks. Original data remains outside Git.

## Coordinated activation sequence (PENDING explicit production authorization)

1. Approve exact candidate migration and 909-record manifest above, including snapshot-only identities and unknown historical fields. Recheck current remote main, migration ledger, destination identities and checksums immediately before execution; rerun if drift affects scope.
2. Use existing authorized production migration mechanism; activate only candidate 20261124075640 in existing project. Verify schema, migration ledger, matching native policy and unchanged native record. Only record applied migration in repo after actual ledger confirmation, per candidate-directory convention.
3. Execute reviewed import as one transaction through a verified existing authorized PostgreSQL client connection; do not expose credentials or write production data through the disposable runner. COPY FROM STDIN requires client support; the private SQL is larger than the connected raw-SQL tool limit, so do not split across independent transactions. Production execution connection has not been established in this checkpoint. If unavailable, use an approved equivalent single-transaction transport, reverify before execution. Check exact batch payloads, native preservation, 909/909 and financial coverage before COMMIT. Roll back automatically on error.
4. Verify live registry counts and signed readback with existing CRM account, then integrate through existing protected branch/CI/deployment workflow. No direct main bypass. Never deploy registry-dependent frontend before database contract exists. Verify full deployed signed CRM route. Global search across legacy records and new-order mutation lifecycle are later functional milestones.
5. Recovery: failed import transaction rolls back. Frontend rollback retains database and history. After committed import, do not automatically delete records; use exact batch identity hashes, check user changes/dependencies and separately authorize any compensating operation. No mandatory retired provider drill.

Readiness VERIFIED locally; reviewed manifest and SQL are ready for authorization, not authorized production writes. Existing native authorization, data, schema, provider backups, dependencies and model execution unchanged. No gradient descent, training, fine-tuning or parameter updates. Retain CP-OI-NATIVE-02G for explicit activation/import authorization and subsequent production acceptance; no repeat discovery or artificial extra checkpoint.
