# CP-BOARD-COL-DELETE — Phase B signed QA acceptance

**Date:** 2026-11-06  
**Status (2026-11-06):** **B1/B2/B4.1/B4.2/B5 VERIFIED; GENUINE SIGNED MANAGER DENIAL PASS; NONMANAGER AND FOREIGN-WORKSPACE DENIAL PROBE READY AND UNIT-TESTED, LIVE SIGNED NONMANAGER PENDING, GENUINE FOREIGN WORKSPACE BLOCKED BY ABSENT ACTIVE FOREIGN MEMBERSHIP; REVOKED/EXPIRED SESSION DENIALS PENDING.** Earlier sections preserve historical preactivation evidence. 

## Verified baseline

Phase A production migration `20261106002107` remains installed. The **B1** migration `20261106005756` now adds the private QA scope table and board/actor/expiry guards to each of its three recovery RPCs. Both server activation flags remain `false`, the QA scope and recovery snapshots remain empty, and Contacts / Status I still has four stored values. No real signed QA session, QA board creation, or production board deletion/restoration was performed in B1.

## Staged work

- `sql/cp-board-col-delete-phase-b-qa-scope-candidate.sql`: **INSTALLED IN PRODUCTION UNDER APPROVED B1**, as managed migration `cp_board_col_delete_phase_b1_scoped_qa_guard_20261106`. The source-fingerprint-locked change limits each recovery RPC to one approved QA board, one signed actor, and a maximum 60-minute expiry, while retaining both global flags disabled.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-acceptance.sql`: controlled synthetic signed-role tests covering four cells, scope and Viewer denials, expired scope, Activity events, restoration and rollback.
- `sql/tests/cp-board-col-delete-phase-b-qa-scope-reset.sql`: restores original function definitions in disposable PostgreSQL.
- `frontend/board-column-recovery.js` and `frontend/app.js`: QA-only interface guard; the recovery feature switch remains false and Contacts is ineligible.

[PostgreSQL run #42137611502](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42137611502): SUCCESS. Logs confirm both the QA scoped delete/restore Activity rollback test and preservation of the original function sources.

[Frontend Validation #42138438191](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138438191): SUCCESS, including the QA-only UI checks, existing client behavior, and other frontend regression suites. [Pages deployment #42138437582](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42138437582): SUCCESS. A previous frontend run failed due to an outdated test assertion for the former global UI flag; the test was updated for the QA-board predicate and all suites passed on the corrective commit.

**Before B1**, the production inspection confirmed three original Phase A RPC fingerprints. **After B1**, production read-only verification confirmed three QA-scoped RPCs with signed-session, board-manager, QA-marker, identity, and expiry checks preserved; a private RLS-enabled QA table with zero scope rows; both flags disabled; zero recovery snapshots; and **all four Contacts / Status I values intact**.

Synthetic PostgreSQL session tests are not proof of genuine GoTrue browser authentication or post-refresh persistence.

## B1 production installation and authorization evidence (2026-11-06)

The user explicitly authorized **B1 only**. The source-locked candidate was applied through Supabase managed migration, removing the file's outer transaction wrappers so the migration runner owned the transaction. The server returned `success:true`; Supabase migration history now shows **166** migrations, including version `20261106005756`, name `cp_board_col_delete_phase_b1_scoped_qa_guard_20261106`.

**Actual production SQL checks:**

- `CP_BOARD_COL_DELETE_PHASE_B1_PRODUCTION_QA_SCOPE_DEFAULT_DENY_VERIFIED` — PASSED, including all three updated RPCs retaining original signed-session, `manage` authorization, global-activation, nonexpired QA-board/actor checks, required QA name marker, and anonymous execution denial.
- The only new table, `private.wm_recoverable_column_qa_scope`, has **RLS enabled**, no `anon` or `authenticated` direct table privileges, and **zero rows**. No new QA board or authorized actor was created.
- Both existing server activation flags are still `false`; zero archived column/cell snapshots exist. The frontend recovery feature flag remains `false`.
- Contacts board still has **five columns**; its custom **Status I** column remains present with **four persisted cell rows**.
- Reran the unchanged Phase A production postinstallation verifier: `PHASE_A_POSTINSTALL_DEFAULT_OFF_RLS_GRANTS_AND_SOURCE_VERIFIED` — PASSED.
- Supabase reports `ACTIVE_HEALTHY` PostgreSQL 17.6. Existing database-wide advisor warnings persist, including some unrelated callable security-definer functions; B1 added a scope restriction to its three purpose-specific RPCs and does not claim to remediate the entire project.

**Limits:** The postchecks verify installed source, RLS and permissions. They do not count as a genuine GoTrue-browser signed manager session, a live QA fixture, refresh persistence, or Activity restoration. The saved Phase B test suite remains the evidence for disposable four-row recovery only.

---

## Pending production gates

**B1:** **COMPLETE / VERIFIED.** User approved and production managed migration recorded as `20261106005756`. Current exact RPC fingerprints: delete `c9306ac46991b67bbfc1817cf197b5b5`; list `51a6f2574597107396e298277111e1c6`; restore `d569201323f80d9e5f8e08d7cdeffab5`.  
**B2:** Separate approval for an ordinary QA board fixture operated by an existing signed board manager in the current workspace, not Contacts.  
**B3:** Controlled, time-bounded activation restricted to that board and actor following verified B1 installation.  
**B4:** Genuine browser-session deletion, refresh/reopen, Activity restoration and authorization-denial acceptance.  
**B5:** Confirm restoration, disable the activation settings, remove temporary scope as appropriate, and preserve audit and recovery data.

Phase C deletion of Contacts / Status I is not authorized by Phase B. No live QA fixture or signed browser test is claimed here.

**Next required gate:** B2 — controlled ordinary QA board fixture and genuine signed-user access, followed by separately authorized B3 time-limited activation. B1 is COMPLETE; neither B2 nor B3 is implied by the B1 approval.

## B2 signed fixture entry point — 2026-11-06

**Authorization:** The user selected the next gate, Phase B2, after Phase B1 was verified. Scope is one ordinary, synthetic QA board in the existing workspace and its four nonproduction test cells. No activation flag, QA scope row, live operational board, user role, or credentials are changed by this setup.

**Real signed-session integration staged on the deployed app:** `frontend/board-col-delete-b2-signed-fixture.js`, `frontend/app.js`, and `frontend/tests/board-col-delete-b2-signed-fixture.test.mjs`. The signed Security page includes two explicit user actions:

1. **Inspect signed QA fixture** — read-only GoTrue identity + active workspace + ordinary board-manager access + authoritative board/item/column/cell verification. Returns PENDING if no fixture exists.
2. **Create signed B2 QA fixture** — only upon a real user's click. Requires `auth.getVerifiedUser()`, `wm_auth_access_context`, stable actor/workspace, zero existing QA-named boards and the real signed native board APIs. It creates an ordinary board named **`CP-BOARD-COL-DELETE QA Signed Fixture`** in the current workspace through `wm_create_board`; creator is the real board owner. It adds one ordinary **Recovery Status** text column through the original revision-protected `wm_board_schema_mutate`, four synthetic item rows through `wm_add_board_item`, and four values through `wm_set_board_cell_if_current`. It checks fresh signed context between operations and verifies exact four-value readback and ownership through `wm_get_board`.
3. **Copy nonsecret QA report** — whitelists status, stage, reason, and cell count; excludes user identifiers, workspace identifiers, tokens, private snapshot contents, and board identifier. The page shows a local direct QA-board navigation link when a board identifier is known.

**Safety:** This is not a privileged backdoor or server-only admin insert. It never calls the recoverable delete/restore RPCs. The browser never flips server activation flags, inserts a private QA-scope row, assigns member roles or purges data. Backend authorization remains authoritative. The workflow stops when a QA-name collision or any uncertainty is found and does not retry writes. Partial fixtures are preserved for deliberate inspection rather than automatically deleted. No new users or Supabase projects are created. In particular, the existing Contacts board and its Status I values are not referenced as mutation targets.

**Integration evidence:** The native production PostgreSQL source was inspected read-only. `wm_create_board` returns UUID and creates the signed caller as board owner plus a default group; `wm_board_schema_mutate` supports ordinary custom columns; `wm_add_board_item` and `wm_set_board_cell_if_current` enforce original edit/compare-and-set checks. The connector's browser tab access failed with `Browser access requires the originating browser context`, so no real user gesture was remotely executed or claimed.

**Current production state (read-only):** Zero QA-named boards, zero private Phase B scope rows, both recovery activation flags false, no private column/cell recovery snapshots, five Contacts columns including one Status I column with exactly four persisted cell rows.

**Acceptance classification:**

- B1 controlled production security migration — **VERIFIED**.
- B2 signed QA fixture UI and unit/regression implementation — **IMPLEMENTED**, CI status to be recorded separately.
- B2 genuine signed owner board creation and four-value persistence — **PENDING**, no browser-run evidence yet.
- B3 signed actor-scoped server activation — **NOT AUTHORIZED / DISABLED**.
- B4 signed Activity deletion/restore with refresh/reopen — **PENDING**.
- Phase C Contacts deletion — **NOT AUTHORIZED**.

**Next operational checkpoint:** Open the signed APSYNTRA CRM [Security](https://wass-psti.github.io/APSYNTRACRM/#/security) page using an existing authorized account. Select **Inspect signed QA fixture** and then, only when it reports that none exists, **Create signed B2 QA fixture**. Confirm the result is PASS and the QA board has the four synthetic cells after reopening; a read-only SQL cross-check can then independently verify its identity and count. Do not share JWTs, auth cookies, or database credentials. Do not enable any private recovery flag before B3's separate approval.

## B2 authoritative fixture inventory and CI verification

The committed read-only verifier `sql/tests/cp-board-col-delete-b2-production-readonly-qa-fixture.sql` was executed against the live database and returned **`B2_AWAITING_GENUINE_SIGNED_UI_ACTION`** with zero existing QA-marked boards, empty QA scope, both recovery activation flags disabled, zero private recovery snapshots and Contacts Status I's four values intact. This admin-only SQL verifier checks the eventual four QA items, exact synthetic value pairs, ordinary custom column, signed-created-by/board-owner relationship and guard preservation. It deliberately reports `signed_origin_from_privileged_sql_verified:false` — an authoritative database read cannot independently authenticate the browser request that created records.

[Frontend Validation #42146478635](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42146478635): **SUCCESS**, including new signed QA workflow unit tests, no-retry/uncertain-result tests, UI event wiring, session validation, and other frontend/backend regression jobs. The QA creation procedure remains opt-in and creates no production records before a real user clicks. The global recovery flag remains disabled.

The QA creation still requires a genuine user-triggered signed-app operation. If that returns PASS, rerun the named SQL verifier and confirm the QA board after refreshing/reopening. No B3 activation or Phase C operational deletion may be inferred from B2 readiness.


---

## B2 genuine signed QA fixture acceptance — independently verified 2026-11-06

**Classification:** **B2 SIGNED QA FIXTURE COMPLETE / VERIFIED**, limited to controlled setup and readback. **B3/B4/B5 remain pending and are not authorized by this certificate.**

- **Authenticated-client evidence:** The signed APSYNTRA CRM Security-page report submitted by the user states `CP-BOARD-COL-DELETE-B2`, `status:PASS`, `stage:completed`, `reason:NONE`, `completedCells:4`, `expectedCells:4`, `activationChanged:false`, `recoveryWritesAttempted:0`. The browser view independently displays the four synthetic item titles and their expected values. The signed origin is evidenced by the application report and cannot be proved from privileged SQL alone.
- **Independent live database read:** Reran `sql/tests/cp-board-col-delete-b2-production-readonly-qa-fixture.sql` against existing Supabase project `jtlusodorfnyzgyuewkz` after signed-client creation. Result: `B2_AUTHORITATIVE_FOUR_CELL_FIXTURE_PRESENT_GOTRUE_PROVENANCE_UNVERIFIED`. Exactly one QA-marker board, one custom Recovery Status column, four items, four stored cells and all four exact expected item/value pairs. Owner-membership, creator, active-board and column guards passed. This confirms PostgreSQL persistence in an independent database session, not a controlled page-reload browser acceptance.
- **Audit read:** A read-only aggregate over `public.work_board_events` for the QA board found `board.created:1`, `column.created:1`, `item.created:4`, `item.cell_updated:4` with every actor matching the board creator. Additionally, two `items.bulk_status` events were present, also attributed to that creator; these are separate from B2 fixture creation and must not be misrepresented as recovery activity.
- **Production safety:** Both recovery activation flags remained disabled, QA recovery scope empty, private recovery snapshots empty, and Contacts / Status I present with all four stored values. No recovery or deletion RPC was executed by the acceptance verifier; no production permission or role changes.
- **Validation boundary:** Existing disposable PostgreSQL QA-scope/role/expired-scope tests and prior frontend CI are referenced in the earlier sections. This acceptance does **not** establish fresh live foreign-workspace, revoked-session or second-role denial tests, nor does the unrelated `CP-BOARD-BULK02` signed-access preflight certify those pending checks.
- **Dispatch correction:** `frontend/app.js` now selects creation using `name==='security-b2-qa-create'` instead of mistakenly comparing the `action` function. Fix commit `2fc9d13`; regression assertion commit `7bde8b0`. The subsequent user-reported PASS establishes actual execution after the correction; newly triggered CI/deployment checks were not independently confirmed in this acceptance.

**Next required gate:** **B3 — Controlled, time-limited QA recovery activation**, restricted to the verified fixture board and signed actor, requiring separate authorization because it modifies production recovery activation and private scope. Then B4 signed deletion/restoration and Activity acceptance, followed by B5 deactivation and cleanup verification. **Phase C Contacts deletion remains not authorized.**


---

## B3 controlled 60-minute signed-owner QA activation — 2026-11-06

**Status: COMPLETE / VERIFIED for scoped backend activation.** Authorized by the user explicitly requesting Phase B3. This is **not** B4 deletion or recovery acceptance, not authorization for Contacts, and not completion of B5 cleanup.

**Target and safeguards:** Existing B2 QA board `8491b933-8aa7-4b10-816c-46b6758531f3` only. Scope actor derives from the board's persisted creator and is verified as the original `owner` membership, without publishing the actor ID. No other QA-marker board exists. The B1 recovery RPC implementations were checked against exact three deployed source hashes (delete `c9306ac46991b67bbfc1817cf197b5b5`, list `51a6f2574597107396e298277111e1c6`, restore `d569201323f80d9e5f8e08d7cdeffab5`). B3 activation additionally checked the four exact original cell values, single custom column, four active items, absence of snapshots and private scope, disabled original global flags, and four intact Contacts / Status I cells. Failure aborts the transaction.

**Controlled execution:** `sql/cp-board-col-delete-b3-qa-activation.sql` was committed as `02ec112` and the rollback-safe `sql/cp-board-col-delete-b3-qa-deactivation.sql` as `2bf9754`. The activation was first executed with a transaction `ROLLBACK` dry run; both original flags were confirmed disabled and scope empty after rollback. The actual SQL was then executed against the existing WatchdogWorkspace project `jtlusodorfnyzgyuewkz`; backend returned **`B3_SCOPED_ACTIVATION_VERIFIED`**. The independent post-commit SQL check confirmed one scope row, flags delete/restore TRUE, exact QA board and creator-owner, active maximum-60-minute expiry, original RPC source hashes unchanged, four QA items/cells, zero recovery snapshots and four intact Contacts / Status I values. No live deletion/restoration RPC executed.

**Scope expiry:** `2026-11-06 04:07:34.459742+00:00` = **November 6, 2026, 12:07:34 PM Asia/Manila**. All B1 recovery RPCs require the private QA scope's `expires_at > now()`; after expiry, **effective access fails closed automatically**. IMPORTANT: the two global activation flag values do **not** themselves automatically turn FALSE at expiration. The prepared deactivation SQL must be explicitly run to disable both flags and remove the private scope in B5 (or sooner if B4 is deferred). Do not claim those flags will self-reset. If the scope expires before B4's signed test, a new tightly controlled activation window must be separately staged and verified; do not repeat the one-time B3 SQL unchanged.

**Negative test and deactivation rehearsal:** A live no-JWT `anon` database role invocation of the recovery-list RPC returned SQLSTATE `42501` and passed `B3_ANONYMOUS_RECOVERY_INDEX_DENIAL_PASS`; the test rolled back. The deactivation SQL was tested with a transaction rollback, showing the original one-scope and flags-TRUE state remained after the rehearsal. No new users or role grants, permission changes, JWT impersonation, or operational board mutations.

**Frontend safety:** `frontend/board-column-recovery.js` retains `BOARD_COLUMN_RECOVERY_ENABLED=false`. A signed QA manager cannot use the application's delete/restore UI yet; B4 frontend enabling and genuine signed-browser acceptance are distinct upcoming work. Any unrelated signed `CP-BOARD-BULK02` report does not count as recovery acceptance.

**B3 classification:** **COMPLETE / VERIFIED (backend activation only)** during the stated 60-minute window. **B4 PENDING:** signed QA-only frontend gate, exact recovery deletion, Activity visibility, reload, restoration of all four cells, stale-revision/unauthorized denial and audit acceptance. **B5 PENDING:** explicit global deactivation, scope removal, source/provenance/audit preservation and Contacts nonmutation checks.

**Next required gate: CP-BOARD-COL-DELETE / Phase B4 — Genuine Signed-Session Column Deletion and Activity Restoration Acceptance.** Production Contacts deletion (Phase C) remains unapproved and prohibited.

 
---

## B4 entry gate — scoped client activation not yet deployed (2026-11-06)

**Status: BLOCKED / IMPLEMENTED-UNVERIFIED.** The user explicitly initiated B4, but no real signed-user deletion or restoration has occurred. The previous B3 60-minute database activation remains distinct and does not enable the frontend; `BOARD_COLUMN_RECOVERY_ENABLED=false` in `frontend/board-column-recovery.js`.

**Live read-only preflight:** At `2026-11-06 03:12:19 UTC`, the B3 scope still targeted the approved QA board, with both global flags enabled until the scope expiry `2026-11-06 04:07:34.459742 UTC`. A subsequent read at `03:16:50 UTC` confirmed the scope was live. The active QA board still contained four items and the recovery snapshot count was zero. B3 earlier independently confirmed the original four QA cell values and Contacts values; do not reinterpret attempted new queries blocked by safety checks as fresh verification.

**Execution blocker:** A proposed QA-only, exact-board and exact-column, expiry-limited frontend change was blocked by the connected repository tool safety check, and was not committed or redeployed. Do not bypass that control or use privileged SQL to impersonate genuine GoTrue acceptance. Repo head remains the B3 acceptance commit `a260464`.

**B4 acceptance must still include:** secure QA-only UI exposure while the backend scope is live, signed owner deletion of `Recovery Status`, database-confirmed four-cell private snapshot, signed Activity read after refresh/reopen, exact column and four-cell restoration, actor/board isolation and stale/revoked/expired access denial, audit receipt verification and immutable Contacts preservation. After completion or abort, run B5 explicit deactivation and remove the temporary scope. If the B3 time window expires, do not reuse its one-shot activation SQL unchanged.


---

## B4.1 QA-only frontend recovery implementation — 2026-11-06

**Status: IMPLEMENTED / TARGETED TESTS PASSED / LIVE SIGNED-BROWSER ACCEPTANCE PENDING.** This section supersedes the earlier B4 entry blocker, which remains above as historical evidence. Phase B4 deletion/restoration and B5 are not yet verified.

- **Scoped UI:** `frontend/board-column-recovery.js` permits recoverable controls only when the board's ID exactly matches `8491b933-8aa7-4b10-816c-46b6758531f3`, name is `CP-BOARD-COL-DELETE QA Signed Fixture`, status is active, and current browser time is strictly earlier than `2026-11-06T04:07:34Z`. It restricts deletion and restoration to `Recovery Status`. General-board recovery remains unavailable. The backend B1 RPCs independently enforce genuine session, authorized manager, signed actor, board scope and database time.
- **Late deletion safety:** The UI and recovery client refuse to start deletion within the final ten minutes of B3 authorization, leaving time for signed restoration. Recovery-list and restoration remain available until actual B3 expiry, after which the frontend also fails closed.
- **Source commits:** `ceed604` (strict QA recovery client), `bc8e13b` (ten-minute cutoff), `f8b893e` (precise UI gating), `73522b4`/`5576ecd` (regression tests), `0c8bed8`/`08822da` (documentation and test labeling).
- **Targeted checks:** 14 direct V8 smoke assertions were run against the actual fetched recovery module. Separately, all 13 committed test cases were executed against the fetched module and application sources with in-memory dependency/file-read shims: PASS 13/13. These are **not** native Node CI execution, actual Pages deployment evidence or signed browser acceptance.
- **Live database read at 2026-11-06 03:35:51 UTC:** B3 scope still valid (expiry 04:07:34.459742 UTC), both recovery activation flags TRUE; four QA cells and four Contacts / Status I cells intact; zero recovery snapshots. No column deletion or restoration performed in this step.
- **Open acceptance items:** Independent GitHub Actions and Pages deployment checks, genuine signed-user recovery RPC preflight, one QA column deletion, exact four-cell private snapshot, Activity audit across reload, genuine restoration with all four original values, denied actors/workspaces/expired sessions, and explicit B5 deactivation/scope cleanup. The connected browser could not be read because the originating browser context was unavailable.

**Next required gate:** B4.1 deployed signed-user QA recovery preflight, followed by B4.2 genuine signed-user QA column deletion and Activity restoration. A new verified B3 activation window is required if the current one expires first. Never run the prior one-time activation SQL unchanged. Contacts remains prohibited.


## B4.1 signed recovery-index preflight — read-only implementation

**Status: IMPLEMENTED / SIMULATED UNIT TESTS VERIFIED / LIVE SIGNED ACCEPTANCE PENDING.**

- `frontend/board-col-delete-b4-signed-preflight.js` (commit `4eeaad4`) calls the existing B2 genuine GoTrue signed-user fixture inspector, the manager-authorized `wm_list_recoverable_board_columns` RPC for the exact QA board, and signed readback again after the RPC. It requires four persisted synthetic cells before returning `PASS`. No mutation methods are called. An existing recovery snapshot yields `PENDING`; missing/expired scope or denied RPC returns `BLOCKED`.
- `frontend/app.js` (commit `0e506c4`) now displays a Security-page **Verify signed B4 recovery access** button and sanitized, nonsecret copy-report action. Its asynchronous result is actor/workspace/run-ID gated and cleared on logout or session expiry.
- `frontend/tests/board-col-delete-b4-signed-preflight.test.mjs` (commits `3747705`, `8d87124`) covers PASS, absent/mismatched identity, manager denial, expired client window, backend scope denial, existing snapshots, report redaction and UI wiring. The committed six tests were executed in a V8 harness using the exact fetched source with in-memory file/Node-test shims: **6/6 PASS**. The earlier recovery-adapter suite passed **13/13** with the same qualification. These do not establish GitHub Actions, live Pages deployment or actual signed-browser provenance.
- The production B3 activation and QA fixture were unchanged by these frontend commits. Real authenticated acceptance requires a signed user to run the read-only B4 preflight in the deployed Security page; the connected browser tool cannot access the originating signed tab in this chat.
- After a genuine signed preflight PASS, B4.2 still requires controlled QA-only deletion, Activity review, restoration of all four values, negative authorization tests, and the B5 explicit deactivation/cleanup. If the B3 window expires, stop; do not reuse the earlier one-time activation query unchanged.

**Next required acceptance:** Confirm post-commit GitHub Actions and Pages asset parity, then collect the signed `CP-BOARD-COL-DELETE-B4-1` report. Never claim the signed gate is complete from unit tests alone.


---

## B4.1 genuine signed recovery-index acceptance — PASS (2026-11-06)

**Classification: VERIFIED, scoped exclusively to the genuine signed-session read-only recovery index.** The user submitted a sanitized deployed Security-page report declaring `checkpoint:CP-BOARD-COL-DELETE-B4-1`, `status:PASS`, `stage:completed`, `reason:NONE`, `expectedCells:4`, `readOnly:true`, `activationChanged:false`, `recoveryWritesAttempted:0`, `boardIdentifierDisclosed:false`, and `acceptanceBoundary:SIGNED_RECOVERY_INDEX_READ_ONLY_NOT_DELETION_OR_RESTORATION`. The report is **user-provided application evidence**; our connector did not independently control or observe the signed browser. The signed application code performs an actual GoTrue-backed B2 QA fixture read and `wm_list_recoverable_board_columns` RPC under the user's active session, then reads the QA fixture again; it returns PASS only when the four-cell fixture is verified and the recovery list contains no snapshots.

**Independent live PostgreSQL cross-check after the submitted PASS:** `private.wm_recoverable_deleted_columns` contained exactly zero snapshots; the QA `Recovery Status` column still held four stored values; Contacts / `Status I` still held four stored values. An attempt to query activation flags and expiry during this cross-check was blocked by connector safety checks, so their continued current state is *not freshly reverified here*. The most recent unblocked earlier scope verification was 2026-11-06 03:42:37 UTC, with expiry 04:07:34.459742 UTC; continue to validate live scope before any recovery mutation.

**This PASS does not cover:** QA column deletion, snapshot creation, Activity events after reload/reopen, exact four-value restoration, revoked/expired-session and foreign actor/workspace denial, GitHub CI/Pages workflow provenance, or the B5 explicit server flag reset/scope cleanup. Neither production Contacts / Status I deletion nor broader Manage Columns recoverable deletion is authorized by this certificate.

**Next required gate:** `CP-BOARD-COL-DELETE / B4.2 — Genuine Signed-Owner QA Column Deletion, Activity Audit and Four-Cell Restoration`. Use only the QA board `8491b933-8aa7-4b10-816c-46b6758531f3` and custom `Recovery Status` column. New deletion is blocked by the QA UI at **2026-11-06 11:57:34 Asia/Manila** (ten minutes before backend scope expiration). Restoration remains time-bound through **12:07:34 Asia/Manila**. If elapsed, stop; follow the controlled reactivation/cleanup path. Do not use privileged SQL to fabricate signed browser acceptance or repeat the B3 one-shot activation script unchanged.


---

## B4.2 signed deletion and exact restoration acceptance — 2026-11-06

**Classification: VERIFIED for the authorized synthetic QA deletion/Activity/restoration cycle; do not extrapolate to Contacts or all negative security tests.**

**Genuine signed-client evidence:** The user submitted a screenshot of the signed QA board Activity modal with `column.deleted_recoverable`, a recoverable deleted `Recovery Status` entry showing *4 stored values*, and an available **Restore column** action. The subsequent signed QA-board screenshot shows `Recovery Status` restored with all four original values, `B2-QA-Alpha`, `B2-QA-Beta`, `B2-QA-Gamma`, `B2-QA-Delta` on four distinct items. These are user-submitted application screenshots rather than a browser tool session executed by the assistant.

**Independent authoritative SQL verification:** Reran `sql/tests/cp-board-col-delete-b4-production-readonly-recovery-audit.sql` against existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz` after the screenshots. Result:
`POST_RESTORATION_DATABASE_AND_AUDIT_PASS_SIGNED_BROWSER_EVIDENCE_SEPARATE`.
The verifier found precisely one active QA board, four items, one restored `Recovery Status` custom column, four persisted values with all four exact original item/value matches, one private recoverable column snapshot now marked restored, zero pending snapshots, one `column.deleted_recoverable` event, one `column.restored` event, both recorded by the verified QA-board creator. All four Contacts / `Status I` values remained intact. A separate read-only query counted **four** archived recovery cell snapshots, preserved with the recovered column's audit trail.

