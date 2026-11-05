# CP-WS-01C/B3 — controlled workspace creation development gate

**Status: IMPLEMENTED-UNVERIFIED (isolated B3 acceptance added, CI result pending).** Production activation is **NOT authorized or applied**. B2 cross-identity/denial coverage is partly complete; real revoked/expired-session and genuinely disjoint foreign-workspace live cases remain unverified.

## Verified starting baseline

- Existing Supabase project: `jtlusodorfnyzgyuewkz`; GitHub `wass-psti/APSYNTRACRM` on `main`.
- The B1 six-table private schema remains RLS/default-deny.
- `public.wm_ws01_list()` is already activated for authenticated, membership-scoped, read-only discovery under B2.
- Production has neither `wm_ws01_create(text,text,uuid)` nor `wm_ws01_select(uuid,uuid)`. Both private lifecycle flags remain false. The live database read-only check found two workspaces and zero B3/B4 lifecycle events.
- Earlier user-submitted B2 signed discovery reports included one general signed account and one explicit HR nonadministrator, both 5/5 PASS. These are not revoked-session or disjoint-workspace denial evidence.

## Existing B3 candidate

`sql/cp-ws01c-b3-create-contract-candidate.sql` is a review-only candidate, not a production migration. It provides:

- A server-side active GoTrue session verifier and active profile/membership prerequisite.
- Atomic owner workspace creation, active creator membership, conservative privacy metadata and append-only creation event in one function call.
- An actor-scoped idempotency request key with serialized profile lock; conflicting replay is denied.
- Name, privacy and request ID validation; no automatic session/workspace switch.
- Default-deny function grants (no authenticated/anon EXECUTE), with `creation_enabled=false` unless explicitly enabled in an isolated fixture.

**Authorization policy review required:** The candidate currently authorizes any active signed member meeting the session/membership prerequisites, not only platform administrators. This is the actual verified code behavior, not a conclusion that administrators-only or all-members creation was explicitly approved. Confirm the intended platform role ceiling before any production grant/enablement. Do not silently change this contract to assume an administrator-only policy, or deploy an unrestricted creation capability without an approved role policy.

## Isolated acceptance and CI

- New file: `sql/tests/cp-ws01c-b3-disposable-isolated-acceptance.sql`.
- Existing workflow: `.github/workflows/cp-ws01b-disposable-postgres.yml` now executes the B3 test **after** staging dormant B3 SQL, **before** staging the B4 cutover.
- Test must run only in the synthetic `workspace_disposable` PG17 database, and uses a transaction that is rolled back.
- Tests default-deny and disabled-flag behavior, signed atomic creation, owner membership, policy, idempotent replay/conflicting replay denial, invalid-input rejection, audit attribution, prevention of automatic switching, foreign actor discovery exclusion, and rollback of all grant/flag/record changes.
- Earlier lifecycle tests remain the regression baseline; new B3-only suite must pass independently before any next stage.

## Production activation boundary

**Not in scope for this development-only gate:** production B3 SQL installation, new function grants, lifecycle-flag enablement, production workspace or membership writes, changing platform roles, and B4 activation.

Future production activation requires separate explicit permission-change approval and verified policy decision, a reversible migration and rollback, genuine signed create/deny acceptance across allowed and disallowed roles, isolation, audit, refresh persistence, concurrency/idempotency, and evidence of no B2 or B4 regressions.

The currently outstanding B2 live security denial cases are separately tracked; passing isolated B3 tests does not close them.
