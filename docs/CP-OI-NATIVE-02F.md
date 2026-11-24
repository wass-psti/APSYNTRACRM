# CP-OI-NATIVE-02F — Existing-database legacy persistence and signed read integration

## Scope and architecture

2026-11-24. Candidate baseline 752cedee; fetched origin/main 862dae7f. Existing project jtlusodorfnyzgyuewkz read-only inventory: PostgreSQL 17.6, one archived native QA record, zero active native orders, no legacy table or registry view. No production writes or schema changes. The existing database remains the sole proposed operational backend.

Created CLI-generated SQL candidate supabase/migration-candidates/20261124075640_cp_oi_native_02f_legacy_read.sql (intentionally outside the applied migration directory). Adds historical table with workspace/source key uniqueness, deterministic application UUID, original JSONB payload and provenance, plus an invoker-rights UNION ALL registry view. Native numeric values are cast to text for lossless REST transport; historical decimal strings, unknown fields, fiscal groups, raw status, document reference strings and historical client evidence remain distinct. Existing Order Intake SELECT predicate is reproduced for the new table; no changes to existing roles, policies or mutation RPCs. New historical rows have no native revision. Signed registry list/detail client reuses OrderIntakeClient session transport, and app.js now references the candidate contract for the native route. This branch must not be deployed before the SQL candidate is activated. No silent fallback to incomplete data. Global CRM search remains on the existing native domain contract; in-module search covers loaded registry rows.

## Rehearsal and verification

Disposable PostgreSQL 17-alpine, existing M195 foundation migration, local GoTrue v2.197.0 and PostgREST v16.4; no production connection or credentials in harness. Workspace and module helper implementations are fixtures. Actual private compatibility manifest used locally; no business data committed or embedded in static assets. Transactional staging COPY and exact payload comparison; two consecutive imports 909/909, then rollback rehearsal in disposable DB and exact replay 909/909. Native synthetic active and archived records preserved. 728 unknown currencies and 909 unknown archive states retained. No duplicate identities or loss. Six unconfirmed source IDs remain snapshot-local keys tied to the original workbook hash; not safe cross-export upsert identities. Eight repeated PO numbers retain separate original source keys. No current client, VAT, archive or currency inferred.

Actual local GoTrue password logins (three disposable users) and signed PostgREST requests: 909 legacy + one active synthetic native row, ten bounded pages, 909 exact PO/currency/amount/profit/archive readbacks, three detail samples, archived native row retrieved only in archive query. Foreign workspace, missing module access and anonymous requests exercised to verify unchanged access semantics. All four renderers processed the real retrieved data. Signed Chromium isolated host (real native route/read-state/renderer and registry client, signed API proxied through Playwright, not the full CRM shell): 910 table rows, 10 page requests, no additional reads from tab/filter changes, historical USD amount exact 185352.889, unknown-currency filter 728 rows, historical detail, refresh, mobile overflow, zero page errors. 12 requests including detail and refresh. Not a production session or full signed deployed CRM acceptance. All disposable containers/network removed on exit.

Initial rehearsal exposed missing DEFAULTS on staging LIKE; fixed and rerun successfully. Existing new-order mutation interfaces unchanged, focused regression verifies inherited RPC call and revision contracts; no claim of full mutation lifecycle rehearsal. Stable order for a static snapshot (received date, ID, kind), offset paging retains existing duplicate guard; concurrent inserts/deletes can shift offsets, so a future cursor/snapshot contract is needed if live concurrent paging requires consistency.

## Tests

Four new registry client tests; 23/23 focused native/unified tests. Full frontend suite 3621/3621 PASS. Repository-configured npm run check/lint and npm run build PASS. Migration source manifest 222+84 unchanged. Signed database/API/browser rehearsal PASS. Source business files and logs remain private outside git.

## Reproduction

```sh
E="$HOME/.apsyntra-work/order-intake-evidence-20261124"
umask 077
bash scripts/cp-oi-native-02f-disposable.sh "$E/legacy-compatibility.json"
node --test frontend/tests/order-intake-registry-client.test.mjs
```

Private rehearsal log: 02f-postgres.log under evidence directory. The SQL generator is scoped to the disposable runner; not an authorized production import utility.

## Activation and recovery plan (not executed)

Before deployment, integrate latest main and reverify. Review source scope, six unresolved item IDs (or approve durable snapshot-only historical identity), all unknown fields and historical financial semantics; no default substitutions. Refresh destination identity inventory and check cross-table UUID collisions and native PO overlaps. Review exact manifest hash and batch identity, approval of archived/unknown historical semantics and provenance. Back up existing schema/data and confirm recoverability per established recovery policy. Activate candidate in existing project only with explicit schema approval; verify empty registry and current native records before frontend release. Separately authorize historical data import, use one transaction with unique source keys, reject changed existing payloads and verify every inserted ID/payload and expected count before commit. Failed transaction rolls back; post-commit recovery must identify exact imported batch and confirm dependencies and user changes before any compensating action; no indiscriminate deletes. Rehearse release rollback by reverting frontend to prior read contract while retaining historical data; do not drop imported data. Recheck real signed native route, full counts/financial coverage, details, repeated PO preservation, workspace access and production runtime. No training, gradient descent, model parameter updates, new project, dependency, or background agent.

## Disposition

CP02F locally verified. Production activation/import not authorized by this candidate rehearsal. Next CP-OI-NATIVE-02G — Coordinated Production Activation and Import Readiness: upstream integration, durable identity decisions, reviewed manifest and recovery plan; explicit production schema/data authorization required before activation/import. Genuine production signed acceptance remains pending.