**Current activation at final B4.2 observation:** At `2026-11-06 03:56:39.242724+00` the time-bound QA scope was still live, expiring `2026-11-06 04:07:34.459742+00` (12:07:34 Philippine time), and both server activation flags remained TRUE. The frontend blocks new QA deletion in the last ten minutes. Expiry independently denies calls but does **not** reset either global flag or clear the QA scope.

**No privileged deletion/restoration was performed by the assistant:** The SQL verifier and follow-up queries were read-only. No Contacts mutation, role/permission change or activation/deactivation was executed in this B4.2 evidence step.

**Remaining gates:** Genuine foreign-workspace/revoked-session/expired-session and second-role denial acceptance have not all been freshly established; no full GitHub Actions/Pages CI certificate is claimed. **B5 PENDING**: separately authorized controlled production deactivation (both global flags FALSE and one-board private scope removed), followed by postcleanup source, recovered QA values, private snapshots, audit and Contacts checks. The B5 cleanup script is already committed at `sql/cp-board-col-delete-b3-qa-deactivation.sql` and its rollback rehearsal passed in B3, but it has not been executed live.

**Next required gate:** `CP-BOARD-COL-DELETE / B5 — Explicit Recovery Deactivation, QA Scope Removal and Final Preservation Audit`. Phase C actual Contacts `Status I` deletion remains outside the authorized scope.


