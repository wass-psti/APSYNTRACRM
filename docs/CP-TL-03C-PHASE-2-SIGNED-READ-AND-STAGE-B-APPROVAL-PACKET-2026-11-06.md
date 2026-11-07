# CP-TL-03C / Phase 2 — Genuine Signed Stage A Read Refresh & Stage B Approval Packet

**As of:** 2026-11-06, Asia/Manila  
**Project:** APSYNTRA CRM, existing `jtlusodorfnyzgyuewkz` Supabase project, existing TradeLink board `264ca40d-6e4a-4e4f-97e6-3bd77c97cd88` only.  
**Disposition:** **Approval packet PREPARED; Stage A live structural 15/15 VERIFIED (previous preflight); BOTH fresh signed read cases ACCEPTED: manager AUTHORIZED_MANAGER 6/6 and HR BOARD_MANAGER_DENIED 6/6 (separate user-supplied deployed application reports); Stage B production grant NOT AUTHORIZED and NOT APPLIED.**  
**Change type if subsequently approved:** Production privilege modification for two tightly scoped draft-command functions; not a schema reapplication, data migration, account/role change, or frontend feature activation.

## Evidence and environment baseline

- The separately authorized **Stage A** read-only domain schema was installed on 2026-11-05 as migration `20261105011611 cp_tl03c_stage_a_readonly_domain_activation`. Do **not** rerun `sql/cp-tl03-staged-domain.sql` in production.
- On 2026-11-06, `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` independently returned `STAGE_A_STRUCTURAL_PASS__STAGE_B_NOT_AUTHORIZED`, all **15/15** predicates true, no drift: board scope, eight existing columns, one group, zero items; two domain tables with zero rows, RLS, authenticated read-only grants, anonymous denials, immutable audit trigger, and 13 exact dependency/domain function fingerprints.
- Document read/list via `public.tl03_document_read(uuid,uuid)` and `public.tl03_documents_list(uuid,integer)` is granted to `authenticated` and server-limited to valid signed manager/module/workspace via `private.tl03_can_manage(uuid)`. Both installed public/private draft commit entry points are **not executable by authenticated or anonymous roles**. Ordinary authenticated INSERT/UPDATE/DELETE on both domain tables is denied. `frontend/tradelink-domain-client.js` retains read/write flags **FALSE/FALSE**.
- Disposable PostgreSQL 17 GitHub Actions run #13 `41950802327`, job `126994002587`, independently completed **SUCCESS**, and decoded logs established signed synthetic create/retry/CAS/archive/restore, role ceilings, foreign workspace, expired/revoked-session fixtures, immutable audit, and broad emergency-disable-with-data-retention. Node adapter/SQL tests: **16 passed, 0 failed**. Evidence: https://github.com/wass-psti/APSYNTRACRM/actions/runs/41950802327. This is nonproduction **synthetic** proof only.
- Previously submitted, genuine signed client reports in `docs/CP-TL-03C.md`: `AUTHORIZED_MANAGER` **6/6 PASS** and existing HR `BOARD_MANAGER_DENIED` **6/6 PASS**. Those historical results apply to the user and roles actually exercised; **fresh Phase 2 signed refresh remains pending**. The browser connector requires an originating browser context and could not access the user's signed CRM tab in this chat. No credentials or bearer tokens were requested or used.
- Foreign-workspace signed acceptance is blocked: the other existing workspace has zero active member profiles and zero eligible signed-session candidates. Do not create/move users solely to manufacture an acceptance report. Truly revoked/expired real bearer acceptance remains separately pending.

## Genuine signed Stage A read refresh — current production, ZERO writes

**Entry:** https://wass-psti.github.io/APSYNTRACRM/#/security  
**Panel:** `TradeLink · Stage A signed read acceptance`  
**Action:** `Run Stage A signed read checks`, then `Copy nonsecret result`.

Use independently existing, legitimate sessions only. For each, retain an unmodified sanitized report containing exactly six checks: `signed-identity`, `effective-access`, `document-list`, `missing-document-read`, `wrong-board-denial`, `stable-session`.

