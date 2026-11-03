# CP-BOARD-COL01 — Frontend directory and audit cursor preparation

Status: frontend-only and default-disabled. Existing WatchdogWorkspace Supabase backend retained, with no SQL, RLS, grant, role, user, session, or production-data changes.

## Prepared interfaces

- Manager-only directory: prepares the exact signed RPC wm_board_invitable_users(p_board_id uuid,p_query text). The frontend verifies the board MANAGE check before requesting directory results, bounds input to 120 characters and output to 40 entries, validates identifiers and board roles, and escapes all displayed labels/emails. It contains no invitation or role-write controls. The backend remains the final authorization authority.
- Audit cursor: prepares wm_list_board_events_page(p_board_id uuid,p_before_id bigint,p_limit integer). It uses 25 visible records with one-row lookahead, rejects non-monotonic and out-of-window IDs, retains 64-bit cursor precision as decimal strings, and bounds cached pages to 20. User-controlled messages are escaped; unexpected responses cause a closed error without a fallback to broader table reads.
- Existing default UI: Board members continue to use the signed wm_get_board result; activity continues to use wm_list_board_events and its existing local page/refresh controls. Both new adapters are wired but their source constants BOARD_COL01_DIRECTORY_ENABLED and BOARD_COL01_AUDIT_CURSOR_ENABLED are false. Disabled mode emits zero additional RPC requests.
- State and privacy: existing board/user/workspace identity is rechecked after awaited requests and before rendering. The directory does not write to localStorage, change roles or expose unauthorized member details.

## Verification and activation boundary

The new contract tests in frontend/tests/board-col01-readers.test.mjs exercise no-call default gates, manager-only denial, bounded search, escape safety, malformed/duplicate identities, monotonic cursors, high-precision bigint identifiers, query limits and 42501 denial. They are mocked client tests; they do not prove actual GoTrue signed authorization.

Do not enable either flag or run production SQL under this preparation milestone. Activation requires independent review in GitHub Issue #29, approved test fixtures, actual signed same- and foreign-workspace denials, revoked/expired session acceptance, separate authorization of SQL permission changes, rollback acceptance and signed GitHub Pages acceptance.

Relevant review: https://github.com/wass-psti/APSYNTRACRM/issues/29
