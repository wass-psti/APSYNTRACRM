# CP-CRM-NATIVE-04A — Four-Application Transaction Persistence and Signed Readback

**Date:** 2026-11-19 (Asia/Manila)
**Repository:** `wass-psti/APSYNTRACRM`
**Scope:** TimeTracker, Fund Tracker, FuelTrack+ v3 and TradeLink
**Status:** VERIFIED — disposable transaction acceptance, isolated GitHub CI on PR and main, and GitHub Pages deployment PASS. Production business-write certification remains outside this scope.

## Execution boundary

This work does **not** access, create, edit, remove or reconcile real production attendance, financial, fuel or TradeLink records. It does not touch live credentials, sessions, roles, workspace permissions, RLS or Supabase projects. All database transactions run in disposable PostgreSQL containers, with synthetic identities and synthetic JWT claim simulations.

The acceptance result certifies existing application database workflow contracts under disposable signed-claim scenarios. It **does not certify production domain writes** from real authenticated browser sessions, storage uploads through a live service, actual bank transfers, or delivery of generated documents to recipients.

## Reproducible unified command

```bash
bash scripts/cp-crm-native04a-disposable-acceptance.sh
```

Requires Docker (running engine), Node.js and installed pinned npm dependencies. The runner invokes four independent existing or newly orchestrated disposable suites, and a focused frontend regression suite. The scripts never reference a production database URL or publish PostgreSQL ports. Every temporary PostgreSQL container is removed by a shell cleanup trap.

The dedicated `.github/workflows/cp-crm-native04a-disposable-acceptance.yml` workflow executes the same command on an isolated GitHub Actions runner with pinned checkout/setup-node actions and `npm ci`; no Supabase secrets are required.

## Acceptance evidence and invariants

| Application | Disposable persisted / read-back contract | Regression / boundary |
|---|---|---|
| TimeTracker | `cp-tt-flow01f-disposable-acceptance.sh`: signed clock-in → one source record and board projection → clock-out → distinct GPS fixes, duration and two authoritative audit events | Concurrent duplicate clock-in/out: one winning commit, one rejected duplicate. Overtime and unauthorized-scope tests |
| Fund Tracker | `cp-frt-flow03g-disposable-lifecycle-acceptance.sh`: request → DV → expense items → Finance approval → GM verification → recorded bank evidence → two receipt liquidation items → approval → closure → seven audited events | Exact monetary totals, idempotency, stale revision and nonmember denials, deadline/aging tests; test rows rolled back |
| FuelTrack+ | `fueltrack-v3-backend-disposable.sh`: signed fuel workflow → canonical board item → receipt metadata, audit, readback and replay; isolated old-data preflight | User/Admin role and private receipt boundaries preserved; legacy unlinked-row migration aborts without partial writes |
| TradeLink | `cp-crm-native04a-tradelink-disposable.sh`: signed six-type document create/read/retry/update → All Documents projection; first and second independent reviewer → Approved; new revision → historical approved readback | CAS/stale-denial, idempotency, reviewer substitution, immutable snapshots, prior revision preservation and safe resubmission |

### Observed local result

- Four application PostgreSQL suites: **PASS**.
- New TradeLink suite: `CP_CRM_NATIVE04A_TRADELINK_DISPOSABLE_PASS`.
- Unified four-application runner: `CP_CRM_NATIVE04A_FOUR_APPLICATION_DISPOSABLE_ACCEPTANCE_PASS`.
- Focused frontend command/domain regression: **114/114 PASS**.
- An initial TimeTracker run failed because a disposable PostgreSQL socket was temporarily unavailable; the traced rerun passed all assertions. An initial combined run encountered a disposable TradeLink database startup/shutdown race; the standalone retry and full sequential rerun passed. These were **test environment failures**, not demonstrated domain workflow defects.

## Changes and boundaries

**Implementation:** Add an isolated TradeLink transactional test runner, a unified four-application reproducible runner, CI integration, and this acceptance record. No application runtime code, schema migration, production data, or permissions are modified.

**Not verified by this milestone:** Completed real production clock-in/out; financial and banking transactions; actual fuel submission/refueling/receipt upload; real TradeLink save/reviewer approval/printing by two distinct production accounts; connected client/database end-to-end write latency. These remain distinct **PENDING** acceptance gates and must not be inferred from synthetic signed claim simulations.

**Conclusion:** Close **disposable four-application end-to-end transaction persistence and readback contract acceptance** after CI completion. Treat genuine production business-write certification as a separate scope with approved test identities and reversible records. No speculative security-policy changes are required.

## Final integration and production release evidence

- Implementation: PR [#576](https://github.com/wass-psti/APSYNTRACRM/pull/576) MERGED on 2026-11-19, commit `2469a9ab527b558c694a34a4a7ed83c39c74f763`.
- Independent PR disposable transaction CI: [run 44457284566](https://github.com/wass-psti/APSYNTRACRM/actions/runs/44457284566) SUCCESS.
- Repeated disposable transaction CI on merged main: [run 44457427110](https://github.com/wass-psti/APSYNTRACRM/actions/runs/44457427110) SUCCESS.
- GitHub Pages deployment of the implementation commit: [run 44457426450](https://github.com/wass-psti/APSYNTRACRM/actions/runs/44457426450) SUCCESS.
- Local full frontend tests: **2,770 / 2,770 PASS**; focused domain tests: **114 / 114 PASS**. Syntax, lint, build, and disposable contract tests passed. Existing Vite chunk-size warnings remain.

**Final decision:** The four-application **disposable persistence, synthetic signed-context readback and lifecycle contract** milestone is **CLOSED**. No production transaction mutation has been performed or certified.
