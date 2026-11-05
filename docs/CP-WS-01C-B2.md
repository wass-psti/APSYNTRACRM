# CP-WS-01C/B2 — signed member workspace discovery readiness

**Current state, 2026-11-05: B2 PRODUCTION SIGNED-DISCOVERY RPC ACTIVATED AND STRUCTURALLY VERIFIED; ONE GENUINE SIGNED-USER REPORT RECEIVED (5/5 PASS).** Historical readiness and unactivated statements below are superseded by the activation evidence at the end of this document. Cross-role, foreign-workspace, and invalid-session live acceptance remain pending.

## Authoritative baseline

CP-WS-01C/B1 production migration `cp_ws01c_b1_additive_private_workspace_schema`, version `20261105043155`, has been installed and verified on the **existing** Supabase project `jtlusodorfnyzgyuewkz`. All six private tables are RLS enabled; `authenticated` and `anon` cannot directly select or alter them, and creation and selection flags are false. Legacy workspace data and `current_workspace_id` definition are unchanged.

## Source and acceptance evidence

- Proposed discovery migration: `sql/cp-ws01-discovery-activation-candidate.sql`. It creates `public.wm_ws01_list()` as a SECURITY DEFINER read-only RPC, verifies the **current GoTrue user** and `private.wm_board_config_session_active()`, checks active profile/membership, and lists **only the actor's active workspace memberships**. Missing legacy owner/privacy metadata resolves conservatively to `member` and `closed`. It revokes PUBLIC/anon execution, then grants only `authenticated` EXECUTE. No direct table grants, creation or switching are introduced.
- Dedicated committed live-safe readiness query: `sql/tests/cp-ws01c-b2-production-preflight.sql`.
- Live preflight output: `B2_DISCOVERY_SCHEMA_READY__NEW_AUTHENTICATED_EXECUTE_GRANT_NOT_APPLIED`. Verified six RLS-enabled private tables, signed-session guard, current workspace authority, B2/B3/B4 RPCs absent, both lifecycle flags disabled, direct authenticated member/privacy reads denied, zero explicit new workspace roles or privacy records, **2 workspaces** and **40 active membership records**.
- Prior disposable PG17 workflow covered read-only `wm_ws01_list` signed-session success/denial, privacy scope, foreign workspace non-disclosure, revocation and expired-session denial.

## Production activation boundary — separate gate

B2 adds a **new production authenticated EXECUTE grant** for a SECURITY DEFINER function. Therefore, it requires its own scoped production-permission-change authorization and evidence-based signed-user acceptance. The previous user confirmation for backup and B1 schema installation does not itself approve B2 permission activation.

After an independently authorized B2 activation, verify exact grant visibility, anon denial, active signed manager/nonmanager access limited to each user's memberships, foreign-workspace isolation, revoked/expired-session denial, zero direct table privilege escalation, and compatibility with the frontend's existing `WS01_DISCOVERY_ENABLED=false` flag. Only enable frontend discovery after these pass. **B3 transactional creation and B4 workspace selection remain disabled.**

This stage has **not** changed production schema or permissions.


## CP-WS-01C/B2 production activation and independent checks — 2026-11-05

**Authorization:** The user explicitly requested "alright begin Next gate — CP-WS-01C/B2" after the B1 activation and separate-permission boundary were explained. The operation was limited to the previously reviewed read-only discovery RPC and `authenticated` EXECUTE grant; no workspace creation/switch or data changes were authorized or performed. The earlier database backup was user-confirmed, not independently restore-tested.