| Required genuine scenario | Expected report | Decision |
| --- | --- | --- |
| Current authorized TradeLink General Manager, with board `manage` and platform ceiling | `status:PASS`, `scenario:AUTHORIZED_MANAGER`, six checks `PASS`, `writesAttempted:0`, `documentsDisclosed:0` | PENDING NEW PHASE 2 REPORT; historical PASS retained |
| Existing HR / genuine nonmanager, board-manager ceiling not met | `status:PASS`, `scenario:BOARD_MANAGER_DENIED` (or verified `MODULE_ROLE_DENIED`), six checks `PASS`, zero writes/disclosures | PENDING NEW PHASE 2 REPORT; historical PASS retained |
| Genuine different active workspace, legally provisioned existing real identity | `status:PASS`, `scenario:FOREIGN_WORKSPACE_DENIED` and six checks `PASS` | BLOCKED: no active foreign workspace member |
| Revoked/expired original bearer | Controlled, same original token without auto-refresh; genuine provider/server denial; no token disclosure | PENDING SEPARATE AUTHORIZED ACCEPTANCE |

A successful list of zero documents and a null nonexistent-document read proves endpoint authorization and response shape **only**, not existing-row RLS isolation. Do not claim row-level cross-workspace acceptance on an empty table. Never submit raw access/refresh tokens, session IDs, document content, or PII.

## Proposed Stage B privilege delta — request for separate approval ONLY

Source: `sql/cp-tl03c-write-permission-candidate.sql`, current reviewed Git blob `b5c8edff4ca42814ae43c2286e2d504a4a1ba90e`. This candidate is **not** to be run during Phase 2.

**Exactly two additional privileges** inside a fail-closed transaction, subject to zero existing documents/items and the exact immutable board/workspace/signed-function prerequisites:

```sql
GRANT EXECUTE ON FUNCTION
  private.tl03_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.tl03_document_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;
```

No grants to `anon`; no direct table mutations; no role/membership changes, no independent application login, Storage uploads, document workflow transitions or review/approval statuses. The public function is `SECURITY INVOKER`, calling the private `SECURITY DEFINER` implementation with pinned search path. The private authorization predicate requires `auth.uid()`, verified active session, exact TradeLink board/workspace, effective module role `General Manager`, and board `manage`; any SQL NULL is false. The server supports only draft **create**, **update**, reversible **archive**, and **restore**, with CAS expected revision, row locks, board projection, document revision ledger and board Activity audit. Because broad `authenticated` EXECUTE exposes a reachable API even when the frontend flag is off, separate permission approval and live signed-user testing are mandatory.

**Material risk:** a defect in any signed-session, board-access, module-role, workspace, draft validation, projection CAS, or audit check could permit unauthorized document/board mutations. Legacy TradeLink SECURITY DEFINER warnings are tracked separately; do not weaken them or assume these new grants cover those legacy APIs.

## Backout and retained evidence

**Preferred Stage B-specific rollback:** newly staged `sql/cp-tl03c-stage-b-write-revoke-candidate.sql`. Its transaction requires both Stage B write grants to be active and Stage A reads intact. It revokes **only** the two authenticated draft-command EXECUTE privileges, checks both write paths are denied and Stage A document read/list + table SELECT survive, then commits. It contains no DROP/TRUNCATE/INSERT/UPDATE/DELETE and preserves existing documents, board items, RLS policies, triggers, and audit events. It must not be run on production without separate scoped production privilege-change authorization. The disposable-only acceptance fixture `sql/tests/cp-tl03c-disposable-write-revoke-acceptance.sql` requires a previously created synthetic document, four audit revisions, and one linked board item still intact after this narrow rollback.

**Full emergency disable:** existing `sql/cp-tl03c-emergency-disable-candidate.sql` additionally revokes Stage A reads/list and table SELECT. It is a broader emergency isolation measure, not the ordinary Stage B reversal; use only if that extra outage scope is explicitly approved.

**Recovery:** The user previously reported that production backup availability was acceptable for Stage A, but a current backup restore rehearsal and rollback window for Stage B are **not independently verified**. Neither a successful build nor a schema preflight establishes recovery readiness. Prior to granting Stage B write EXECUTE, require an explicit current backup/recoverability decision, change/incident owner, rollback trigger, retention expectations, and a viable signed-user test fixture. Do not add synthetic production users, invent test records, or mutate operational data without their separate authorization.

