# CP-FRT-SEC10 — Isolated, genuinely signed role-transition acceptance

**Checkpoint:** October 31, 2026.  
**Scope:** real signed Viewer → Supervisor → Restored operational acceptance, **nonproduction only**. Does not authorize changes to production users, roles, boards, finances, or Supabase projects.

## Verified production audit reconciliation — no mutation

A centralized `assignment.assign` request created on October 31, 2026, at **05:12:29 UTC** produced one `proposed` and one `applied` audit event referencing the **same change ID**. Database checks confirmed matching actor, workspace, request, and current **Viewer board membership for an existing HR member**. The same timestamp appears on the membership creation record. Therefore the change from 75 to 76 memberships and from zero to two audit-event rows reflects **one legitimate board membership assignment**, not two CRM platform-role transitions.

The production platform role override table remains empty. The signed HR member's inherited CRM role `supervisor` is separate from its Viewer board role, and it has **no FRT module grant**. Neither this HR account nor an existing bootstrap administrator is an appropriate target for a destructive production test.

## Current environment blocker

The connected Supabase organization exposes **one project**, the production WatchdogWorkspace/APSYNTRA backend (`jtlusodorfnyzgyuewkz`). **There is currently no independent connected nonproduction Supabase project available** for genuine live role mutation tests. Creating a new project or branch may incur costs and must have separate operational approval. No production role changes are permitted for SEC10 certification.

## Implemented isolated runner

- `scripts/cp-frt-sec10-live-guards.mjs`: Rejects production project, unexpected Supabase URLs, missing explicit isolated-mutation intent, missing credentials, duplicate identities, and malformed UUIDs **before any network request**.
- `scripts/cp-frt-sec10-live-client.mjs`: Uses actual GoTrue password logins and `/auth/v1/user` validation, caller-scoped self-access RPC, backend board and FRT permissions. JWT session IDs are compared **solely for distinct-session evidence**, never as a source of role authority. Never stores tokens in public reports.
- `scripts/cp-frt-sec10-nonprod-acceptance.mjs`: Verifies the existing bootstrap and target members, matching active workspace, **pre-existing owner** board membership and FRT module entitlement, no prior CRM override, and valid central admin snapshot. It then exercises:
  1. Bootstrap assigns Viewer using null initial CAS revision; target performs a **separate, genuine GoTrue sign-in** and verifies Viewer ceiling and admin snapshot denial.
  2. Bootstrap attempts stale CAS Supervisor revision; must receive HTTP 409 with no role state change. A correct revision-bound Supervisor transition follows.
  3. Target performs a second distinct sign-in, confirms Supervisor board/FRT restrictions, and rechecks workspace identity.
  4. Bootstrap revokes the explicit role overlay using current CAS revision. Target performs a **third distinct login**, confirms current owner and FRT privileges are restored, and the admin snapshot confirms inherited original role.
  5. Script attempts to clean up its last acknowledged override on failure using CAS, but **never overwrites an ambiguous concurrent assignment**. In any uncertain network acknowledgement it returns `MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED` rather than risking further mutation.
- `frontend/tests/cp-frt-sec10-nonprod-runner.test.mjs`: Mocked HTTP fixtures for production rejection, required signed accounts, stale CAS, 3 distinct login flows, missing FRT/owner prerequisites, bootstrap denial, and uncertain recovery. **Mocked credentials and JWTs are not live authentication evidence.**

## Environment contract

The following are intentionally **not** stored in repository secrets, logs, documents, or commit history. They are supplied locally when an independently approved isolated nonproduction project and **two existing real authorized accounts** exist:

```text
SEC10_CONFIRM_ISOLATED_MUTATIONS=ISOLATED_NONPRODUCTION_ONLY
SEC10_PROJECT_REF=<nonproduction Supabase 20-char project ref>
SEC10_SUPABASE_URL=https://<nonproduction-ref>.supabase.co
SEC10_PUBLISHABLE_KEY=<nonproduction publishable key>
SEC10_WORKSPACE_ID=<existing nonproduction workspace UUID>
SEC10_BOARD_ID=<board with an existing target-owner membership>
SEC10_BOOTSTRAP_EMAIL=<existing isolated bootstrap admin>
SEC10_BOOTSTRAP_PASSWORD=<private password>
SEC10_MEMBER_EMAIL=<existing isolated nonbootstrap target>
SEC10_MEMBER_PASSWORD=<private password>
```

Run only after prerequisites, migration parity, and recovery authority are verified:

```sh
node scripts/cp-frt-sec10-nonprod-acceptance.mjs
```

A safe dry run with missing configuration performs **zero network calls** and reports a BLOCKED result. The actual live runner requires three authorized changes to the **isolated target's CRM override** plus one deliberately rejected CAS attempt; it does not create users, delete app roles, create boards, or change finance records.

## Final independent acceptance gates

1. Verify at least three **distinct server-verified GoTrue session IDs** were issued by separate target logins. Each phase rechecks the central workspace and server decisions; do not infer permissions from user metadata or selected stage labels.
2. In the isolated database, independently read the **append-only** `apsyntra_role_change_requests` and `apsyntra_role_change_audit` ledgers. Confirm exactly three new applied CRM requests and correlated events (Viewer, Supervisor, revoke), **zero applied event** for the stale CAS denial, the expected change IDs, and the original audit baseline. The runner cannot read the privileged ledger through nonbootstrap RPCs and deliberately returns `CAPABILITY_PASS_AUDIT_PENDING` rather than final certification.
3. Verify initial and final workspace members, board owner membership, FRT assignment, financial records, bootstrap identities and central authorizations are unchanged. The only expected mutations are temporary CRM overrides with correlated append-only audit history.
4. Validate fresh-token denial and allowed operations at actual FRT domain RPC/financial transaction boundaries with safe **nonproduction** records, separately from the capability probe. A passing board/module check alone does not certify finance workflows.
5. If the script reports `MANUAL_ISOLATED_ROLE_RECOVERY_REQUIRED`, do not rerun blindly. Resolve the isolated override and audit state with an authorized administrator and preserve evidence.

**Status:** Source implementation and regression fixtures staged. Live role-transition acceptance **BLOCKED** until an isolated project, genuine existing identities, baseline entitlements, credentials, and independent audit verification are available. Production records are not to be modified to satisfy this checkpoint.