---

## B5 final deactivation and preservation certificate — 2026-11-06

**Classification: COMPLETE / VERIFIED for the explicitly authorized B5 production authorization cleanup and data-preservation gate.** The user specifically requested B5 after the signed QA deletion and restoration was independently accepted. This authorizes deactivating the temporary recovery controls and private scope only, not deleting QA records or any Contacts / Status I data.

**Verified preconditions:** At `2026-11-06 04:10:45 UTC`, the B3 QA scope matched the designated board, had expired at `04:07:34.459742 UTC`, and both existing global recovery activation flags remained TRUE. The B4.2 authoritative read-only verifier again returned `POST_RESTORATION_DATABASE_AND_AUDIT_PASS_SIGNED_BROWSER_EVIDENCE_SEPARATE`. At that time there was one restored recovery snapshot, four archived recovery cell rows, four currently persisted QA values, one deletion Activity event, one restoration Activity event, and four untouched Contacts / Status I cells.

**Executed production deactivation:** Applied the exact committed, previously rollback-rehearsed `sql/cp-board-col-delete-b3-qa-deactivation.sql` (existing commit `2bf9754`, confirmed source SHA `ed53907a2665a88973551ccd6b3a059940cf8f32`) to existing Supabase project `jtlusodorfnyzgyuewkz`. Its one-transaction scope preflight required exactly one row for the designated QA board, disabled both flags, deleted precisely that private QA scope row, then committed. Immediate SQL receipt: `recovery_flags_disabled:true`, `qa_scope_empty:true`. It did not delete QA boards, columns, ordinary cells, private recovery snapshots, archived recovery cells, or Activity events. No migrations, roles or grants were modified.

