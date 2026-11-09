# CP-WS-02D/D — Production activation preflight (2026-11-09)

**Scope:** existing WatchdogWorkspace Supabase project `jtlusodorfnyzgyuewkz` only. No parallel project, credentials or permissions were created.

## Verified live facts

- PostgreSQL 17.6; `public.workspaces`, `public.workspace_members`, `public.profiles`, `private.ws01_member_roles` and `private.ws01_signed_actor_session()` exist. Original claim that `ws01_member_roles` is absent was corrected after inspecting the live catalog.
- `private.ws02d_invitations`, `private.ws02d_invitation_flags`, and issue/accept/revoke/decline/expire WS02D RPCs are not installed in production. Thus the signed issuance and recipient acceptance contracts are not live.
- Supabase Edge inventory currently includes `apsyntra-ws02d-b3-read` but not `ws02d-invite` or `ws02d-accept` at initial inspection.
- Supabase physical backup listing: latest completed entry `2026-11-08T17:17:15.467Z`; `pitr_enabled=false`, `walg_enabled=true` as reported by the existing project CLI. A completed backup is not a verified successful database or Storage restore rehearsal.
- Existing project-wide recovery targets: RPO 24 hours, RTO 24 hours; genuine rehearsal is mandatory, including Storage coverage, and no second Supabase project. No verified provider-supported isolated restore or Storage rehearsal result was found during this execution.

## Safe route reservation (this increment)

`supabase/functions/ws02d-invite/index.ts` and `supabase/functions/ws02d-accept/index.ts` use a shared immutable fail-closed handler, with origin allowlisting and no-body processing. Both remain HTTP 503 for permitted POST requests, do not invoke SQL, Auth role mutation or email delivery, and use normal JWT verification in the Edge gateway. These routes are **not** a claim that invitation sending or acceptance is operational.

## Required before opening mutations

1. Document a genuine isolated physical backup restore and Storage recovery rehearsal meeting the existing targets (or obtain an explicit change to the recovery policy). Never restore a backup over production as a rehearsal.
2. Reconcile candidate SQL and authorization surfaces against the verified current live schema, role assignments, active workspace authority and all board/domain mutation ceilings. Stage additive SQL with flags false; no public/private unintended EXECUTE grants.
3. Verify provisioned trusted server credentials and approved mail sender/domain, then bind the signed server to private-issued, actor-scoped transactions, provider receipt audit and recipient-authenticated accept/decline. Use GoTrue `getUser` and verify live `auth.sessions` on every mutation.
4. Test genuine owner/nonowner, foreign workspace, revoked session, wrong recipient, duplicate, expiry, decline, delivery failure and replay. Activate the browser flags only after verified live signed acceptance.

No real invitations, permission changes, Storage mutations, new users, or production DB DDL are performed by this branch.