## Stage B go/no-go acceptance ledger

| Gate | Classification |
| --- | --- |
| Installed Stage A schema, RLS, grants, audit, dependency fingerprints | **VERIFIED — 15/15 live SQL** |
| Disposable PostgreSQL synthetic create/CAS/roles/RLS/emergency | **VERIFIED — run #13, logs and 16 Node passes** |
| Dedicated Stage B write-only rollback candidate and data-preservation fixture | **VERIFIED — disposable PostgreSQL CI run #16 and decoded job logs** |
| Genuine Stage A manager signed report | **PHASE 2 PASS — fresh user-submitted signed report, 6/6** |
| Genuine Stage A HR nonmanager signed report | **PHASE 2 PASS — fresh user-submitted BOARD_MANAGER_DENIED, 6/6** |
| Genuine foreign-workspace/expired/revoked production acceptance | **BLOCKED/PENDING** |
| Current backup and tested recovery path | **PENDING** |
| Separate signed production Stage B permission-change approval | **NOT RECEIVED** |
| Production Stage B write grant and real draft mutation acceptance | **NOT ACTIVATED / NOT APPLICABLE YET** |
| Full TradeLink workflow approvals, PDF/attachment flows | **OUT OF CP-TL-03C DRAFT-ONLY SCOPE** |

**Activation decision:** **NO-GO at this time**, with the current Stage A protected read-only baseline left unchanged. The packet is preparatory and **not a request to run the grants automatically**.

## Future controlled sequence, only after explicit permission and data approvals

1. Verify the current source and database still match `sql/tests/cp-tl03c-phase1-readonly-activation-preflight.sql` (15/15), the two write grants are still absent, the Phase 2 genuine read reports are accepted, current backup recovery is confirmed, and updated disposable CI has passed including narrow rollback.
2. Obtain separately scoped explicit production permission approval specifying both Stage B grants and the permitted rollback. Any **production test document writes** require their own specified authorization and retention/cleanup policy.
3. Apply the approved migration only through the authorized production change process. Never automatically enable frontend domain read/write flags just because the commit RPC became reachable.
4. Recheck RLS/grants and both write-function EXECUTEs under ordinary read-only SQL. Perform genuine signed manager positive and nonmanager negative cases with the **approved** data fixture, including stale CAS denial, duplicate prevention, audit integrity, workspace isolation and refresh persistence.
5. On unexpected privilege, scope, integrity, or audit outcomes, stop further writes and separately authorize the narrow Stage B rollback. Use the full emergency-disable candidate only when the wider read-service outage is warranted and approved.
6. Close this gate only after signed production runtime, post-deployment regression, rollback readiness and retained-data integrity have real evidence. Track unresolved legacy source workflow, attachments and approvals separately.

**Next required gate after signed-read refresh:** verify current backup and recoverability, assign change/rollback ownership, review remaining security restrictions and obtain separately scoped production Stage B write-permission approval before any grant. Both fresh signed role reports and disposable narrow-rollback CI are VERIFIED. Production Stage B remains disabled.


## Verified Stage B-only rollback CI follow-up — 2026-11-06

Authoritative GitHub Actions **run #16**, ID `42177877866`, head `6757a5703e5ff4fc6bb3d4a035bb328a656d24ca`, job `127760532389` **SUCCEEDED**. Both newly inserted steps completed successfully:

- `Revoke Stage B write grants only, retaining Stage A reads (disposable)`.
- `Verify read continuity and record retention after narrow revoke`.

