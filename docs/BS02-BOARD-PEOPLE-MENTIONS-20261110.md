# BS02 — Board People & @Mention UX (2026-11-10)

**Status:** Integrated in the **feature branch only**; signed board-member display is live-read-only where existing `wm_get_board` returns explicit membership. @Mention is a **local draft**; no database write, notifications or account grants. Not deployed to `main` or production.

## User flow

1. Fetch/pull `feat/board-scoped-guest-invites-20261110`, run the usual `py -m http.server 8000 --bind 127.0.0.1`, and sign in with an existing authorized APSYNTRA account.
2. Open a board. In the header choose **People**, or **Board options → Who can access**.
3. The panel reads the board's existing signed `wm_get_board` membership snapshot only after `work_board_access(...,'view')` authorizes the current user. It shows explicit members, assigned role, searchable names, and a button to copy `@Name`.
4. Under **Draft an update**, type `@` then a few letters to see matching explicit board members. Pick a suggestion; APSYNTRA inserts `@Name` as text. **Copy draft text** copies it for manual use. Nothing is posted or notified.

## Security interpretation

**Important:** The absence of a name from an explicit-member list does NOT prove the person cannot view the board. An organization administrator, workspace-inherited permission, separate app entitlement, or guest policy may allow effective access without a direct `work_board_members` row. Conversely, a name appearing in an old snapshot does NOT guarantee live access after a revocation. Therefore this UI labels results **explicitly assigned board members**, not a complete list of everyone who can read. This cannot replace server authorization.

The code never queries a broad user directory for mentions, accepts arbitrary usernames as permission proof, or writes membership. Malformed board identity/member IDs, duplicate records, unknown roles or foreign-board identity fail closed. Rendering escapes external text. Pending guest access is excluded from the current list.

## Implementation

- `frontend/board-people.js` — strict typed exact-board normalization, searchable member list, safe `@mention` suggestions, escaped text rendering, and local insertion.
- `frontend/app.js` — header **People** control, upgraded **Who can access** dialog, signed board VIEW recheck, search and mention selection, copy actions, cleanup on modal close.
- `frontend/board-people.css` and `index.html` — lightweight styling for member pills, roles, and mention suggestions.
- `frontend/tests/board-people.test.mjs` — explicit-member boundary, foreign-board failures, malicious names, nonmember suggestions, local-only writes.
- `.github/workflows/bs01-isolated-source-checks.yml` — CI runs BS02 tests plus existing board activity, directory and item collaboration regressions.

Local verification:
```powershell
git pull --ff-only origin feat/board-scoped-guest-invites-20261110
node --check frontend/app.js
node --check frontend/board-people.js
node --test frontend/tests/board-people.test.mjs frontend/tests/board-activity-ui.test.mjs frontend/tests/board-col01-readers.test.mjs
py -m http.server 8000 --bind 127.0.0.1
```

## Required before full Monday-equivalent functionality

1. A signed **effective board access** endpoint that computes all authorized viewers by stable user ID and verifies current active Auth sessions, workspace and board grants, policy role ceilings, guest grants and app-specific restrictions. Avoid enumerating unauthorized users and constrain results to the selected board, caller role and pagination.
2. A server-validated **mention identity** contract (user UUID + board UUID, not just plain `@Name` text), tied to a future signed update/comment writer.
3. Backend notification fanout for permitted mentions only; handle revoked membership, disabled notifications, renamed users, cross-board mentions and idempotent retries.
4. Access list freshness after revocations, bounded directory search, and owner/manager-only controls for granting/revoking memberships.
5. No user-directory leak to guests and no exposure of private module data. Test genuine GoTrue session/RLS denial and application-wide effective permissions in isolated infrastructure.
6. Main branch has progressed independently: review/rebase intentionally with IT partner rather than overwriting his changes.

**Never infer permissions from the UI suggestions. Authorization remains server-side.**
