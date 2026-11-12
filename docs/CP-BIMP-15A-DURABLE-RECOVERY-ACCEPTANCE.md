# CP-BIMP-15A — Durable Signed Import Recovery Completion

## Baseline and restrictions

Continuation of CP-BIMP-15 following PR #255 (unmerged). Actual code recovered on the user's authorized Mac from worktree `/private/tmp/apsyntra-cp-bimp-15-durable`. Branch: `feat/cp-bimp-15-durable-20261112`. Reuses existing m143-v1 atomic batch import, signed board context/role checks, review steps and m143-v2 *disposable candidate* capability. **No production database, credentials, roles, RLS, permission, session, or deployment changes.**

## Durable recovery behavior

- Each readback-verified completed batch may produce a **versioned local recovery marker** containing board ID, workspace ID, user ID, worksheet index, cumulative receipt counts, number of committed source rows, batch size, destination group, duplicate behavior and SHA-256 digests of the complete source worksheet, last-verified board and remaining import payload.
- **No source workbook, row values, attachment content, credentials, tokens, complete board snapshots, or full import plans are persisted in browser storage.** Only metadata/digests are persisted. The complete workbook must be reselected by the signed user after browser reload.
- Reopening the signed ordinary-board wizard discovers the recovery marker; reupload checks the exact worksheet digest, selects the persisted group, and requires a fresh review of the remaining mappings/duplicate behavior. Reconciliation verifies signed identity/workspace, current board content/state and the exact remaining server payload before submitting.
- Already committed rows are excluded from the resumed payload. Cumulative receipt counts are preserved across multiple restarts/recovery checkpoints; a successful full run clears the marker. Explicit discard permits a completely fresh import.
- If the response was uncertain (transport failure, invalid response, timeout), recovery is **not** offered automatically; the marker is cleared, and board reconciliation is required before another write. A definite rejection can still resume in-memory as in CP-BIMP-14.
- Board drift, changed source, changed options, changed mappings, changed user/workspace, unrecognized marker format or missing hashing capability all fail closed. No privileges or additional approval gates were added.

## Verification matrix

- In-memory signed API simulation with ordinary-board context: successful 500-row batch followed by definite 409, reload + reselect identical workbook, import remaining 501 rows only, verify exactly 1,001 persisted rows and correct cumulative receipt.
- Changed workbook, external board mutation without revision bump, different user/workspace, different worksheet, changed source mapping and missing cryptographic hashing: denied before another mutation.
- Recovery marker privacy: stored JSON contains neither item titles nor cell values; source/board/payload are represented only as SHA-256 digests.
- Full frontend regression: **1,823/1,823 PASS**; frontend JavaScript syntax: **171 modules PASS**; CSS bundle, Pages source validation and SEC14 source guard: PASS. Browser fixtures and isolated PostgreSQL signed claims are separately checked by CI. Newly staged extended-reference schema is **not** production-activated.

## Runtime acceptance boundary

The opened browser is authenticated to the *deployed production main frontend*, not the new CP-BIMP-15A worktree. It currently displays `CP-BOARD-COL-DELETE QA Signed Fixture`, an unrelated fixture. This tab is not a proper target for writes. Therefore a real browser upload + import + refresh against this new branch on a dedicated signed nonproduction board is **PENDING**, not verified. Disposable signed API simulations, real local Chromium DOM tests and CI cannot substitute for live authenticated end-to-end acceptance.

## Remaining prerequisites

1. Deploy the reviewed frontend to an authorized **nonproduction** host using existing release policy and provide a dedicated ordinary QA board with a genuine signed session, then complete CSV and XLSX write/refresh/reopen reconciliation.
2. Extended-reference m143-v2 is a **staged SQL candidate**. Actual persistent storage activation is a material production schema change and requires separate approval; no migration executed in this checkpoint.
3. Recovery markers do not make unknown/uncertain transaction outcomes safe to retry. Reconcile those server-side before another import.
