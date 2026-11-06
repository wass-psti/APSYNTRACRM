# CP-WS-01C/B4 — Owner Configuration Staging (No Production Activation)

**Baseline:** main `fb7bb9f8` (November 6, 2026). **Status:** staged candidate; production NO-GO.

## Existing boundaries

- The existing `sql/cp-ws01b-session-cutover-candidate.sql` stages server-authoritative selection behind a disabled flag and no authenticated grant. This increment does not activate it.
- The existing `sql/cp-ws02d-invitation-*.sql` stages private invitation issue, acceptance, revocation, and delivery boundaries. No live provider is enabled here.
- Workspace UI selection and invitation controls remain gated. Configuration remains draft-only until server activation and integrated signed-browser acceptance.
- G4C-R 63-caller source-faithful role-resolution verification remains an independent prerequisite to production selection activation.

## Implemented candidate

`sql/cp-ws01c-b4-owner-configuration-candidate.sql` stages `public.wm_ws01_configure(uuid,text,text,text,text)` with a real GoTrue signed actor/session check, active membership and explicit workspace-local owner authorization. It permits an owner to configure a nonactive owned workspace without switching the session.

The function acquires workspace, policy, membership and owner row locks; validates a 2–80 character name and open/closed privacy; uses expected name/privacy as optimistic CAS; atomically writes the name and privacy only when changed; and emits one scoped `workspace.configured` audit event for each actual update. It extends the existing event CHECK constraint. It creates no new workspaces or memberships, adds no public table grants, and does not enable any client EXECUTE privilege.

## Disposable verification

The existing PG17 workflow now installs the candidate after the existing create/select acceptance, then runs `sql/tests/cp-ws01c-b4-owner-configuration-disposable.sql` in a rollback-only transaction. Scenarios include default deny, signed owner update, fresh discovery, no-op, stale update, invalid inputs, foreign user, non-owner member, actor/session mismatch, expired session, and audit invariants.

**A passing disposable job is not production readiness.** The temporary test grant and mutations are rolled back. Live session, source-fingerprint, delegated 63-caller compatibility, browser and production rollback acceptance remain pending.

## Required separate activation

Reconcile current production metadata and function ownership/ACLs; complete G4C-R compatibility and signed negative scenarios; review the ALTER TABLE lock/constraint rollback, backup, change ownership and approved window; test the typed client and configuration UI against a trusted signed nonproduction endpoint; and obtain explicit approval for production schema/grant changes. Invitation delivery and TradeLink persistence remain separately gated.