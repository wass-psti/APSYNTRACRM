# CP-OI-NATIVE-02E — Legacy persistence and unified native read proof

2026-11-24. Starting checkpoint 54e84326, origin/main babed993. Scope: nonproduction persistence and shared native renderer/read-state integration. No production schema, data, auth, dependencies or deployment changes.

## Contract and implementation

- Private local SQLite snapshot (Python standard library) is a persistence test artifact, not an additional operational database or Supabase project. It stores the complete compatibility payload and original source key, with deterministic UUIDv5 IDs scoped to Work Management. Repeated PO labels are not identity keys. The six unconfirmed IDs remain snapshot-specific and cannot be used as cross-export upserts.
- Transactional initial write, exact same-manifest replay/readback, rejection of differing snapshot, and read-only reopening. JSON payload retains exact decimals, nulls, raw source, provenance, and document reference strings. No schema migration applied to the existing production system.
- Unified snapshot reader accepts explicit native and legacy collections for the same workspace, rejects duplicate IDs/legacy keys, sorts by received date then ID, and exposes bounded list/detail reads. It is a nonproduction in-memory adapter over supplied snapshots, not a production API or server-side query implementation.
- Native Dashboard, Workflow, Search, All Orders and record detail renderer accept legacy rows using the existing state/router. Historical labels, original statuses, exact PO amounts, unknown currency filter and archive uncertainty remain visible. Source order values are grouped independently by known currency; historical profit is excluded from ordinary CRM profit totals. Missing expenses and VAT are not zero-filled.
- Existing app.js production host, signed OrderIntakeClient, mutation RPCs, database constraints, workspace authorization and role policies remain unchanged. The combined reader is exercised through isolated test host, not the deployed signed CRM route. Historical search is loaded-record scoped. No claim of production integration.

## Actual evidence

Private files in ~/.apsyntra-work/order-intake-evidence-20261124:
- legacy-local-02e.sqlite
- legacy-read-02e.json
Both mode 0600. Original compatibility manifest SHA-256 8883e5770f030016a2bc5bd2ddd7177273ad6415756700c6e1852759eef800ca.
Persisted 909/909 genuine legacy records; replay identical snapshot without duplication; SQLite integrity_check ok; full stored JSON payload equals every original manifest record. Exact PO numbers, amounts, currency and archive state readback 909/909. Separate read process reopened local database.
Unified reader traversed all 909 rows in 10 pages of up to 100; 909 distinct IDs and 909 detail readbacks; all four native views rendered using real local data in Node (not browser). 728 unknown currencies, 909 unknown archive states. PHP 163 rows 42495406.27; USD 18 rows 185352.889. No native rows in actual local legacy snapshot; mixed native + legacy behavior verified using synthetic fixtures. Unknown currencies excluded; historical figures not added to native profit. Existing archived QA target record was not touched; destination snapshot is prior evidence, not fresh production reconciliation.

## Verification

- New SQLite persistence tests 3/3, with connection cleanup verified after initial ResourceWarning fix.
- Focused JS native/UI/unified tests 19/19, including four new tests.
- Full frontend suite 3617/3617, zero failures.
- Synthetic Chromium mixed-record browser PASS: separate amounts and profit, workflow, unknown-currency filter, historical detail, repeated PO, refresh, mobile overflow, zero page errors. Initial harness exact-label locator timeout resolved by waiting for active tab and selecting named field.
- Existing synthetic native Chromium suite 8/8 pass. Neither browser run is signed production acceptance.
- npm run build, check, configured lint PASS. Existing migration source manifests 222+84 match. New modules syntax and staged diff checks pass.

## Reproduction

```sh
E="$HOME/.apsyntra-work/order-intake-evidence-20261124"
umask 077
python3 scripts/order-intake-import/legacy-local-store.py persist "$E/legacy-local-02e.sqlite" "$E/legacy-compatibility.json"
python3 scripts/order-intake-import/legacy-local-store.py read "$E/legacy-local-02e.sqlite" > "$E/legacy-read-02e.json"
python3 scripts/order-intake-import/test_legacy_local_store.py
node --test frontend/tests/order-intake-unified-read.test.mjs
node scripts/cp-oi-native-02e-browser.mjs
```

## Disposition / next

CP02E locally verified within nonproduction snapshot scope. Not a production persistence contract or deployed native data source. CP-OI-NATIVE-02F — Existing-database legacy persistence and signed read integration design: design a migration candidate in the existing Supabase database (not a new project), preserving original data and current new-order contract. Rehearse in disposable local database, implement bounded merged query/detail with stable identity and workspace scope using existing authorization, preserve financial basis and coverage, verify source provenance and repeated PO semantics, avoid copying private local files into frontend assets. Reconcile upstream before integration. Obtain remaining six item IDs or explicit durable unresolved identity handling, review historical client/VAT/archive evidence, refresh destination snapshot, define import/readback/rollback. Production schema activation and import separately authorized. No changes to existing role/permission behavior requested. No gradient descent, training, model parameter updates or background agents.
