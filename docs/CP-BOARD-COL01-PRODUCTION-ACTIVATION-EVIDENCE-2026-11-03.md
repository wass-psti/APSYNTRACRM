# CP-BOARD-COL01 — Production activation evidence packet (pre-activation)

**Captured:** 2026-11-03 (Asia/Manila; database snapshots 00:21–00:23 UTC).  
**Decision: NO-GO — PREPARATION ONLY.** This record documents verified evidence and unresolved prerequisites. It is **not** independent approval, signed-cloud acceptance, separate permission-change authorization, or proof of an activated production release.

## Scope and immutable sources

- **Only connected Supabase project:** WatchdogWorkspace `jtlusodorfnyzgyuewkz`; GitHub Pages remains the frontend. No new Supabase project is requested.
- **Previously validated application candidate commit:** `4a451ab5f2571ae7950a1284e00927808c672b37`.
- **Staged activation candidate:** [`sql/cp-board-collab01-authorization-candidate.sql`](../sql/cp-board-collab01-authorization-candidate.sql), Git blob `99ee7f1f9ea24e2019214470f7a2390dd6013ec5`.
- **Guarded rollback:** [`sql/cp-board-collab01-rollback.sql`](../sql/cp-board-collab01-rollback.sql), Git blob `5dc3887207442bc7194750d3ad3fb2b7338936a4`.
- **Original live preflight:** [`sql/cp-board-collab01-production-readonly-preflight.sql`](../sql/cp-board-collab01-production-readonly-preflight.sql), Git blob `2e77991d420c784000df5626e4a86c8b49353379`.
- **New reproducible fixture-readiness query:** [`sql/cp-board-col01-production-test-prerequisite-readonly.sql`](../sql/cp-board-col01-production-test-prerequisite-readonly.sql), Git blob `461966bdf667898a16549ce9dc8f20869d88d7ec`, commit `a9b26e6643a2eca7ec0b9fd7254f8a5dabad9f49`.
- **New post-activation read-only checker:** [`sql/cp-board-col01-production-postactivation-readonly.sql`](../sql/cp-board-col01-production-postactivation-readonly.sql), Git blob `122ac9f2346e141edf861a83c1e81016ea9a1403`, commit `dce190a8b117a901ded0708aad6b9a25349e4909`.
- **Release procedure:** [`docs/CP-BOARD-COL01-ACTIVATION-AND-INDEPENDENT-REVIEW.md`](CP-BOARD-COL01-ACTIVATION-AND-INDEPENDENT-REVIEW.md).
- **Review control:** parent [Issue #28](https://github.com/wass-psti/APSYNTRACRM/issues/28), independent review [Issue #29](https://github.com/wass-psti/APSYNTRACRM/issues/29).

## Evidence ledger — actually executed

| Gate / control | Verified evidence | Classification |
| --- | --- | --- |
| Production preflight | `PREFLIGHT_SCHEMA_PASS_WITH_SIGNED_SESSION_GATE_PENDING`; no original writer hash drift; no direct authenticated table read grants; target RLS on; no detected foreign/inactive board memberships or explicit viewer/editor ceiling conflicts | **VERIFIED — PREACTIVATION ONLY** |
| Writer source integrity | `md5(pg_get_functiondef('public.wm_add_board_member(uuid,text,text)'::regprocedure)) = 0dde086a58def1dd5437b32264c0697a` | **VERIFIED** |
| Five candidate objects | Session helper, directory, item-update reader, file reader and event-page reader absent from live production | **VERIFIED NOT ACTIVATED** |
| Live schema readiness | 2 workspaces, 74 boards in one workspace; the other workspace contains 0 boards and 0 active workspace members; 3/3 expected `auth.sessions` columns present | **VERIFIED — FOREIGN FIXTURE BLOCKED** |
| Fixture readiness query | `BLOCKED_GENUINE_FOREIGN_WORKSPACE_FIXTURE`; grants and four restricted tables unchanged | **VERIFIED QUERY EXECUTION; BLOCKED GATE** |
| Postactivation query predeployment | `NOT_ACTIVATED`, five missing candidate objects and four restricted tables unchanged; **postactivation behavior not tested** | **VERIFIED PREACTIVATION BEHAVIOR ONLY** |
| Frontend/disposable CI | `4a451ab...`: [Actions run 41538224291](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41538224291) had successful frontend and disposable collaboration jobs. Frontend log: **373 tests, 373 passed**. Collaboration log: owner, membership/scope, simulated session revocation and rollback grants/data integrity PASS. [Pages run 41538223116](https://github.com/wass-psti/APSYNTRACRM/actions/runs/41538223116) completed build/deploy. | **VERIFIED FOR PRIOR CODE CANDIDATE; NOT SIGNED CLOUD ACCEPTANCE** |
| New SQL evidence files | Each SELECT-only query ran against live WatchdogWorkspace before commit. They were not added to the existing workflow paths; do not claim new post-commit CI for them. | **VERIFIED READ-ONLY** |
| Independent security review | Issue #29 open, unassigned, no signoff at last inspection | **PENDING** |
| Real signed HTTPS / expired and revoked bearer tokens | No designated credentials, independently approved fixture scope or real cloud PASS record. Existing runner mock tests are not live evidence. | **BLOCKED** |
| Production permission change and postactivation | No separate approval and **no production DDL**, role, session or account mutation executed by this checkpoint | **PENDING / NOT RUN** |

## Security Advisor review required

Supabase project-wide advisories at the preactivation inspection: 68 RLS-without-policy informational results; 9 mutable-search-path warnings; 3 anonymous-executable `SECURITY DEFINER` warnings; 268 authenticated-executable `SECURITY DEFINER` warnings; 1 leaked-password-protection warning. These are counts, **not 349 proven vulnerabilities**. The three anonymous-executable attestation functions are `public.wm_board_contract_attestation`, `public.wm_deployment_contract_attestation`, and `public.wm_item_workspace_recovery_attestation`. A qualified reviewer must inspect their result disclosure and privilege scope rather than assuming harmlessness or changing production grants without approval. Guidance: [Supabase Database Linter](https://supabase.com/docs/guides/database/database-linter).

## Minimum viable real signed-HTTPS prerequisites — approval-gated

The existing `scripts/cp-board-col01-signed-http.mjs` checks two **distinct actual GoTrue users** with role differences on a home-workspace board, plus a **real foreign-workspace board**; it tests logout and expiry against new COL01 endpoints. That foreign board does not exist today.

1. **Obtain an independently reviewed fixture plan.** Preferred isolated signed test identities: a designated manager and a designated nonmanager in the existing board workspace, and a designated foreign-workspace fixture owner with an active membership and a board in the second workspace. If already-authorized, dedicated disposable identities exist, verify their intended scope rather than re-creating them. The current aggregates **do not prove any such identities are available**.
2. **Separate explicit authorization is required** before adding production GoTrue users, workspace memberships, platform/board roles, a foreign-workspace board, or test records; likewise before revoking even a test session. This is still one Supabase project. Do **not** repurpose real employee sessions or production business boards as destructive test fixtures. Plan auditable teardown without deleting legitimate data or audit.
3. **Handle test secrets privately.** Use only the project publishable key and approved secret manager for the two dedicated signed test identities and near-expiry JWT. Never commit/paste credentials, bearer tokens, user emails or internal UUIDs into public GitHub issues. Do not use a service-role key in the frontend or tests.
4. **Acceptance execution order must be independently approved.** The COL01 endpoints are not in production, so true revocation/expiry against them cannot happen **before** production activation without a nonproduction deployment. With a one-project constraint, a qualified reviewer must explicitly approve or reject a **conditional, tightly controlled production transaction followed by immediate signed acceptance and rollback on failure**. Passing disposable CI does not remove this elevated risk.
5. **Fill runner coverage gaps.** The current runner tests board-access role/foreign denial and the new event reader under logout/expiry; it does **not** by itself attest manager-only invitation directory, update/file metadata scope, real concurrent invitation/revocation or complete Storage operations. Require separate approved signed acceptance evidence for these routes before final release certification.

## Nonnegotiable stop / rollback conditions

- Stop for changed original writer fingerprint, unexpected candidate objects, broadened table/anon grants, failed RLS check, missing backup/rollback readiness, stale code SHA, unresolved independent review, or approval absent.
- Stop for cross-workspace data exposure, nonmanager invitation/privilege escalation, previously revoked real JWT success on protected endpoints, fail-open expiry, incorrect owner ceiling, failed audit or any unexpected signed Pages regression.
- A rollback must use the reviewed transaction and recheck original writer source MD5, grants and data counts. **Known rollback risk:** the exact original writer has a weaker same-workspace/owner protection model; require independent acceptance or a separately approved fail-closed fallback before relying on rollback.

## Decision record

**Release: NO-GO.** The original nine-gate score remains **4/9 verified (44%)**: staged candidate, frontend CI, disposable database acceptance, and production read-only preflight. This packet and the new evidence queries improve preparation but do not independently satisfy security signoff, signed HTTPS verification, separate permission approval, activation or postactivation acceptance.

**Next real progression gate:** an independent reviewer records an evidence-backed disposition in [Issue #29](https://github.com/wass-psti/APSYNTRACRM/issues/29), including whether any one-project production test-fixture changes and a conditional postactivation test order are acceptable. **No production change is authorized by this file.**
