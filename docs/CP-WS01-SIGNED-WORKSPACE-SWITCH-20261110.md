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

## CP-WS01-PROTECTED-SIGNED-CUTOVER — fresh live preflight (2026-11-10)

**Release NO-GO: no production mutation.** The user explicitly requested the
protected switching cutover; technical acceptance remains mandatory because
current_workspace_id is a shared authorization boundary.

Fresh read-only production catalog checks:

- wm_ws01_select(uuid,uuid) absent; ws01_prune_session_choices() absent.
- Private session-choice and flags tables present, selection_enabled=false,
  with **zero active choice rows**.
- 43 active workspace memberships across 41 distinct users; two accounts
  have multiple active workspace memberships.
- The existing user associated with the requested Work Management invitation
  has active memberships in both Main Workspace and Work Management.
- Current production resolver SHA-256 is
  17495f42a737de0e59f6ca4b2b36f6f02bd0647e08b0db9a358a9eac48e75e92.
- All **74** expected protected function definitions exist. Comparing live
  SHA-256 fingerprints with the committed H3/G4B/G4C manifest returned
  **72 exact matches, two changed definitions, zero missing**:
  - public.wm_auth_access_context():
    live b73a1b4e3bb10f8412405cea38a95c870ca26d45dc8d60154f91957b1fcd376b
    versus pinned 7b60bbc93690cbdf34c9db2e7c541e1a563a385aeeae75642fb1c2e6e7eb49d7.
  - private.tl03_commit(...):
    live 08da27924332a9cd8290ff6e7e379308567e6f26f1ae5e6ac443c412489ac618
    versus historical
    5fb4ac5d256746444786826d8128abdcfa5c54ecbe145aff5fd55fa25a89119d.
    The TradeLink evolution was previously documented; its live source
    still needs execution evidence under the proposed resolver.
- Additional source search found 65 functions currently referencing the
  shared workspace resolver; this is not an exhaustive substitute for the
  73-unique-caller protected dependency inventory.
- Browser inspection shows the existing Employee signed into APSYNTRA CRM
  with the disabled switch control. Connected browser inspection is
  read-only; the authorized local Chromium active tab was unrelated and
  contained no APSYNTRA session, so **no signed RPC acceptance was executed
  in this increment**.

The earlier owner-led readiness review explicitly requires **source-faithful
execution of 73 affected caller paths in protected isolated PostgreSQL 17**
(including actual role-delegation behavior and denied/expired/revoked-session
outcomes) plus a demonstrable database **and Storage** recovery rehearsal
against RPO/RTO 24h. The available synthetic disposable SQL tests and
source fingerprints do not satisfy those runtime/recovery gates.

The migration has **not** been applied: no changes to
public.current_workspace_id, grant/EXECUTE state, lifecycle flags, active
workspace choices, role or membership rows, or frontend deployment.
PR #206 must remain draft. Next execution must reconcile both live changed
definitions, run protected source-faithful caller and recovery acceptance,
then perform the controlled signed cutover and release only if those gates pass.
