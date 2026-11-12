# CP-BIMP-16 — Genuine signed import acceptance and controlled release candidate

Date: 2026-11-12 (Asia/Manila)

## Existing dedicated QA destination

- Production workspace contains a clearly designated **nonproduction ordinary QA board**, `CP-BIMP-11 Import QA`, ID `e1071df3-1b0d-43c0-8aa0-732c09032df4`. Its board description explicitly reserves it for synthetic CSV/XLSX import and post-refresh verification. The unrelated `CP-BOARD-COL-DELETE QA Signed Fixture` was not used.
- Before CP-BIMP-16: 4 retained synthetic items: 2 CSV and 2 XLSX from November 11. Existing typed physical columns: Amount (number), Flag (checkbox), Date (date). No schema/permission change was needed.

## Genuine signed deployed-runtime acceptance — VERIFIED

The **existing authenticated Chromium session** on the user's authorized MacBook Pro was used directly through the deployed APSYNTRA CRM browser UI. No session tokens, credentials, database passwords or cookie values were read or exported. The wizard was exercised with ordinary file input events, mapped **all 4 source columns** to the 4 existing fields, selected **Main group**, and executed the signed app's existing atomic import RPC through its own `Import Now` button.

| Source | Item | Amount | Flag | Date | Signed UI receipt |
|---|---|---:|---|---|---|
| CSV | CP-BIMP-16 CSV Echo | 163.25 | true | 2026-11-16 | 2 created, 0 updated, 0 skipped |
| CSV | CP-BIMP-16 CSV Foxtrot | 0 | false | 2026-11-17 | 2 created, 0 updated, 0 skipped |
| XLSX | CP-BIMP-16 XLSX Golf | 401.5 | true | 2026-11-18 | 2 created, 0 updated, 0 skipped |
| XLSX | CP-BIMP-16 XLSX Hotel | 7 | false | 2026-11-19 | 2 created, 0 updated, 0 skipped |

Both successful UI receipts reported **0 columns created / 0 groups created**. Read-only PostgreSQL queries against the existing Supabase project confirmed **4 newly created synthetic records and all 12 typed cells** have their exact expected persisted values. After explicit browser page refresh, a new signed UI read displayed **all 8 QA records**, including the four previous fixtures, and the correct Amount/Flag/Date values. No operational board was modified.

These claims apply to the **currently deployed production frontend**, not to the newer CP-BIMP-15A branch. No preview deployment of the new branch existed at the time of this run.

## Integration and release readiness

- The complete CP-BIMP-11 to CP-BIMP-15A stack was integrated against the latest `origin/main` in release branch `release/cp-bimp-16-integrated-20261112` with **zero Git conflicts**.
- CP-BIMP-16 adds one non-permission UI route-coherence check: importing is deferred if the browser hash and currently selected board differ during navigation. This prevents a stale previous-board import dialog from opening while the next board loads, without changing access rights.
- This repository contains the **staged m143-v2 extended-reference SQL candidate**, but it is **not applied** to production. The frontend continues m143-v1 on backends without the optional read capability.
- Existing CI verifies syntax, frontend regressions, disposable PostgreSQL signed claims and isolated Chromium recovery. Release to GitHub Pages must be verified separately with the current deployed revision and exact signed user runtime.

## Remaining final acceptance

- The newly integrated frontend is **not yet accepted through a genuine signed user**. After a controlled frontend-only release, repeat distinct synthetic CSV/XLSX QA imports against that version, refresh/reopen and compare authoritative cells. Do not falsely treat the old-build acceptance above as new-build acceptance.
- Production m143-v2 auxiliary schema activation remains **NOT AUTHORIZED/NOT APPLIED**. It requires separate explicit approval because it alters persistent storage; CP-BIMP-16 does not seek to change roles, RLS, permissions or credentials.
- No nonproduction host with a valid signed session for this integrated build was available in Chat mode. Do not bypass sign-in or reuse test users.
- If final release checks fail, preserve repository state and stop the rollout; do not perform destructive cleanup or silently retry uncertain imports.