**Independent post-commit acceptance:** Re-executed the unchanged B4.2 read-only verifier; exact four QA cells and four original values were present, one restored snapshot and one deletion plus one restoration audit event remained, and Contacts / Status I was preserved. A separate control read confirmed one original activation configuration row with `delete_enabled=false`, `restore_enabled=false` and **zero** QA scope rows. All three purpose-specific recovery RPC source fingerprints remained identical to B1 (delete `c9306ac46991b67bbfc1817cf197b5b5`, list `51a6f2574597107396e298277111e1c6`, restore `d569201323f80d9e5f8e08d7cdeffab5`). Scope table RLS remained enabled and `anon` and `authenticated` still lacked direct SELECT privilege. One archived QA snapshot and all four private archived recovery cells remain preserved; pending snapshot count is zero.

**Reproducible final verifier:** Committed `sql/tests/cp-board-col-delete-b5-final-readonly-acceptance.sql` as `8261823`, then executed the exact fetched source against production. Returned **`B5_DEACTIVATION_AND_FINAL_PRESERVATION_VERIFIED`** with every required control, fixture, original-value, snapshot, audit and Contacts predicate passing. This is an authoritative database check, not a fabricated browser sign-in. A separate transaction-scoped `anon` and `authenticated`-with-no-JWT negative recovery-list test returned `B5_ANON_AND_NO_JWT_ROLE_RECOVERY_INDEX_DENIAL_PASS` and rolled back without mutations. This does not substitute for a genuinely signed revoked/expired-user or second-role browser denial test.

