# CP-BOARD-CONFIG01 — Second-gate security remediation (staged v2)

**Status:** IMPLEMENTED-UNVERIFIED until disposable CI passes; **NOT APPROVED for production**. Prepared by the implementation assistant, not a qualified independent reviewer. No production SQL has been executed.

## Supersession and exact contracts

- New *single-transaction* candidate: `sql/cp-board-config01-staged-authorization-v2.sql`.
- New **compensating**, fail-closed/data-preserving rollback: `sql/cp-board-config01-compensating-rollback-v2.sql`.
- The previous `sql/cp-board-config01-staged-authorization.sql` and `sql/cp-board-config01-guarded-rollback.sql` are **disabled by an unconditional SQL exception** at their beginning. Do not run archived versions.
- Candidate fails before any writes unless existing privileged production function definitions match exactly:
  - `wm_import_board_wizard_atomic`: `md5(pg_get_functiondef)` = `b6a4761ab2f872a723f26fd34848c299`
  - `wm_set_board_status_labels`: `md5(pg_get_functiondef)` = `d5e7d49c4613133d3ad6b1d14e5826c5`.
- These are *source-version fingerprints*, not cryptographic security proofs. A different live MD5 requires re-review and a new candidate, not a workaround.
- A private `private.wm_board_config_session_active()` SECURITY DEFINER helper validates GoTrue JWT `session_id` against `auth.sessions` user ownership and `not_after`. Public, anon and authenticated cannot call the private helper directly; the three new board configuration RPCs call it inside their server-side authorization predicates. Genuine live GoTrue signed-HTTP acceptance remains pending.

## Changes to security boundary

**SEC-01 — wizard schema bypass:** Existing `wm_import_board_wizard_atomic` is preserved from its actual live function definition and amended to require **manage** and a valid live GoTrue session when `newColumns` is nonempty. Its original **edit** authorization remains for imports that only create/update items, preserving the intended separate item-management boundary. This is a privileged function replacement, so exact source/diff, downstream imports and concurrent manager/editor denial require independent review.

**SEC-02 — destructive status-label edits:** The existing `wm_set_board_status_labels` is patched from its actual live definition to require **manage** and a live session. It rejects removal of labels still referenced by item status or stored cell values with `23503` rather than deleting any cells or clearing item statuses. The function serializes on the board and column rows. Legacy value-clearing semantics are intentionally retired and must be reviewed with consuming applications. Existing entity values are preserved.

**SEC-03 — data-preserving recovery:** The v2 rollback **does not drop** the settings table or saved records, regrant the seven unsafe editor column-writer RPCs, or restore weaker privileged function definitions. Instead it revokes authenticated/anon/PUBLIC EXECUTE on the new configuration **write** RPCs and preserves the authorized read RPC. The hardened manager-only wizard/status paths remain in place. This is an operational fail-closed compensating rollback, not a full reverse migration; the reviewer must explicitly accept that tradeoff and verify emergency use after live data is populated.

**SEC-04 — session scope:** New read/write RPCs validate genuine GoTrue sessions. Wizard column creation and status-label editing now also validate live sessions; item-only wizard imports retain their legacy token acceptance, pending separately scoped regression review. This is **not a global server-side revocation change**, and it does not certify legacy RPC coverage.

**SEC-06 — field-level display settings:** The v2 settings writer now rejects per-column label overrides on all application-owned `col_*` and `system_key` columns, even for board managers, until server-side typed-domain allowlists have been approved. Primary **Record** display name and safe custom-column labels remain configurable. Domain labels are intentionally unsupported in v2 rather than trusting frontend filtering for sensitive fields.

The seven legacy direct column-writer RPCs remain retired for authenticated and anonymous users; status and wizard are also hardened. New board creation/duplication and ordinary item-write paths retain their separate capabilities, subject to real signed regression tests.

## Disposable acceptance

The dedicated PostgreSQL 17 workflow has been updated to load exact original live wizard/status function sources into a disposable fixture, execute the full candidate, run positive/denied tests, and execute v2 compensating rollback with saved settings left intact. The fixture tests operate on synthetic UUIDs and data only. It must not connect to the existing Supabase production data or mutate sessions there.

## Remaining mandatory gates

1. Run and pass revised disposable CI; review the diff against the two original function definitions and repair failures without relaxing authorization.
2. Obtain **independent external security review** for the final immutable candidate and rollback hashes, including concurrency and module dependencies, with explicit approval recorded in GitHub Issue #30.
3. Obtain **separate explicit production schema/function/permission-change authorization** naming the final hashes and WatchdogWorkspace project. No general standing approval substitutes for this.
4. Activate only within approved scope and recover safely on failure; execute real signed manager/editor/viewer/foreign-workspace/revoked/expired HTTPS tests, persistence after refresh and complete 12-board item/column regression.
5. Deliberately enable `BOARD_STRUCTURE_ADMIN_ENABLED` only after all gates pass. Until then the existing production backend and UI behavior remain unchanged.

**Production decision: NO-GO.**
