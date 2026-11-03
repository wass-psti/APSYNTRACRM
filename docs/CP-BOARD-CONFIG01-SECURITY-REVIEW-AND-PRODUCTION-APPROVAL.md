# CP-BOARD-CONFIG01 — Independent Security/Dependency Review & Production Authorization Gate

**Recorded:** 2026-11-03. **Release decision:** **NO-GO**. **Document author:** implementation assistant performing technical triage, **not** a qualified independent reviewer. **Production SQL executed:** none (SELECT-only audit).

**Repository baseline:** `main` at `c2c488d32850072ed257eed2c6d45a236a45905b`.

**Staged candidate:** `sql/cp-board-config01-staged-authorization.sql`, Git blob `3438bb176dd374cb332dc290dbe75fbf592637b1`. **Staged guarded rollback:** `sql/cp-board-config01-guarded-rollback.sql`, Git blob `51ba83205c441ff23b72b71ffedc53fc9074be2b`. These exact hashes must be re-frozen whenever code changes. The preceding isolated CI does **not** constitute independent security approval.

**Single production project:** existing WatchdogWorkspace, Supabase ref `jtlusodorfnyzgyuewkz`; **no staging Supabase project requested or authorized**.

## 1. Read-only live inventory (fresh evidence)

- New `public.wm_board_ui_settings` table **absent**; `wm_board_ui_read(uuid)`, `wm_board_ui_save(uuid,bigint,text,jsonb,jsonb)` and `wm_board_schema_mutate(...)` **absent**.
- **379** persisted board columns (of which **283** have `custom:` or `custom_` prefix, and **96** have `col_` prefix); **14,682** item-cell-value rows; TimeTracker Attendance board has **8** domain columns. These are production data, not test fixtures.
- Seven previously identified column-writing functions all use `SECURITY DEFINER`, are owned by `postgres`, are callable by `authenticated` and not callable by `anon`. Their functions have `SET search_path=public`, which should be reviewed in the broader hardening plan; the new candidate uses `search_path=''`.
- Additional exposed function paths discovered below. These are **not** covered by retiring seven direct function grants.
- Existing source lists both signed `wm_get_board_preferences`/`wm_set_board_preferences` (per-user display preferences) and `wm_set_board_view` (per-user table/kanban mode). The proposed `wm_board_ui_settings` is shared board configuration, a distinct owner-managed scope; assess integration and migration instead of replacing per-user preferences.
- Supabase advisor inventory was read without mutation. Its global security notices require separate risk triage; generic advisory counts must not be treated as evidence of a defect in this specific candidate.

## 2. Blocking security and compatibility findings

| ID | Severity | Verified finding | Required disposition |
| --- | --- | --- | --- |
| **SEC-01** | **HIGH / NO-GO** | `wm_import_board_wizard_atomic(uuid,timestamptz,jsonb)` is callable by `authenticated`, is `SECURITY DEFINER`, checks `work_board_access(...,'edit')`, and for nonempty `newColumns` calls `public.wm_add_board_column`. Revoking the legacy RPC from the signed caller does not prevent its execution **inside the privileged definer**. | Introduce a verified same-board `manage` permission check specifically for wizard-created columns, preserving item-only imports for editors. Test editor + `newColumns` denial, manager creation, and no collateral item-import regression. |
| **SEC-02** | **HIGH / DATA LOSS** | `wm_set_board_status_labels(uuid,jsonb,text)` remains callable by `authenticated`, checks only board `edit`, updates column configuration, and can `DELETE` existing `work_board_item_values` or clear item statuses when removing labels. This is structure modification and destructive data handling outside the seven-function retirement list. | Require effective `manage`, reject incompatible label removal for populated status fields unless a separately approved reversible migration exists, and prove existing record retention. Do not silently delete production values. |
| **SEC-03** | **HIGH / RECOVERY** | Guarded rollback refuses to drop saved settings once data exists. When empty, it re-grants the seven preexisting writer RPCs to `authenticated`, undoing the proposed structure boundary. | Independently approve a **fail-closed**, data-preserving recovery design; no unconditional regrant of unsafe writer privileges. Verify rollback with and without persisted settings in disposable PostgreSQL. |
| **SEC-04** | **HIGH / SESSION** | New configuration RPCs check `auth.uid()` and `work_board_access`, but contain no explicit GoTrue `session_id` versus `auth.sessions` revocation check. No real revoked/expired HTTPS tests of these not-yet-deployed RPCs exist. | Decide the strict session contract, implement a server-side guard if required, and pass genuine signed manager/editor/viewer, cross-workspace, revoked and expired session acceptance. Simulated JWT tests are insufficient. |
| **SEC-05** | **MEDIUM / DEPENDENCIES** | `wm_create_board_configured` creates initial schema for *new* boards; `wm_duplicate_board` copies existing schema/items; `wm_import_board_items_atomic` edits items. These are distinct from changing protected columns of an existing board. | Classify each separately and preserve valid board creation/duplication/item import. Review copies of preferences and any role/grant propagation; do not indiscriminately revoke all three. |
| **SEC-06** | **MEDIUM / DOMAIN** | On the server, `wm_board_ui_save` checks column IDs belong to a board but does not enforce the typed module field allowlist. The frontend filters fields, but direct RPC calls bypass browser filtering. | Validate server-side domain metadata/allowed display-label overrides; verify no restricted-field label edits or accidental exposure on all 12 boards. |
| **SEC-07** | **MEDIUM / COMPLETENESS** | Default value hydration, general dependency-aware type conversions, physical modification of application-owned `col_` fields, and 12-board live regression are deliberately incomplete. | Keep unsupported operations blocked; declare incremental scope instead of certifying full dynamic-column acceptance. |

