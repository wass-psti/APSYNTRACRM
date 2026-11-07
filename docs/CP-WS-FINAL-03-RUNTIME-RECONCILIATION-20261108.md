# CP-WS-FINAL-03 — Production Runtime Reconciliation and Workspace Acceptance Boundary

**Date:** 2026-11-08 (Asia/Manila)  
**Scope:** Accepted Workspace Per-User functionality in APSYNTRA CRM  
**Evidence baseline:** `main` at `7ba679f1ab5f017532c8a96cc51c095215ede187`  
**Decision:** **Per-user visibility and existing workspace lifecycle can remain in service. Full workspace switching, configuration persistence, and invitation delivery are NOT live-accepted and must NOT be activated as part of cleanup.**

## 1. Verified deployment and source concordance

The following deployed GitHub Pages frontend files were retrieved over HTTPS with a cache-busting query and compared byte-for-byte with the checked-out `main` source:

| Asset | Result |
| --- | --- |
| `frontend/app.js` | EXACT MATCH |
| `frontend/workspace-ui.js` | EXACT MATCH |
| `frontend/workspace-lifecycle-client.js` | EXACT MATCH |

The signed APSYNTRA CRM Security page was readable through the existing browser context and displayed a connected workspace, a live signed session, and existing workspace security acceptance controls. The page inspection did **not** click controls, switch users, authenticate another user, create a record, or run an independent cross-workspace HTTPS test.

**Frontend activation constants verified in source and deployed bytes:**

| Capability | Configuration |
| --- | --- |
| Signed membership discovery | `WS01_DISCOVERY_ENABLED=true` |
| Signed workspace creation | `WS01_CREATION_ENABLED=true` |
| Workspace switching | `WS01_SWITCHING_ENABLED=false` |
| Configuration read/update | `WS01_CONFIGURATION_ENABLED=false` |
| Invitation delivery | No enabled send operation from the workspace dialog; the Send button remains disabled |

No frontend override of these safety boundaries was attempted.

## 2. Authoritative live database observations — read only

Using the already authenticated Supabase CLI v2.121.0 on the authorized Mac, explicit project ref `jtlusodorfnyzgyuewkz`, and `supabase db query --linked --project-ref ...`, read-only PostgreSQL catalog queries returned:

| Live contract or invariant | Observed state |
| --- | --- |
| Workspaces | 3 |
| Active workspace memberships | 41 |
| Workspace creation feature flag | true |
| Workspace selection feature flag | false |
| `public.wm_ws01_list()` | Installed; `authenticated` EXECUTE true, `anon` EXECUTE false |
| `public.wm_ws01_create(text,text,uuid)` | Installed; `authenticated` EXECUTE true, `anon` EXECUTE false |
| `public.wm_ws01_select(uuid,uuid)` | Absent |
| `public.wm_ws01_config_read(uuid)` | Absent |
| `public.wm_ws01_config_update(uuid,text,text,bigint)` | Absent |
| `private.ws02d_issue(uuid,text,text,uuid)` | Absent |

Both installed RPCs are `SECURITY DEFINER`. This observation confirms *grants and catalog presence*, not their full runtime authorization behavior. `SECURITY DEFINER` routines still require server-enforced signed identity and role checks.

RLS was enabled on `public.workspaces`, `public.workspace_members`, `private.ws01_member_roles`, `private.ws01_workspace_policy`, and `private.ws01_lifecycle_flags`. Table-level RLS enablement does not by itself certify individual policy correctness, foreign-workspace denial, or all delegated SQL callers.

The queries returned counts and metadata only: no user identities, JWTs, personal data, role changes, writes, audit exports, or destructive SQL.

## 3. Regression results and scope

- Current-checkout Node syntax checks: `frontend/app.js`, `frontend/workspace-ui.js`, `frontend/workspace-lifecycle-client.js` — PASS.
- Current-checkout targeted workspace tests: `node --test frontend/tests/workspace*.test.mjs` — **76 passed / 0 failed**.
- Earlier PR #69 full local frontend test evidence: **1,165 passed / 0 failed** on the reconciled main baseline; no new full-suite run was necessary for this read-only reconciliation.
- Earlier PR #69 checks: `CP-WS-01C/B3 Controlled Workspace Create UI` and `CP-WS-01 Create Modal Safety and Readiness UI` — SUCCESS.
- The source-preserving cleanup PR #69 was merged before this reconciliation. No application runtime code changed during CP-WS-FINAL-03.

These tests protect supported frontend and disposable backend contracts but do **not** prove a production signed-user switch or update that the live RPC catalog cannot support.

## 4. Feature classification

| Requirement | Classification | Evidence and limitation |
| --- | --- | --- |
| Per-user workspace visibility and browsing | **USER ACCEPTED; SOURCE + LIVE RPC PRESENT** | Signed discovery wired to `wm_ws01_list`; independent browser button execution was not performed in this gate |
| Workspace creation | **BACKEND ACTIVATED; FULL NEW-WRITE ACCEPTANCE NOT REPEATED** | Live `wm_ws01_create`, signed grant and creation flag confirmed |
| Signed identity / membership boundaries | **FOUNDATIONAL ENFORCEMENT PRESENT; DEEP CROSS-USER ACCEPTANCE PENDING** | RLS on relevant tables and signed RPC constraints; independent foreign-user HTTP denial not executed |
| Workspace switching | **NOT ACTIVATED** | Both deployed frontend gate and live backend flag are disabled; selection RPC absent |
| Persistent selection across sessions | **NOT VERIFIED / UNAVAILABLE THROUGH STAGED SWITCH** | Cannot be claimed without a live selection contract |
| Owner configuration persistence | **NOT ACTIVATED** | Frontend flag disabled, read/update RPCs absent; current UI draft validation is not a saved update |
| Invitation delivery | **NOT ACTIVATED** | No enabled browser send or private issuer RPC |
| Other APSYNTRA CRM boards/modules | **NO CODE OR DATABASE MODIFICATION** | Prior frontend regression passed; browser-level cross-module acceptance was not repeated |
| H3 source-faithful hardening and independent signed denial | **PENDING** | Prior H3 provenance passes do not constitute full 73-caller hardened runtime or two-user signed HTTPS acceptance |

## 5. Completion decision and security boundaries

**Accept the currently supported Workspace Per-User discovery/creation subset for continued use**, consistent with the user's confirmation and the observed signed backend. **Do not certify full configuration, persistent switching, or invitation delivery**: they remain distinct approved-scope work requiring actual backend installation, grants, protected function compatibility, independent signed-session tests and **separate explicit production-activation authorization**.

No new migrations, feature-flag changes, role grants, account creations, membership updates, invitations, deletions, audit changes, or production database writes were performed. Previously blocked B2 acceptance-panel removal was not revisited; security regression fixtures, RLS, RBAC and test interfaces were preserved.

**Final CP-WS-FINAL-03 result:** **RUNTIME RECONCILED — SUBSET ACCEPTED — FULL PRODUCTION FEATURE ACCEPTANCE BLOCKED.** There is no evidence-based percentage for the unactivated capabilities. Avoid adding another cleanup/testing milestone merely to relabel this state; only revisit if explicitly extending/activating the missing backend capabilities with the required security evidence.
