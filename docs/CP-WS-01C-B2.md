# CP-WS-01C/B2 — signed member workspace discovery readiness

**State, 2026-11-05:** READ-ONLY B2 PRODUCTION PREFLIGHT VERIFIED. DISCOVERY EXECUTE GRANT NOT APPLIED. No production permission change in B2.

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
