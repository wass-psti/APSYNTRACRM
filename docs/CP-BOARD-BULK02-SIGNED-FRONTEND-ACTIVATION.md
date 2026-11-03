# CP-BOARD-BULK02 — Signed-session scoped frontend activation

**Release status:** per-session conditional activation is implemented, pending GitHub validation and real signed-user execution. **Do not claim final operational acceptance without the actual in-browser report.**

## Production baseline

Project: existing WatchdogWorkspace Supabase `jtlusodorfnyzgyuewkz`. Migration `20261103052752_cp_board_bulk02_atomic_items_and_group_cas` has been applied and independently verified. The backend provides `wm_board_bulk_mutate(uuid,text,jsonb)` for atomic 1–50 item status/archive/restore with revision checks, and `wm_board_group_cas(uuid,uuid,timestamptz,text,text)` for audited group rename and empty-only deletion. Executable by `authenticated` only, `anon`/PUBLIC denied; revoked `wm_delete_board_group(uuid)` authentication grant remains denied. Both functions are SECURITY DEFINER with empty search path and explicit active GoTrue-session, board RBAC/workspace and protected-board guards. This release does not modify SQL or permissions.

## Session-scoped activation

- `BOARD_BULK02_ENABLED=false` remains the **static default** and creates a fail-closed client.
- On an ordinary, unprotected board, **Verify signed bulk access** uses the current genuine browser GoTrue session, with no token copying, credentials entry or mock identity.
- Read-only checks: signed user/workspace alignment, board visibility, server effective `edit` and `manage` decisions, authenticated bulk and CAS route authorization, protected application-board denial, and reverified identity.
- The RPC probes are **deliberately invalid** to ensure no production rows can be changed: a zero-length item batch, a null group revision for rename and delete, and a nonexistent-item request against a protected board. These yield SQLSTATE `22023` for a properly authorized nonmutating request and `42501` for expected denial.
- Only a complete PASS for an editor/manager of the current ordinary board unlocks `boardBulkClient.enabled` **in memory for that user, workspace and board**. A viewer can PASS expected denial tests without receiving write access. Group deletion is shown only for a verified manager.
- Context or board changes, sign-out and failed verification cause fail-closed state. The backend independently checks session and role on **every** mutation, including direct REST requests.
- A nonsecret report is visible and can be copied. It contains only check names, verdicts and generic details; it excludes tokens, employee GPS, user IDs and board IDs.
- Bulk mutation submission uses the single atomic RPC and existing 50-record limit, signed live board scope, per-record revisions and exact response receipts. No legacy item-write loop or cascading group delete.
- On TimeTracker Attendance, APSYNTRA QA and all application-managed boards, generic bulk status/archive and group deletion remain forbidden; existing GPS and operational attendance remain untouched.
- **Actual signed writes on a disposable user-created board are NOT performed automatically.** The acceptance control intentionally never modifies a production record, and successful read-only probes alone are **not proof** of real write persistence or audit acceptance.

## Acceptance gates

1. Existing production SQL/permission activation — VERIFIED.
2. Disposable PG17 status/archive/restore, concurrency CAS, RLS/RBAC/foreign/expired/revoked checks — VERIFIED in synthetic setup.
3. Source-integrated signed GoTrue read-only probe and per-session UI gates — IMPLEMENTED, CI PENDING.
4. Genuine signed browser user/admin/editor/viewer acceptance — PENDING until the actual in-app checks are run and their nonsecret reports reviewed.
5. Genuine create/update/stale-denial/archive/restore/group-CAS audit on an *approved disposable ordinary board*, plus independent role/foreign session tests — PENDING. Do not create accounts, boards or modify real records to satisfy the gate without separate authorization.
6. Full production acceptance including responsive UI and 12-board regressions — PENDING.

The connected browser tool could not access the originating signed browser context. This is not a failed security check; it means no real GoTrue proof can be claimed from automation in this conversation.

**Rollback:** In the event of a severe backend issue, use the existing reviewed `sql/cp-board-bulk02-fail-closed-rollback.sql` only after following the production incident/approval process. Do not restore the unsafe legacy cascading delete privilege.