Decoded PostgreSQL log: `CP-TL-03C narrow Stage B write revoke PASS: Stage A reads preserved, documents and audit intact`. Earlier signed fixture, RLS and CAS steps remained successful; the later broad emergency-disable and retention checks also passed. Node suite result **16 pass, 0 fail**. [Run #16](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42177877866). This verifies the **disposable-only** rollback mechanism, **not** a production rollback rehearsal. No production grant/revoke was executed in this run.


## Genuine signed manager Stage A read refresh — PASS (user report, 2026-11-06)

A fresh sanitized output was provided by the user from the deployed APSYNTRA CRM Security page (ambient location `#/security`). Its exact classification is `checkpoint=CP-TL-03C-STAGE-A-SIGNED-READ`, `status=PASS`, `scenario=AUTHORIZED_MANAGER`. All six checks are PASS: `signed-identity`, `effective-access`, `document-list`, `missing-document-read`, `wrong-board-denial`, and `stable-session`. It reports `writesAttempted=0` and `documentsDisclosed=0`. The report matches the safe output schema of the committed `frontend/tradelink-stage-a-signed-acceptance.js` and constitutes **user-submitted genuine signed application evidence** for *this manager/read scenario only*. The assistant did not independently open the session, obtain a token or execute a bearer-bound browser request.

**Additional live read-only check on this turn:** PostgreSQL returned `documents=0`, `events=0`, `write_enabled=false` for authenticated `public.tl03_document_commit`, and `read_enabled=true` for authenticated `public.tl03_documents_list`. The full previously committed 15-point structural preflight was already accepted in Phase 1; its repeated attempt in this turn could not provide a fresh usable result, so **do not claim a fresh 15/15 re-run here**. These database queries do not independently bind to the user's GoTrue bearer.

**Acceptance update:** Phase 2 manager signed read **VERIFIED (6/6 user report + independent no-write DB baseline)**. New Phase 2 genuine HR `BOARD_MANAGER_DENIED` or `MODULE_ROLE_DENIED` **PENDING**; the historical HR result remains accepted for its earlier milestone but is not a second fresh Phase 2 submission. Foreign workspace **BLOCKED BY PREREQUISITE**, revoked and expired sessions **PENDING**. Stage B write approval and grant **NOT RECEIVED / NOT EXECUTED**. No user account, workspace role, document, audit data, privilege, RLS policy or session was modified in this acceptance.

**Next required result:** A separately signed, existing HR/nonmanager account runs `Run Stage A signed read checks` and copies the sanitized output. The expected `scenario` is `BOARD_MANAGER_DENIED` or `MODULE_ROLE_DENIED` with all six checks PASS and zero writes/disclosures. Do not repeat the manager scenario to satisfy this separate case.


## Genuine signed HR board-manager denial refresh — PASS (user report, 2026-11-06)

The user submitted a fresh sanitized report from the existing HR account identified by the user as belonging to Amalia P. Señagan. It contains `checkpoint: CP-TL-03C-STAGE-A-SIGNED-READ`, `status: PASS`, `scenario: BOARD_MANAGER_DENIED`, with **all six checks PASS**: `signed-identity`, `effective-access`, `document-list`, `missing-document-read`, `wrong-board-denial`, and `stable-session`. It explicitly states `writesAttempted: 0` and `documentsDisclosed: 0`. This proves the expected non-manager access denial only within the submitted application's genuine signed-session evidence boundary; the assistant did not independently control the user's browser or authenticate the human account holder.

**Independent authorization baseline on this turn:** Read-only PostgreSQL confirmed `has_function_privilege('authenticated', 'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)', 'EXECUTE') = false` and `has_function_privilege('authenticated', 'public.tl03_documents_list(uuid,integer)', 'EXECUTE') = true`. An earlier more comprehensive read-only query was blocked by tool safety checks; do not assert a fresh full 15/15 preflight or zero row counts from this turn. The prior 15/15 Stage A preflight and run #16 disposable rollback PASS remain established historical evidence.

**Disposition:** Fresh Phase 2 signed-read acceptance for the two required existing roles — `AUTHORIZED_MANAGER` and `BOARD_MANAGER_DENIED` — is **2/2 VERIFIED (user-submitted application reports)**. This is **not** global authorization certification: genuine foreign-workspace test remains **BLOCKED** (no active foreign member), revoked/expired production bearer checks **PENDING**, and actual persisted-row RLS isolation **NOT EXERCISED** because no production document fixture was written. Stage B remains **NO-GO / NOT AUTHORIZED** until current backup recoverability, security/change ownership and a separately explicit production write-EXECUTE approval are established. No production data writes, session/role changes, permission modifications or recovery actions were performed during this acceptance.

**Next required gate:** `CP-TL-03C / Phase 3 — Stage B Production-Change Approval and Recovery Readiness Decision`. This is an **approval and evidence gate**, not permission to execute `GRANT`. Prepare the exact change ticket and recovery plan; request separate approval before activating Stage B or creating production test records.
