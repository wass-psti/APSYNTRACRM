# BS09 — Invite-only workspace admission and board-scoped People/Groups

**Based on:** latest `main` at BS08 branch creation.  
**Integration PR:** #225 (`feat/bs08-email-invites-main-20261111`).  
**Status:** guarded frontend and database candidate. **Not live**, no new Auth account, email, workspace membership or board grant has been created.

## Product interpretation of the November 11 requirements

1. **Workspace owner invites any eligible email.** There is no public self-service signup route. Pending email invitations are invitations only; an email is **not** an authenticated user or member merely because it was entered. The recipient becomes an active workspace member only after completing the approved Supabase Auth invitation, verified email, signed acceptance and workspace admission transaction.
2. **Workspace membership is not board authorization.** Ordinary employees/clients/partners cannot view unrelated boards simply because they can see the workspace. Board access must come from an exact-board direct grant, inherited explicitly approved workspace-group grant or a separately authorized override. Existing platform-admin bypasses must be documented/reviewed—not implicitly described as ordinary membership.
3. **Board managers select people or groups.** People means **existing active, verified workspace members** from a manager-authorized, board-scoped signed directory; Groups means named collections of existing workspace members. An individual or group is granted **Viewer** on a chosen board, subject to ceilings. Group membership changes and revocation must apply to subsequent authenticated reads.
4. **Apps are not automatically boards.** A TimeTracker board may back a standalone module whose RPCs, storage, exports and permissions differ from ordinary Work Management boards. Any application guest access requires an independent capability matrix. HR, Finance, Employee Evaluation, TimeTracker and sensitive modules remain private pending review.
5. **No public invite links.** Email delivery may contain a one-use verified-recipient token for account onboarding; sharing that URL does not bypass email matching, session verification or exact workspace scope.

### Correct end-user statuses

| State | Account created? | Workspace member? | Board access? |
| --- | --- | --- | --- |
| Email entered / draft | No | No | No |
| Invitation sent / pending | Depends on provider; not authenticated | No | No |
| Email verified + invitation accepted | Yes | Yes, in target workspace | No, absent specific authorization |
| Board member added | Yes | Yes | Selected board, exact role |
| Group assigned to board | Yes | Active group members only | Selected board, Viewer only |
| Group/board grant revoked | Yes | Unchanged | Deny from next server request |

## Current code

- `frontend/board-share.js`: Share & access now distinguishes **Board privacy**, **People with access**, **Add people or groups**, and **Invite someone new to workspace**.
- `frontend/workspace-board-groups.js`: signed manager-only exact-board directory normalization, separately signed group response parser, validated group drafts, fixed Viewer-only grant/revoke payloads, default-off signed transport and compact People/Groups selector. No client-side grants.
- `frontend/app.js`: uses only `loadBoardInvitableDirectory` and `db.allowed('manage')` from existing board contracts; the signed directory is still off. The workspace invitation button reuses the existing `openWorkspaceInvitationDialog` and `WorkspaceInvitationClient` code; sender remains off.
- `frontend/workspace-board-groups.css`: clean, compact, accessible picker included in main's one-request deterministic CSS bundle.
- `sql/bs09-workspace-board-access-groups-candidate.sql`: private RLS/default-deny group tables, group members, exact-board Viewer grants, audit events and ungranted fail-closed `bs09_group_allows_board` hook. Flag is OFF. **Does not replace or alter `work_board_access`, `wm_list_boards`, `work_board_members` or any active RLS.**
- `frontend/tests/workspace-board-groups.test.mjs`: member/group scope, duplicate and hostile input, Viewer-only grants, disabled network writes, actor/workspace mismatch, empty states, private SQL invariants.

## Why main cannot yet send invitations or grant real group access

Existing main's `WS02D_INVITE_CLIENT_ENABLED=false`, `REGISTRATION_ADMISSION_ENABLED=false` and `BOARD_COL01_DIRECTORY_ENABLED=false` remain unchanged. These safeguards are deliberate. The active Supabase `handle_new_user` and `ensure_default_workspace_membership` triggers have been documented as unsafe for unapproved external signup and must be replaced under an approved, independently tested migration.

The WS02D private workspace invitation issue/accept/revoke SQL candidates and signed Node/server contract should be **reused**, not recreated or activated by toggling a browser flag. Email needs an approved sender/SMTP provider, verified Auth settings, trusted server credentials, recipient-bound acceptance and genuine signed-session tests.

Board groups additionally require:
- audited signed management APIs to create groups and add/remove only current active workspace members;
- signed exact-board assignment/revoke APIs with idempotency and restrictive app allowlists;
- a backend group directory that returns only selected workspace IDs, group counts and authorized names;
- an explicit additive integration in `work_board_access` **plus board-list/RPC/Storage/export/Realtime checks**, with a separate negative test for every sensitive module and cross-workspace route;
- consistency when a member is removed from the workspace, leaves a group, is suspended, or the manager revokes a group, with no stale cached access;
- explicit handling of existing direct board grants versus group-only permissions (never silently remove direct memberships).

The SQL candidate is only a private data structure and permission hook; it **does not grant actual group access to boards** until the existing ACL is independently reviewed and integrated.

## Same-project deployment gates, without data loss

1. IT partner shares sanitized deployed `pg_policies`, Auth trigger fingerprints, `work_board_access`, `wm_list_boards`, `wm_get_board`, `wm_board_invitable_users`, `wm_add_board_member`, and module/Storage grants (no employee data needed).
2. Verify backup/recovery and check no changed DB definitions collide with PR #225, recent main merges or pending WS02 migrations.
3. Run candidate migrations and signed API negative tests against a disposable local PostgreSQL + GoTrue fixture first.
4. Configure email delivery and complete a synthetic account/recipient test, **without enabling public signup**.
5. On the existing Supabase project, after explicit migration approval, enable only one designated nonsensitive QA board, with one internal owner and one verified external test account.
6. Verify: workspace invite accepted, zero other boards visible, direct grant works, group grant works, revoke denies immediately, wrong email denied, protected apps/RPCs/exports/Storage denied, platform admin override documented, existing employee board editing unaffected.
7. Only after separate approval merge and deploy the reviewed live backend and set server flags; never enable by editing a browser constant alone.

**Privacy note:** The user's screenshot references company identities and training records; neither names nor sample personal records are copied into code or tests. Test fixtures use synthetic users and `example.test` addresses.