**Preflight and source identity:**
- Exact committed migration: `sql/cp-ws01-discovery-activation-candidate.sql`, blob SHA `0815e4eac3fefa8688ddaf0bc09024dcaaef82fe`.
- `BEGIN/COMMIT` once, one `CREATE FUNCTION public.wm_ws01_list()`, `SECURITY DEFINER` with empty `search_path`, `auth.uid()`, existing `private.wm_board_config_session_active()`, active profile and member-filter check `m.user_id=v_actor AND m.active IS TRUE`. `REVOKE ALL` to `PUBLIC,anon,authenticated`; `GRANT EXECUTE` only to `authenticated`. No direct table grants, DML, public workspace authority replacement, or creation/switch RPCs.
- Preflight query: `sql/tests/cp-ws01c-b2-production-preflight.sql` returned `B2_DISCOVERY_SCHEMA_READY__NEW_AUTHENTICATED_EXECUTE_GRANT_NOT_APPLIED`, exactly six B1 RLS tables, 2 workspaces, 40 active memberships, both lifecycle flags disabled.
- Disposable PostgreSQL 17 acceptance: [run #32](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41969525661) **SUCCESS**, 20/20 native Node tests and isolated B2 authenticated/anon/unsigned grant tests, followed by prior lifecycle acceptance.
- Latest complete regression: [run #33](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41970070348) **SUCCESS**, 26/26 native Node tests, B2-only signed discovery/default-deny SQL, all staged domain acceptance. This also tests the B2 genuine-session browser probe with mock auth contexts; not a genuine production signed-user result.

**Production DDL activation:** Supabase `apply_migration` on the existing project `jtlusodorfnyzgyuewkz` with name `cp_ws01c_b2_signed_member_workspace_discovery` returned `{"success":true}`. Migration ledger version **`20261105044441`**, count **163 → 164**, exactly one B2 entry. **Do not reapply B2.**

**Executed production postcheck:** exact committed `sql/tests/cp-ws01c-b2-readonly-acceptance.sql` returned `B2_SERVER_READ_GRANT_POSTCHECK_PASS__LIVE_SIGNED_USER_TESTS_STILL_REQUIRED`. Verified:
- Public `wm_ws01_list()` exists, `authenticated` EXECUTE **true**; `anon` and `PUBLIC` EXECUTE **false**.
- Function requires signed session, active profile and membership; no-claim database probe was explicitly denied.
- All six private `ws01_*` tables retain RLS, and direct `anon` and `authenticated` SELECT/INSERT/UPDATE/DELETE privileges remain **denied**.
- B3 `wm_ws01_create(text,text,uuid)`, B4 `wm_ws01_select(uuid,uuid)`, and the private creation helper are **absent**. `creation_enabled=false`, `selection_enabled=false`.
- Existing workspaces **2**, active memberships **40**, unchanged.
- Existing `public.current_workspace_id(uuid)` definition fingerprint **`ceb6a14da8c7c8ed46187bae4833d575`**, unchanged.
- Postactivation advisor flagged `authenticated_security_definer_function_executable` (WARN) for `public.wm_ws01_list()`: **intentional and expected** for a restricted authenticated read RPC. The read-only function checks the GoTrue session and returns only active caller memberships; retaining SECURITY DEFINER is necessary to read protected internal tables, and no general table permission was granted. This warning is tracked; it must never be dismissed as blanket permission for arbitrary SECURITY DEFINER APIs.

**Live signed-user acceptance tool:** `frontend/workspace-b2-signed-acceptance.js` is wired into `#/security` by `frontend/app.js`. The control "Run B2 signed read checks" invokes `wm_ws01_list()` using the current genuine GoTrue bearer, verifies server-current workspace/user correspondence, validates the returned scoped catalog, re-verifies identity/session after the request, and exports only five check statuses and the count of signed memberships. No user names, workspace IDs, document content, credentials or tokens are exported. Reports clear on sign-out/session expiry, and are not persisted to browser storage.

**Acceptance boundary:** Structural server-side production activation **VERIFIED PASS**. Genuine signed manager, nonmanager and foreign-workspace browser acceptance **PENDING**; a successful isolated fixture or unsigned DB denial does not satisfy those real-user gates. The connected browser API was inaccessible in chat mode. Frontend general discovery `WS01_DISCOVERY_ENABLED=false` remains disabled until actual signed-user acceptance. B3 creation and B4 session switching remain **DISABLED and NOT APPLIED**. The previously identified lack of a foreign-workspace member remains a real-user coverage blocker, not an authorization failure.

**Next test:** After GitHub Pages deploys the new B2 probe, open `https://wass-psti.github.io/APSYNTRACRM/#/security` using each existing signed account; run "Run B2 signed read checks" and copy the sanitized JSON report. Compare authorized manager and nonmanager results, then cover an existing genuinely foreign-workspace user if one becomes eligible. For revoked/expired sessions, use controlled account-safe acceptance; no production token/user revocation was performed during B2.

## CP-WS-01C/B2 signed-user report received — 2026-11-05

**Evidence source:** The user supplied the sanitized result from the production `#/security` B2 signed-discovery probe. This is one signed-session report, **not** a verified manager-vs-nonmanager or foreign-workspace comparison.

```json
{
  "checkpoint": "CP-WS-01C-B2-SIGNED-DISCOVERY",
  "status": "PASS",
  "checks": [
    {"name": "signed-identity", "status": "PASS"},
    {"name": "workspace-context", "status": "PASS"},
    {"name": "server-discovery", "status": "PASS"},
    {"name": "membership-catalog", "status": "PASS"},
    {"name": "stable-session", "status": "PASS"}
  ],
  "signedWorkspaceCount": 1,
  "writesAttempted": 0,
  "identifiersDisclosed": 0
}
```

**Read-only production recheck:** The connected Supabase database was queried without changing data or privileges. `wm_ws01_list()` exists as a STABLE SECURITY DEFINER function with signed-session guard and active-member filter; authenticated EXECUTE=true, anon EXECUTE=false, PUBLIC EXECUTE=false. The six `private.ws01_*` tables retain RLS and have zero direct client DML grants. B3/B4 RPCs remain absent and both lifecycle flags are false. At the time of recheck, global inventory was two workspaces and 40 active memberships; the reporting user's one-workspace count is caller-scoped, not a global total.

**Verification boundary:** B2 production activation and scoped single-user signed discovery are evidenced. The report does not establish cross-account role ceilings, unrelated-workspace non-disclosure for other identities, or live revoked/expired-session denial. Disposable regression [workflow #33](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41970070348) was independently confirmed `completed/success`, but it is not a substitute for those live cases.

**Next acceptance gate:** Run the same sanitized B2 probe under a distinct existing authorized nonadministrator account and, if available, an existing genuinely foreign-workspace member. Complete controlled revoked/expired-session denial checks without mutating production users or permissions. Keep `WS01_DISCOVERY_ENABLED=false`, B3 creation, and B4 switching disabled until separately authorized and accepted. Do not reapply the B2 migration.


## CP-WS-01C/B2 cross-identity and authorization denial acceptance — 2026-11-05

**Gate status: AUTOMATED DENIAL VERIFIED; LIVE CROSS-IDENTITY ACCEPTANCE INCOMPLETE.** One prior genuine signed-user B2 report remains 5/5 PASS. Do not equate synthetic user/session testing with authenticated production acceptance by multiple identities.

**New repository artifacts:**
- `sql/tests/cp-ws01c-b2-cross-identity-denial-disposable.sql`: guards against running outside `workspace_disposable`, then exercises synthetic manager and nonmanager workspace isolation, dual-membership discovery, absent membership, inactive profile, inactive membership, cross-account session mismatch, missing session claim, revoked GoTrue session, expired GoTrue session and anon execution.
- `.github/workflows/cp-ws01b-disposable-postgres.yml`: runs this dedicated B2-only denial suite **before** any staged B3 creation or B4 selection function is installed. No real identities, tokens or production records are used.

**CI execution:** [CP-WS-01B disposable workflow run #36](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41973353012), commit `de686cd165b161ceb0de9159063e3fa6f3dca716`: completed **SUCCESS**. The added B2 cross-identity/foreign/revoked/expired test step passed; all other PostgreSQL 17 lifecycle steps passed.

**Production read-only results:** Executed a no-JWT call to `public.wm_ws01_list()`, which was rejected with `insufficient_privilege`; inspected effective execution privileges and private-schema protection. `authenticated` EXECUTE=true, `anon` EXECUTE=false, PUBLIC EXECUTE=false. Both B3/B4 RPCs remain absent, both lifecycle flags false, and workspace lifecycle event count unchanged at zero. No production SQL DDL, DML, grants, user/session revocation or membership changes performed.

**Coverage limitation observed in production inventory:** Two workspaces exist, but only one has active memberships, and no pair of current active member identities has disjoint workspace memberships. Therefore, a real foreign-workspace-member comparison cannot be run with the current production membership layout. Existing nonadministrator active member profiles do exist; verifying a distinct user still requires that account's genuine signed GoTrue browser session.

**Remaining genuine live acceptance:** (1) run the sanitized `#/security` B2 probe in a distinct nonadministrator account, (2) compare genuinely disjoint workspace membership scopes if a legitimate existing eligible identity becomes available without manufacturing accounts/permissions, and (3) collect controlled real revoked/expired-session denial evidence without mutating production accounts for testing. Keep `WS01_DISCOVERY_ENABLED=false`, B3 and B4 disabled until independently accepted.