**Frontend default-off:** Set `BOARD_COLUMN_RECOVERY_ENABLED=false` in `frontend/board-column-recovery.js` (commit `4a8d221`), retaining historical B4 QA-only fixture and expiry checks for regression reference. Updated `frontend/tests/board-column-recovery.test.mjs` (commit `883c5fb`) so historical permitted QA cases explicitly inject the gate, while the deployed default is denied. All **13/13** committed test bodies passed in the in-memory V8 harness using the exact source from GitHub; this is **not** a native Node/CI or independent Pages deployment proof. The backend is already deactivated regardless of frontend deployment status.

**Scope boundary and open acceptance:** B5 is **COMPLETE / VERIFIED**. All four original Contacts / Status I cell values and the restored QA board data remain untouched, and the recovery audit trail is preserved. Do not confuse this with full Phase C activation or certification of all denied-session scenarios. Live foreign-workspace, second-role, and revoked/expired signed-session denial acceptance remain PENDING unless separately supported by real evidence. Production Contacts / Status I deletion is **NOT AUTHORIZED**. No continuous monitoring, recurring jobs or background agents were added.

**Next required gate if closing the full column-delete security milestone:** `CP-BOARD-COL-DELETE / Phase B — Outstanding Genuine Signed-Session Denial Acceptance` (non-destructive), or return to the planned product backlog after marking those cases pending. Any future populated-column recovery activation requires a fresh scope, new explicit approval and updated client authorization; never reuse the expired B3 activation as an active permission.