Additional concurrency requirement: verify the candidate's board row lock, timestamp CAS and column row locks against simultaneous editors, new board wizard imports, status label changes, and background domain projections. A passing serial disposable test does not establish cross-endpoint locking.

## 3. External reviewer evidence & signoff

An independent reviewer must be **a different accountable person/authorized reviewer than the implementation author**, assigned in GitHub Issue #30 or a linked PR. Reviewer must explicitly state:
- Their GitHub account/name and independence, and the exact candidate/rollback git blob hashes reviewed.
- Separate disposition for **SEC-01 through SEC-07** with repro/failing-test and fix/retest evidence for blocking items.
- Confirmed server-side RBAC ceilings, workspace isolation, RLS, `SECURITY DEFINER` ownership, default PUBLIC EXECUTE grants, role-specific function grants, input/JSON validation, audit and data-loss invariants.
- Effects on the board import wizard, status-label editor, configured board creation/duplication, all 12 typed modules, per-user board preferences, and existing item workflows.
- Dry-run disposable PostgreSQL 17 verification of manager/edit/view/foreign, concurrency, rollback with persisted settings, denied API calls and sensitive display-label exclusions.
- One clear result: **APPROVED**, **CHANGES REQUESTED**, or **REJECTED**. Missing reviewer identity, approval or evidence is **PENDING**, not PASS.

**Current reviewer status: NOT ASSIGNED / NOT SIGNED OFF.** Technical self-triage in this document is not independent approval.

## 4. Separate production schema & permission-change authorization request — NOT YET GRANTED

Only after the reviewer explicitly **APPROVES** the revised, tested, hashed candidate and recovery plan, request a new, scoped authorization covering:

> I approve controlled production deployment of the independently reviewed **CP-BOARD-CONFIG01** migration, at the specifically identified immutable commit and SQL hashes, to the existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz`. This approval covers only the named `wm_board_ui_settings` table, approved `wm_board_ui_*` and `wm_board_schema_mutate` RPCs, the exact named revocations/hardening of legacy and indirect column-writing functions, and the reviewed recovery plan. Do not change production data, board memberships, roles, user accounts, unrelated policies, or dependent module records. Stop if preflight, compatibility, independent review, rollback or signed-session acceptance prerequisites fail.

**This text is an approval *request template*, not user approval.** Do not deploy based on an instruction to begin the next gate, generalized standing authorization, Issue comments, or a green CI check. A later explicit user approval must identify the finally reviewed SQL scope.

## 5. Sequence and go/no-go

1. **NOW:** Record findings, freeze hashes, request a qualified independent reviewer; preserve all current live privileges and backend.
2. **REVISE/STAGE:** Close SEC-01/02/03 and any related security issues; update disposable tests and verify signed application dependencies without production changes.
3. **REVIEW:** Obtain independently approved candidate, rollback and verified acceptance evidence.
4. **SEPARATE APPROVAL:** Request/receive explicit production permission and schema-change approval scoped to the final hashes, including rollback.
5. **CONTROLLED ACTIVATION:** Run matching read-only preflight and atomic migration only within that approved scope; stop on drift.
6. **REAL ACCEPTANCE:** Using authorized disposable signed test accounts/fixtures, verify signed role ceilings, cross-workspace denials, revocation/expiry, 12-board workflows and persistence after refresh/relogin, plus audit.
7. **FRONTEND ROLLOUT:** Deliberately enable `BOARD_STRUCTURE_ADMIN_ENABLED` only after all gates PASS; verify live Pages and regression. Rollback safely if any runtime invariant fails.

**Current decision: NO-GO.** `BOARD_STRUCTURE_ADMIN_ENABLED=false` and unchanged live SQL/roles/records remain the correct state.

Official Supabase function security reference: https://supabase.com/docs/guides/database/functions ; relevant advisor: https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable
