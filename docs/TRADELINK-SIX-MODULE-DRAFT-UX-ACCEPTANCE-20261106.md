# TradeLink — Six-module Draft UX consolidation and signed-browser acceptance

**Date:** 2026-11-06 (Asia/Manila)  
**Repository:** `wass-psti/APSYNTRACRM`  
**Board:** existing signed TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`  
**Environment:** existing GitHub Pages and WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`  
**Scope:** Non-mutating Draft UX and acceptance; no production write activation, grants, records or lifecycle actions.

**Disposition: IMPLEMENTED AND AUTOMATED VERIFIED; DEPLOYED/CDN VERIFIED; GENUINE SIGNED-BROWSER INTERACTIONS BLOCKED/NOT CERTIFIED.**

## Problem and implementation

Before this increment, switching the Draft module could carry unsaved values from the prior module (including customer, payment, reviewer and other unrelated fields); a successful local preview could remain visibly valid even after inputs changed; invalid form feedback was generic. These are **frontend UX/data-isolation defects**, not evidence that a server authorization boundary failed.

**Code commit:** [`0c866557d355e3ec413e1bcf7c714a96d11b2a3a`](https://github.com/wass-psti/APSYNTRACRM/commit/0c866557d355e3ec413e1bcf7c714a96d11b2a3a).

- `frontend/tradelink-draft-workspace.js`: adds the pure `resetTradeLinkDraftForm` transition with a strict six-key module allowlist. Every module switch clears prior in-memory document inputs and selected local record references while retaining non-form view metadata. Invalid type values fall back to Quotation. Adds an explicit **Clear local fields** action, an accessible reset notice, and a constrained helper for known local validation error messages.
- `frontend/app.js`: wires module-type changes and manual reset behind the existing genuine signed TradeLink board/route guard; rerenders and restores focus to the type selector. The in-view capture handler invalidates prior local preview success as soon as an input changes. Native invalid fields display label-specific feedback; parser errors use known hardcoded validation messages without echoing entered values. No new API, cookies, tokens, localStorage, sessionStorage, or backend writes.
- `frontend/tradelink-application.css`: strictly scoped reset, valid-preview and error styles, preserving the existing app shell and accessible text status.
- `frontend/tests/tradelink-draft-workspace.test.mjs`: three additional tests, including every ordered pair of six *different* module types (30 pairs), an unsafe module-key fallback, manual clearing, and invalid/success/pending message transitions.
- No source module, backend contract, workspace membership, Supabase function, role, authentication or production release flag was changed. `TL03_DOMAIN_READS_ENABLED=false`; `TL03_DOMAIN_WRITES_ENABLED=false`.

## Evidence ledger

| Criterion | Result / evidence |
| --- | --- |
| Source changes committed at one SHA | **VERIFIED**: `0c866557d355e3ec413e1bcf7c714a96d11b2a3a` |
| Six-module switching, memory isolation, invalid type fallback | **VERIFIED in automated tests**: 30 ordered transitions and safety assertions |
| Explicit clear action, scoped accessible feedback, prior-preview invalidation | **VERIFIED in automated source/markup regression**; actual clicks not yet observed |
| Full frontend regression | **VERIFIED**: `1,110/1,110` passed, `0` failed in [Actions 42226340669](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42226340669) |
| Disposable PostgreSQL, collaboration, OT jobs | **VERIFIED**: success in same validation run. These do not constitute live production write acceptance. |
| GitHub Pages deployment | **VERIFIED**: [Actions 42226340161](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42226340161) success at exact code SHA |
| Independent static CDN/HTTPS smoke | **VERIFIED**: after stale-CDN first attempt, failed live-only job was rerun after deployment; log: `LIVE PAGES SMOKE: PASS for 0c866557d355e3ec413e1bcf7c714a96d11b2a3a`. The CI smoke includes `frontend/app.js`, `frontend/tradelink-application.css`, and other configured assets; it does **not** currently hash-check the Draft workspace module file itself, so do not overstate direct file coverage. |
| Current signed browser route read-only snapshot | **OBSERVED**: an existing TradeLink Draft tab reports an `admin_general_manager` session and the dark-launch write-off label. Tab remained on the previous rendered UI without the new Clear action; the user did not refresh during this attempt. |
| Genuine signed UI interactions (module switch, local validation, clear, route/logout) | **BLOCKED / NOT VERIFIED**: connected Chat-mode browser tools allow only tabs/page-text reads, not clicks, typing, reload, session transitions or authenticated browser execution. No inputs or account changes were attempted by the assistant. |
| Live production row counts / commit grants after this increment | **NOT RETESTED**: no production database checks requested or needed for this frontend-only change. Prior verified read-only non-mutation/grants remain the baseline, not fresh evidence. |

## Exact genuine signed-UI acceptance checklist (not yet executed)

On the existing signed General Manager TradeLink Draft page, using harmless non-secret QA strings:

1. Type a local Quotation draft; select Packing List and verify the new module fields appear while *all* prior customer, document number, commercial, financial and reviewer values are absent. Repeat across at least Packing → Delivery → Payment → ESI → Quotation → PO, including reverse switching.
2. Enter valid source-aligned fields for each of six modules. Select **Validate locally**; verify confirmation says **Nothing saved or transmitted**. Deliberately omit required fields, enter an invalid date or amount, and verify the field/error feedback never reports a save.
3. After a successful local preview, change a populated field; the success indicator must change to **Inputs changed. Validate again. Nothing saved or transmitted.**
4. Select **Clear local fields** and verify values are gone while the current module remains selected, accessible notice appears, and Create Draft remains disabled.
5. Reload or leave the route; no prior local form values should be retained. Signing out or changing an existing permitted account must not expose the other user's in-memory input. These signed session-isolation checks are still **PENDING**, and should not be manufactured using localStorage or forged JWTs.
6. Do not bypass the disabled Create/Save action, invoke production mutations, apply permissions, or create a QA account to satisfy this gate.

**Future closure rule:** The UX implementation may advance within the approved non-mutating roadmap, but the genuine signed-browser interactive acceptance cell cannot be labeled VERIFIED without actual controlled session evidence. Preserve user-acceptance exceptions separately if the owner later chooses to accept the feature with that caveat.

**Stage B remains NO-GO:** no production Draft writes, workflow approvals, document lifecycle activation, financial movement, inventory movement, roles/permission grants or irreversible operations were authorized by this work.

**Progress:** The source, unit/regression, isolated-database, deployment and configured CDN smoke gates all have evidence (**5/5 technical checks**, 100% of those *technical* checks); this figure intentionally excludes the outstanding real signed-browser acceptance and is **not** production certification.
