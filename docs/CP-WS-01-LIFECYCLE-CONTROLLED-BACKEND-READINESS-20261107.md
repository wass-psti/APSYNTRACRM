# CP-WS-01 — Controlled workspace selection, owner configuration, invitation readiness

**Status:** Nonproduction candidate and disposable acceptance only. **Production activation: NO-GO without separate explicit approval.**

## Existing implementation and newly added contract

| Capability | Repository implementation | Production availability |
| --- | --- | --- |
| Signed membership discovery | `public.wm_ws01_list()` and `WorkspaceLifecycleClient.discover()` | Activated; only authorized memberships are returned |
| Workspace selection | `sql/cp-ws01b-session-cutover-candidate.sql`, `wm_ws01_select`, session choices and stale-context CAS | **Not installed/activated**; selection flag false, no signed-client grant |
| Owner workspace configuration | `sql/cp-ws01-config-update-dormant-candidate.sql`: `wm_ws01_config_read` and `wm_ws01_config_update` with private revisions, auditable before/after and no-op/CAS | **Not installed/activated**; independent config flag false and no signed-client grants |
| Invitation issuance and acceptance | Existing `sql/cp-ws02d-invitation-*-candidate.sql` and disposable issue/accept/revoke/rate-limit tests | Not activated; no browser direct issuer grant |
| Trusted invitation delivery | Existing `server/ws02d-trusted-delivery.mjs`, `server/ws02d-invitation-http-boundary.mjs`, provider receipt and signed-actor verifier tests | **Not deployed/activated**; email/provider secrets remain server-side and no delivery is claimed |

### Owner configuration contract

The new candidate creates only isolated PostgreSQL 17 objects under the existing workspace domain:

- `private.ws01_config_flags` with `enabled=false` by default.
- `private.ws01_config_revisions` with a per-workspace monotonic revision; legacy rows read revision 1 until an authorized write.
- `private.ws01_config_events` with actor/session, prior/new revision, and before/after name/privacy, for audit and reversible reconciliation.
- `public.wm_ws01_config_read(p_workspace_id uuid)` returns caller-member-scoped metadata, revision, and a server-derived `canEdit`.
- `public.wm_ws01_config_update(p_workspace_id uuid,p_name text,p_privacy text,p_expected_revision bigint)` requires a genuine current GoTrue session, active membership and explicitly stored `owner` relation. It locks the session, membership, owner role and workspace/policy rows, validates names/privacy, rejects stale revisions, and atomically updates data plus audit.

**Security invariants:** No owner is inferred for legacy workspaces. No arbitrary user ID, role hint or client workspace header is trusted. Membership in a workspace is insufficient to edit it. Privacy `open` is descriptive metadata, not a public-join/access grant. Direct client table and RPC grants remain revoked in the dormant candidate. Private tables have RLS enabled. Owner configuration does not switch the active workspace.

A future supported browser integration must obtain the server-supplied revision from a newly authorized `config_read`, submit the exact expected revision with an update, independently re-read signed configuration, and handle 409/stale, revoked, and uncertain failures without treating an unconfirmed write as successful. The typed `WorkspaceLifecycleClient` adapter is intentionally default-off.

## Disposable acceptance

The current `.github/workflows/cp-ws01b-disposable-postgres.yml` exercises the **existing** signed selection and invitation contracts and then installs the dormant config candidate after the established board/domain regression suite. The configuration acceptance test grants and sets its flag only **inside a rolled-back disposable transaction**. It checks:

- Default-off configuration RPC/feature flag, private table RLS and no `anon`/`authenticated` direct table access.
- Authorized owner read, safe no-op, name/privacy CAS update, immutable revision monotonicity and exactly one private audit.
- Invalid name/privacy, stale revision, ordinary member, foreign workspace, borrowed session, expired session and unsigned identity denial.
- Post-rollback restoration of the original name/session and zero config audit/revisions/grants.

No real users, messages, emails, production session changes, data migrations or permission changes are performed by these tests. The selection and invitation suites demonstrate **synthetic isolated behavior**, not a production readiness certificate.

## Outstanding activation blockers

1. **Shared authorization:** The pre-existing `current_workspace_id(uuid)` contract is used by 63 database routines and has outstanding G4C-R source-faithful delegated-caller review. Do not cut over the session-authoritative lookup or turn on B4 selection before dependent caller and denied cross-user regressions pass. The old cross-user workspace-lookup exposure is not fixed by this new configuration candidate.
2. **Source/rollback provenance:** Reconcile the current production function definitions, ownership, ACLs, policies, table schemas and source fingerprints before preparing a controlled reversible change. Retain exact rollback definitions in access-controlled storage, never a public repository. Verify backup/recovery evidence.
3. **Configuration migration:** Independently review the audit schema, default-off flag, owner mapping for genuine B3-created workspaces, private-table RLS and signed reads/writes. Stage in disposable/nonproduction before any separately authorized production schema installation.
4. **Invitations:** Confirm trusted backend runtime, verified GoTrue sessions, provider configuration held server-side, delivery receipt/idempotency/retry ceilings, recipient acceptance, revocation, anti-spam and domain role ceilings. Never send emails from the GitHub Pages browser or expose tokens/provider credentials.
5. **Signed HTTPS acceptance:** Obtain legitimate existing signed-user checks for owner, member, foreign workspace, revoked/expired sessions, stale revision, session switch/fresh context, permission isolation and invite roles, without creating test accounts or changing production permissions to manufacture a PASS.
6. **Separate approvals:** Production DDL, grants, flags, role changes, delivery provider activation, and any production records require distinct explicit approval, owner, backup evidence, rollback plan and release window. Do not bypass repository protections or CI.

**Decision: NO-GO for production activation.** Continue disposable acceptance and compatibility remediation without modifying the single existing Supabase production project. A green build is necessary but not sufficient for production security closure.