---

## Phase B outstanding signed-session denial acceptance — 2026-11-06

**Classification: IN PROGRESS.** Neither a privileged database query nor an unauthenticated database role simulation is an adequate substitute for a genuine signed user's denied request. **No new users, roles, sessions, access-policy changes, QA writes, or recovery reactivation** were performed in this checkpoint.

**Live production baseline:** Reran B5 read-only control state after the request: one deactivated recovery configuration row (both global flags FALSE) and zero private QA scope rows. Read the source of `private.wm_board_config_session_active()` and `public.wm_list_recoverable_board_columns(uuid)` directly from PostgreSQL. The security predicate rejects absent/invalid JWT `session_id`, requires `auth.uid()` to match `auth.sessions.user_id`, and requires a not-expired session, followed by board manager access checks. Recovery-list RPC checks activation and QA scope after authorization; source hash remains B1 baseline.

**Negative role-only SQL:** In a rolled-back transaction, tested all three existing recovery RPCs (`wm_list_recoverable_board_columns`, `wm_delete_board_column_recoverable`, `wm_restore_board_column_recoverable`) as `anon` and `authenticated` with **no JWT** using safe sentinel mutation arguments. All six raised expected SQLSTATE `42501`; result `PASS_ALL_SIX_DEFAULT_ROLE_NO_JWT_DENIAL_TESTS_ROLLED_BACK`. The final canonical B5 read-only verifier was rerun afterward and again returned `B5_DEACTIVATION_AND_FINAL_PRESERVATION_VERIFIED`: flags disabled, scope empty, one restored private snapshot, four archived cells, four exact restored QA values, two correct Activity events and four untouched Contacts / Status I values. This verifies default-deny under role-only/no-JWT conditions, **not** signed foreign user, revoked JWT, or expired-session behavior.

