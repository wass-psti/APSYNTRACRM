# CP-BOARD-COL-DELETE — Phase B signed QA acceptance

**Date:** 2026-11-06  
**Status (2026-11-06):** **B1 COMPLETE / VERIFIED; B2 SIGNED QA FIXTURE COMPLETE / VERIFIED; B3–B5 NOT YET AUTHORIZED OR ACCEPTED.** Historical pre-fixture evidence is retained below. 

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
