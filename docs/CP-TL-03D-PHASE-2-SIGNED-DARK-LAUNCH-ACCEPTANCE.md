# CP-TL-03D / Phase 2 — Deployed Signed Draft Dark-Launch Acceptance

**Date:** 2026-11-06 (Asia/Manila)  
**Scope:** Existing APSYNTRA CRM TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88`, existing Supabase project `jtlusodorfnyzgyuewkz`.  
**Decision:** **USER-ACCEPTED FOR ROADMAP CONTINUATION; VERIFIED PORTION ONLY; UNTESTED SECURITY SCENARIOS REMAIN BLOCKED/PENDING.** The project owner explicitly instructed on 2026-11-06 to “consider it all good.” This is an operational acceptance of the current Phase 2 dark-launch behavior, **not** independently verified completion of every acceptance criterion, security certification, or permission to enable production writes.

## Verified evidence

1. **Phase 1 source/CI baseline:** `docs/CP-TL-03D-PHASE-1-DRAFT-DARK-LAUNCH.md`, source-aligned final code `370645ae0aaad91927e2350cfd6d2e3d39fd6155`, successful [Frontend Validation run 42196960986](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42196960986), 1,098 tests passed, 0 failed. These are automated tests, **not** deployed browser acceptance.
2. **Current repository/deployment:** repository `main` was inspected at `4193a85c342c347f3be52a1ade830d439d35728e`, [successful Pages deployment 42209775964](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42209775964). Comparison with Phase 1 documentation HEAD `aa41c5db02e080257051fe53a4c7436db2a2c7d3` found only Workspace-related documentation/test/workflow differences; no TradeLink source change.
3. **User-submitted deployed browser observations:** An existing signed General Manager account could enter the genuine TradeLink board and the staged Draft workspace. A Quotation with a local sample line was accepted by **Validate locally** and displayed “Nothing saved or transmitted”; **Create Draft** was visibly disabled. An existing HR account received “Board unavailable — Access denied by your workspace permissions”. These are *user-provided screenshot observations*, not live browser actions independently run by the assistant. The earlier five other source-defined document module pages were observed as navigable; their individual Draft-form validation was not separately evidenced.
4. **Current read-only production SQL:** `public.tradelink_documents` = **0**, `public.tradelink_document_events` = **0**, and `public.work_board_items` for the canonical TradeLink board = **0**, checked on 2026-11-06 after user testing. No records were deleted or changed to obtain the baseline.
5. **Actual production EXECUTE grants:** `authenticated` and `anon` both lack EXECUTE on `private.tl03_commit(uuid,uuid,bigint,text,jsonb)` and `public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)`; verified from `pg_proc`/role privilege catalog with read-only SQL. Previously inspected document/event RLS policies are read-only and require `private.tl03_can_manage(board_id)`.
6. **Source boundary:** `frontend/tradelink-domain-client.js` continues to declare `TL03_DOMAIN_READS_ENABLED=false` and `TL03_DOMAIN_WRITES_ENABLED=false`; `frontend/tradelink-draft-workspace.js` retains the staged editor and local validation. `frontend/app.js` resets ephemeral Draft state on route/identity/workspace changes and refuses Draft commit when release flags are disabled. These are source/code-test findings, not proof that real multi-session browser transitions passed.

## Remaining genuine signed-session acceptance (not certified)

| Criterion | Current classification | Necessary observable evidence |
| --- | --- | --- |
| Correct deployed signed General Manager route and one local Quotation preview | **VERIFIED from submitted screenshot** | Evidence already received; do not needlessly repeat |
| Existing HR's board-level denial | **OBSERVED from submitted screenshot** | Current signed HR denied the board; does not independently prove direct authenticated API/RPC denial |
| Six Draft document types with valid and invalid local validation | **PENDING** | Exercise each type in the staged Draft form, including invalid required/line/currency inputs; no write |
| Draft-field redraw and same-user navigation | **PENDING** | Unsaved input retained only for supported in-view redraw; cleared by route unload / full reload per implemented design |
| Sign-out and alternate authorized identity | **BLOCKED** | Genuine separate sessions, no carried draft fields or document contents |
| Missing/expired/revoked session denial | **BLOCKED** | Genuine server/auth denial and no stale render; synthetic CI checks are insufficient |
| Other-workspace denial | **BLOCKED** | Real legitimate foreign-workspace session, only if already available; no new accounts or workspaces |
| Server-side HR/unauthorized document read denial | **PENDING** | Genuine signed Stage A read denial report or equivalent exact authenticated RPC response; an inaccessible page alone is insufficient |
| Host-side operational Create/Update/Archive/Restore denial | **PARTIALLY VERIFIED** | Disabled UI, flags off and production grants absent; no direct production mutations attempted |
| Post-test production non-mutation | **VERIFIED at latest check** | Counts remain 0/0/0; repeat after any additional acceptance testing |
| Independent signed browser acceptance and evidence | **BLOCKED** | Browser connector cannot acquire originating authenticated browser context in this chat |

The browser tool returned: `Browser access requires the originating browser context. Open ChatGPT in the browser with the connected extension and try again.` An ambient URL and screenshots do not confer authenticated browser control or permit reliable session-switch automation. The assistant did **not** log out users, reuse bearer tokens, fabricate sessions, execute write RPCs, or perform unauthorized operations.

## Closure rule / next action

**USER ACCEPTANCE / CONDITIONAL CLOSEOUT:** On 2026-11-06, the project owner stated “consider it all good.” Record Phase 2 as **user-accepted for roadmap continuity** while retaining every PENDING/BLOCKED or partially verified evidence cell above as-is. Do not relabel these checks VERIFIED or represent owner sign-off as a signed security test. They remain required evidence before any production Draft write activation. Collect genuine nonsecret signed browser evidence when access permits and repeat the read-only database non-mutation check after any new testing.

**Production boundary:** Keep Draft reads/writes and lifecycle OFF. Do not apply Stage B grants, change roles/memberships, create business records or test users, or treat this UI gate as production activation authorization. Recovery/owner/permission approvals in `docs/CP-TL-03C-PHASE-3B-RECOVERY-AND-PERMISSION-DECISION-2026-11-06.md` remain a separate NO-GO gate.

**Progress:** indeterminate; authenticated browser acceptance does not have a defensible verified denominator until required scenarios are executable.

## Owner sign-off addendum — 2026-11-06

- **User decision:** “consider it all good.” Accepted as a direction to stop repeating Phase 2 dark-launch UX checks and continue the TradeLink roadmap within the already approved non-mutating scope.
- **Milestone disposition:** **CLOSED — USER-ACCEPTED WITH DOCUMENTED EVIDENCE EXCEPTIONS.** This is **not** `VERIFIED` for unexecuted signed-session, revoked-session, cross-workspace, or API-denial cases.
- **Evidence preserved:** Screenshot-confirmed General Manager Draft access and local Quotation validation; HR board denial; independently queried zero documents/events/board items; disabled authenticated and anonymous commit EXECUTE grants; automated 1,098/1,098 Phase 1 tests.
- **Residual risks:** Six-type negative browser validation, session switch/refresh/redaction, foreign-workspace and revoked/expired bearer tests, direct HR read API denial remain pending/blocked. They may not be silently waived for future production security activation.
- **Permitted continuation:** Source review, focused nonproduction tests, non-mutating UX preparation, implementation within approved scope, and planning the next TradeLink gate. **Not permitted:** Stage B production permission grants, production Draft writes, role changes, credential changes or lifecycle activation without separately satisfied gates and authorizations.
- **Next roadmap action:** Inspect current TradeLink roadmap/CP-TL-03C Stage B decision and choose the next non-mutating gate; do not invent a new checkpoint identifier or treat this sign-off as Stage B go-ahead.