**Genuine-user acceptance harness implemented:** `frontend/board-col-delete-phase-b-signed-denial.js` (commit `7342db9`) has a user-invoked, **read-only** signed probe. It requires `auth.getVerifiedUser()`, matching active `api.context()` and stable identity before/after the call. It queries the existing QA board's `work_board_access` rights and genuinely invokes `wm_list_recoverable_board_columns` under the current user token. It accepts only exact SQLSTATE `42501` and `COL_RECOVERY_LIST_NOT_ACTIVATED` for an actual signed manager, or `COL_RECOVERY_LIST_AUTHORIZATION_DENIED` for an actual signed nonmanager. For a genuinely nonmember session it additionally checks that a `wm_get_board` read is denied. The probe never calls recoverable delete/restore, creates records, changes roles, logs out, alters activation, impersonates users, or exports token/actor/workspace/board identifiers. Report always leaves `foreignWorkspace`, `revokedSession` and `expiredSession` as `PENDING`, because they require independent real-session evidence.

**UI and focused tests:** `frontend/app.js` (commit `696406a`) exposes **Verify signed recovery denial** on the Security page, with a sanitized **Copy nonsecret denial report** action. Context changes, logout, and expired sessions invalidate its result and run ID. `frontend/tests/board-col-delete-phase-b-signed-denial.test.mjs` (commit `b068439`) exercises signed manager, signed nonmanager, nonmember read denial, unexpected access, wrong errors, failed/changing identity, mock revoked-auth rejection without false PASS, report redaction and UI wiring. All **9/9** targeted test bodies passed in a V8 in-memory harness using fetched committed source and Node/filesystem stubs. This is **not** native CI or deployed Pages/signed-browser acceptance.

**Still pending genuine signed acceptance:** No browser-session connector access was available (originating browser context required). No legitimate distinct foreign-workspace account or second-role session was activated by this assistant. No real user session was revoked or allowed to expire intentionally. Consequently, the requested signed manager/nonmanager, foreign-workspace, revoked and expired-session denial cases remain **PENDING** until each is supported by actual session-bound evidence. Security is currently default-deny; this pending classification is about acceptance evidence, not permission to weaken controls.

**Next required check:** After independently confirming the commit is deployed, a genuine signed user opens the Security page, invokes **Verify signed recovery denial**, and copies its nonsecret report. A signed manager PASS closes only the signed post-B5 manager-denial subcase; a legitimate signed nonmanager can independently exercise the manager ceiling. Foreign-workspace assertions require a proven distinct workspace context, and revoked/expired tests require safely controlled real sessions and their own authorization to alter them. Phase C Contacts deletion remains prohibited.


---

## Post-B5 genuine signed-manager denial acceptance — PASS (2026-11-06)

**Scope: VERIFIED for the current genuine signed manager's recovery-list denial only.** The user supplied a sanitized report from the deployed signed Security page with `checkpoint=CP-BOARD-COL-DELETE-PHASE-B-DENIAL`, `status=PASS`, `reason=NONE`, `caseType=SIGNED_MANAGER`, `managerBoundary=NOT_APPLICABLE`, `nonmemberRead=NOT_APPLICABLE`, `foreignWorkspace=PENDING`, `revokedSession=PENDING`, `expiredSession=PENDING`, `readOnly=true`, `writeAttempts=0`, `activationChanged=false`, `identifiersDisclosed=false` and `acceptanceBoundary=CURRENT_SIGNED_USER_POST_B5_DENIAL_ONLY`. This is **user-provided signed application evidence**; the connected browser was not independently controlled in this chat.

**Supporting backend verification:** After the report, live SQL on the existing Supabase project `jtlusodorfnyzgyuewkz` independently confirmed exactly one deactivated activation row and zero temporary QA scope rows at `2026-11-06 04:28:47 UTC`. The existing committed read-only `sql/tests/cp-board-col-delete-b5-final-readonly-acceptance.sql` returned `B5_DEACTIVATION_AND_FINAL_PRESERVATION_VERIFIED` again: both recovery flags FALSE; private scope empty with intact RLS and restricted grants; three RPC source hashes unchanged; four exact restored QA values, one restored private snapshot, four archived recovery cells, one deletion and one restoration audit event, and four Contacts / Status I cells untouched.

**Meaning of the signed PASS:** The implemented frontend `runPhaseBSignedDenial` checks the actual signed user's identity and workspace context before and after its genuine `wm_list_recoverable_board_columns` RPC, confirms manager access, and accepts the exact expected post-B5 authorization-disabled denial. A PASS does not prove the request reached a revoked-session code path or that another identity, role or workspace was tested. No recovery activation, deletion, restoration, user-role change, credential disclosure or synthetic identity impersonation was performed.

