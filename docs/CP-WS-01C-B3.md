# CP-WS-01C/B3 — controlled workspace creation development gate

**Status: AUTOMATED B3 ISOLATED ACCEPTANCE VERIFIED (PG17 CI PASS); LIVE SIGNED-CREATE ACCEPTANCE AND PRODUCTION ACTIVATION PENDING.** Production activation is **NOT authorized or applied**. B2 cross-identity/denial coverage is partly complete; real revoked/expired-session and genuinely disjoint foreign-workspace live cases remain unverified.

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

## Automated execution result — 2026-11-05

GitHub Actions [workspace lifecycle run #38](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41974370264) on commit `bce3226ea6e2f9ba4313c1b47028313ec64b5380` completed **SUCCESS**. The named step **Verify B3-only atomic creation, idempotency and rollback without B4** completed **SUCCESS**, as did the B2 denial regression and downstream disposable lifecycle acceptance. This verifies the test suite in the GitHub Actions PostgreSQL 17 fixture, not production runtime or a real signed-user create operation. Production creation remains disabled.


## CP-WS-01C/B3 authorization-ceiling and production preactivation gate — 2026-11-05

**Gate opened and nonmutating preflight verified.** Committed `sql/tests/cp-ws01c-b3-production-readonly-preflight.sql` and wired it into the disposable PG17 workflow immediately before installing dormant B3 SQL. The exact committed query was executed against existing production project `jtlusodorfnyzgyuewkz` and returned:

```
B3_PREACTIVATION_SCHEMA_READY__ROLE_CEILING_AND_PRODUCTION_APPROVAL_PENDING
```

Read-only evidence at this checkpoint: all six private `ws01_*` tables have RLS and zero direct client DML grants; no RLS policies were added to those tables; existing session guard, workspace resolver and B2 authenticated discovery grant are intact; neither B3 creation nor B4 switching functions exist; direct `authenticated` / `anon` workspace creation grants remain denied; both private lifecycle flags are false; there are zero B3 create requests or workspace lifecycle events; workspace inventory 2, active memberships 40. These are live snapshots, not future guarantees. No production SQL mutations were executed.

**Critical role-ceiling boundary:** Existing `sql/cp-ws01c-b3-create-contract-candidate.sql` checks signed session, active profile and any active workspace membership, but does not read `profiles.platform_role` or implement an administrator/other-role creation ceiling. No final production policy is established by this gate. Decide whether the intended creator eligibility is (a) only specified platform administrators, (b) all active signed members, or (c) explicitly delegated creation permission; design and test denied-role and role-revocation behavior against that decision before any production function/grant activation. Do not infer creator authority from frontend flags alone.

**Approval boundary:** Running the nonmutating preflight and disposable tests requires no production permission changes. Installing the new `SECURITY DEFINER` create function, granting `authenticated` EXECUTE, or enabling `creation_enabled` are separate production authorization events and remain outside this gate. B4 remains disabled. Outstanding real B2 foreign-workspace and revoked/expired-session coverage remains independently tracked.

**Automated check:** [Workspace lifecycle workflow run #40](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41975195556), head `757065eb7621ac1b525808c44ef04b319fedd9d0`, completed **SUCCESS**. The new read-only B3 preactivation step passed, as did the B2 denial and B3 rollback/creation steps. No live B3 create testing or production activation is implied.


## CP-WS-02 approved self-service creator policy — 2026-11-05

The owner approved the `CP-WS-02` specification: **any eligible authenticated, email-verified non-anonymous APSYNTRA CRM user may create and own workspaces**. Existing platform administration is independent and must never be granted through workspace creation. This supersedes prior unselected administrator-only/delegated-creator recommendations.

The B3 creation candidate continues to require an active GoTrue session, active profile and existing active membership (normally supplied by the independent Main Workspace onboarding path). It now also checks live `auth.users.email_confirmed_at IS NOT NULL` and `auth.users.is_anonymous IS FALSE`; no client-controlled role claim confers authority.

Disposable PG17 [run #43](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41976847871) completed success for ordinary nonadministrator creation, unchanged `platform_role`, and denial for unverified/anonymous users. Later [run #44](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41977702471) also passed that regression and isolated personal Main Workspace provisioning. All code remains dormant in production. Public registration remains blocked by legacy signup triggers; role policy decision alone does **not** authorize or execute any migration, production permission grant, flag activation or account creation.
