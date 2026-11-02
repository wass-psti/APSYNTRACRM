# CP-BOARD-COL01 — Production security acceptance (pre-activation)

Scope: **READ-ONLY production inspection**, additive SQL candidate and rollback acceptance in disposable PostgreSQL. Production schema, memberships, permissions, storage and records are **not modified**.

## Baseline evidence, 2026-11-03 (Asia/Manila)

- GitHub main at start: `6189fab9cacc3ea79e72a625f873129384d01b0f`; 9/9 GitHub checks green for the last staged candidate.
- Live `wm_add_board_member(uuid,text,text)` MD5 of `pg_get_functiondef`: `0dde086a58def1dd5437b32264c0697a`. Existing authorizer is a SECURITY DEFINER function owned by postgres, authenticated EXECUTE yes, anon EXECUTE no. Current definition does not check target active **workspace membership**, only target active profile and caller manage access. It can upsert an existing owner to editor/viewer. This is the targeted security gap.
- `work_board_access` verifies active actor, current workspace, platform-level role ceiling, member role and edit/manage; it relies on `auth.uid()`. It does **not** independently prove GoTrue session revocation from `auth.sessions` in its visible SQL definition. Signed HTTP checks for revoked/expired bearer tokens are an unsatisfied acceptance gate.
- Live read-only anomaly aggregate: foreign/inactive board memberships = 0; unexpected board-role vocabulary = 0; explicit Viewer+board Editor conflicts = 0. These are point-in-time query results, not a guarantee for future writes.
- New additive functions (`wm_board_invitable_users`, `wm_list_board_item_updates`, `wm_list_board_item_files`, `wm_list_board_events_page`) were not present in live production. Base tables have RLS enabled and authenticated direct SELECT revoked; item metadata must stay behind signed RPCs.
- Supabase Security Advisor pre-activation: 68 info notices RLS/no policy (including board tables intentionally deny direct access), 9 mutable function-search-path warnings, 3 anonymously executable privileged function warnings, 268 authenticated privileged-function warnings, and one leaked-password-protection warning. These are project-wide counts, not 268 proven vulnerabilities. See [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

## Security candidates and rollback

1. `sql/cp-board-collab01-authorization-candidate.sql` — staged only; checks same-workspace active invitee and role ceiling, preserves board-owner role, adds manager-only directory and signed item/file readers and event cursor.
2. `sql/cp-board-collab01-production-readonly-preflight.sql` — SELECT-only drift/privilege/RLS/role anomaly preflight; must report PASS before separate approval can be requested.
3. `sql/cp-board-collab01-rollback.sql` — guarded transactional rollback restoring the **exact original live membership function** and grants; removes only the four candidate RPCs, never changes membership, files, event or item rows.
4. `sql/tests/cp-board-collab01-disposable-acceptance.sql` — positive and denied cases for cross-workspace, viewer ceiling, owner protection, item/file event scope and cursor.
5. `sql/tests/cp-board-collab01-revocation-acceptance.sql` — synthetic membership removal/inactive workspace gates with already-issued JWT identity simulated; **not** equivalent to a real GoTrue bearer token that was revoked.
6. `sql/tests/cp-board-collab01-rollback-acceptance.sql` — compare function source MD5, candidate API absence, previous data counts and anonymous/authenticated grants after rollback.

## Stop / go decision

**No production DDL or live role mutation authorized by this checkpoint.** Production activation remains BLOCKED until all are met:

- Independent security review of every SECURITY DEFINER function, search_path, GRANT and exception/transaction behavior; rollback ready and rehearsed;
- live preflight fingerprint and schema unchanged, genuine isolated active/foreign/revoked JWT tests, same-workspace/role ceiling and concurrent invites/revokes tested;
- actual signed HTTPS session revocation and expiration denial, not just a simulated `request.jwt.claim.sub`;
- approval for production permission-changing SQL and verified rollback plan; deployment gates/CI/branch protections respected;
- post-activation read-only drift check, two distinct real signed users and live Pages acceptance, no unauthorized data exposure.

No publicly writable REST table permissions or service-role credential exposure are permitted. Database and Storage changes must remain consistent with existing central SDK and signed-session architecture.

## Delivery evidence

Record CI test count and exact commit after verification. A green CI job proves disposable candidate behavior, **not** production activation or runtime acceptance. Current phase completeness should be described per security gate rather than inventing an overall percentage.