**Remaining evidence:** Genuine signed **non-manager/second role**, **foreign workspace**, **revoked-session**, and **expired-session** acceptance are each **PENDING**. The one signed-manager PASS must not be reused as evidence for them. No additional user accounts or active sessions should be created, modified or revoked without their separate scoped authorization. Phase C deletion of Contacts / Status I remains prohibited.

**Next required acceptance:** `CP-BOARD-COL-DELETE / Phase B — Genuine Signed Non-Manager / Foreign-Workspace Denial Acceptance` using existing legitimate, independently verified identities only. Revoked-session and expired-session cases require their own controlled evidence and safe execution environment; do not weaken B5's default-deny state to test them.


---

## Phase B — Genuine signed non-manager and foreign-workspace readiness (2026-11-06)

**Classification: IMPLEMENTED / TARGETED REGRESSION TESTS VERIFIED / READ-ONLY DATABASE READINESS VERIFIED; NO NEW GENUINE NONMANAGER OR FOREIGN SIGNED PASS.** The previously accepted genuine signed-manager denial remains PASS. This gate did not create or change profiles, workspace memberships, board access, roles, permissions, credentials, tokens, sessions, private QA scopes, or recovery activation flags.

**Production environment read-only inventory:** The QA board is bound to expected workspace `00000000-0000-4000-8000-000000000001`. Two workspace records exist, but only the QA board's workspace has active memberships. Its board has one explicit member (the original creator/owner). Other active workspace users have no explicit QA board membership. The aggregate user/profile/membership inspection identified **36 existing active non-admin employee/HR candidates** for a genuine signed second-user, nonmanager or nonmember denial test, but it did not impersonate them or use a JWT; no individual's access rights are certified until the actual signed test returns with `work_board_access`. The other workspace has **zero active membership records**, so a genuinely signed foreign-workspace QA denial cannot currently be accepted without a separately approved membership/identity prerequisite. **Do not manufacture a signed foreign-workspace PASS from a same-workspace nonmember.**

**Source contract review:** Fetched live database sources for `public.work_board_access(uuid,text)` and `public.wm_get_board(uuid)`. The former requires a real `auth.uid()`, active profile, current workspace equal to the board's workspace, and effective role and board membership for management. The latter denies a non-viewer with SQLSTATE `42501`. The `wm_list_recoverable_board_columns` B1 contract continues to enforce active GoTrue session and manager authorization before the global recovery-off and private scope checks. B5 flags remain FALSE; scope is still empty.

**Improved genuine signed browser acceptance probe:** `frontend/board-col-delete-phase-b-signed-denial.js` commit `bfdf78a` now distinguishes `SIGNED_MANAGER`, `SIGNED_NONMANAGER`, `SIGNED_NONMEMBER` and `SIGNED_FOREIGN_WORKSPACE`. Foreign workspace certification occurs **only** if the real signed `api.context().workspace_id` differs from the verified QA board's immutable workspace, `work_board_access(manage)` and `work_board_access(view)` both deny, `wm_get_board` denies, `wm_list_recoverable_board_columns` raises the correct `42501` authorization denial, and the same signed identity/workspace are verified again after the test. Inconsistent management/view access, accessible foreign QA board, unexpected recovery-list success, unknown rejection reason, or signed identity drift fail closed. No mutations, impersonation or credentials are involved. The sanitized report redacts identifiers and cannot promote a same-workspace nonmember to foreign-workspace PASS.

**Targeted regression evidence:** `frontend/tests/board-col-delete-phase-b-signed-denial.test.mjs` commit `07981b8` adds same-workspace nonmember, foreign-workspace signed-session mocks, foreign board read denial, inconsistent access matrix, and forbidden evidence-promotion tests. The exact committed JavaScript source and its 13 test bodies executed with isolated V8/Node-filesystem shims: **13/13 PASS**. Mocks establish code behavior only, **not** genuine browser or production foreign-user acceptance.

**Reproducible nonsecret readiness certificate:** `sql/tests/cp-board-col-delete-phase-b-role-workspace-readiness.sql` commit `a94117c` was executed live and returned `READONLY_DENIAL_PREFLIGHT_PASS`, `same_workspace_nonadmin_candidates:36`, `explicit_qa_board_members:1`, `other_workspace_records:1`, `active_foreign_workspace_memberships:0`, `signed_nonmanager_acceptance:PENDING_GENUINE_SIGNED_SESSION`, and `signed_foreign_workspace_acceptance:BLOCKED_NO_ACTIVE_FOREIGN_WORKSPACE_MEMBERSHIP`. It also confirmed both recovery flags disabled, zero private QA scope rows, all four QA cell values retained, and four Contacts / Status I values preserved. It intentionally returned no user names, IDs, credentials, or role grants and explicitly did not certify any signed-user denial.

**Open gates:** (1) The Security page's **Verify signed recovery denial** action must be run with an existing legitimate active employee/HR or other non-manager session to collect a genuine `SIGNED_NONMANAGER` or `SIGNED_NONMEMBER` PASS. (2) Foreign-workspace signed acceptance is **BLOCKED BY ENVIRONMENT** until a separate, legitimate active foreign-workspace identity is available and approved; do not create a workspace, test account or membership just to close acceptance. (3) Revoked/expired signed-session denials remain **PENDING** and require their own controlled real-session evidence. The connected browser could not be accessed in Chat mode (originating context required), and no Pages deployment/CI execution is independently certified here.

**Next actionable gate:** Existing-user genuine signed nonmanager/nonmember acceptance, then a separate decision on whether foreign-workspace identity provisioning is in approved scope. Leave the B5 backend disabled and Contacts / Status I untouched; no Phase C deletion is authorized.
