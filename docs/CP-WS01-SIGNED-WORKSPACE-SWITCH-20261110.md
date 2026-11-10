# CP-WS01 — Restore workspace switch (staged release)

**State: frontend implemented/tested; production switch NOT ACTIVATED.**

## Root cause

The user-facing Switch workspace — unavailable is deliberately controlled
by WS01_SWITCHING_ENABLED=false. Production Supabase presently has:
- private.ws01_session_choices: present
- private.ws01_lifecycle_flags: present, selection_enabled=false
- private.ws01_signed_actor_session(): present
- public.wm_ws01_select(uuid,uuid): ABSENT
- private.ws01_prune_session_choices(): ABSENT
- public.current_workspace_id(uuid): currently resolves earliest active member
  rather than the selected session-specific workspace.

Flipping a client-only flag is insufficient and must not be shipped alone.

## Scope of this feature branch

1. Enable the frontend's existing signed workspace-switch selection on the
   unreleased feature branch. The lifecycle requires signed Auth identity,
   an active profile, a fresh server member catalog and expected-current
   workspace. Server CAS and post-selection context verification are required.
   After success the frontend reloads to discard old workspace scope state.
2. Preserve denial/retry feedback. No caller-controlled workspace headers,
   local-only context override, direct table access or role change.
3. Stage narrow backend activation and emergency-disable scripts.
   Activation checks required server functions and membership-revocation
   trigger, then grants only the wm_ws01_select RPC to authenticated and
   activates the server selection flag. Direct table privileges remain revoked.
4. The existing cp-ws01b-session-cutover-candidate.sql must be deployed first,
   after separate database authorization. It changes the shared
   current_workspace_id resolver and installs signed selection and pruning.
5. Extend isolated PostgreSQL CI to test activation/rollback in a
   disposable fixture, then the existing foreign-workspace, stale-CAS,
   independent-session, expired/revoked session and membership-denial tests.

## Required protected release sequence

1. Obtain separate approval for production current_workspace_id replacement,
   selection function installation, authenticated EXECUTE grant, and active
   selection flag (these are production authorization/architecture changes).
2. Review the resolver's dependent Board and module reads and verify the
   existing recovery plan.
3. Run disposable PostgreSQL and signed existing Admin/Member acceptance.
4. Controlled server cutover with protected signed-session verification.
5. Only after backend activation: merge and deploy this frontend feature.
6. If rolled back, emergency-disable revokes the RPC and prunes session choices
   to prevent future unintended reactivation.

## Production boundary and acceptance

This implementation made no production schema, grant, Storage, membership,
role, or deployment changes. Do not deploy the frontend flag alone.

A genuine user with two active memberships must select one and verify that
server context, authorized Boards and modules change after reload, then
switch back. Foreign workspace, stale CAS, expired session and revoked
membership actions must fail closed. Only then declare production acceptance.
