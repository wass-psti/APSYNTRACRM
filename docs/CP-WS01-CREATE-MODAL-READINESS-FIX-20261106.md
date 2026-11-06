# CP-WS01 — Workspace creation dialog: verified safe UI repair

**Date:** 2026-11-06 (Asia/Manila)  
**Scope:** User-reported "Add new workspace" modal at APSYNTRA CRM Security view.  
**Decision:** **Fix the modal layout and misleading submission affordance; preserve the default-off production workspace creation gate.**

## Observed defect

The supplied page screenshot shows a narrow workspace creation dialog with the Cancel/Review readiness footer visually cramped and a draft-style name/privacy form that can be mistaken for an active workspace creation flow. The current implementation only validates the fields; it cannot save a workspace.

## Verified production backend contract (read-only)

The existing production query `sql/tests/cp-ws01c-b3-production-readonly-preflight.sql` on project `jtlusodorfnyzgyuewkz` returned:

```text
B3_PREACTIVATION_SCHEMA_READY__ROLE_CEILING_AND_PRODUCTION_APPROVAL_PENDING
six_private_tables_default_deny=true
private_rls_policies_absent=true
existing_session_guard=true
existing_workspace_resolver=true
b2_signed_discovery_grant_unchanged=true
b3_functions_not_installed=true
b4_switching_not_installed=true
direct_workspace_creation_denied=true
lifecycle_flags_disabled=true
prior_create_requests=0
prior_workspace_events=0
```

This confirms the private schema readiness and that production **workspace creation is not authorized or installed**. No production SQL was changed. The staged server candidate `sql/cp-ws01c-b3-create-contract-candidate.sql` is **disposable-only / default-off** and explicitly does not grant authenticated EXECUTE. Applying it, altering grants, or enabling flags is a separate security-sensitive approval and acceptance gate.

## Changes implemented (frontend only)

1. **Clear mode and outcome:** Dialog states workspace creation is unavailable, uses **Validate draft** rather than a create/save action, and returns `PENDING_SERVER_ACTIVATION` or `INVALID_DRAFT` with an explicit **No workspace was created** statement. It does **not** invoke or probe a mutating RPC.
2. **Privacy-by-default:** New drafts select **Closed**. "Open" is explicitly described as metadata only, never public discovery, invitation, admission or access bypass.
3. **Robust validation:** Name length/control/markup restrictions remain in `validateWorkspaceProposal`. The draft form uses `novalidate` so the same safe message is exposed through an aria-live status; any new input clears stale feedback.
4. **Modal layout:** Namespaced footer styles set flex sizing, wrapping, predictable font/line height and touch targets, with a two-column mobile grid, bounded dialog scroll for short viewports, no clipped action labels, and preserved keyboard focus/ESC handling.
5. **No security relaxation:** `WS01_CREATION_ENABLED=false`, no workspace switching/discovery authorization change, no new role, token, secret, RLS/GRANT, project, background monitor or domain write.

## Acceptance evidence

[Create-modal CI workflow 42179877971](https://github.com/wass-psti/APSYNTRACRM/actions/runs/42179877971): **SUCCESS**, 25/25 targeted workspace/lifecycle tests, **1,083/1,083 full frontend tests**, public-only credential verification and Node source syntax. Live signed workspace creation was **not tested or enabled**; UI visual regression requires main-branch Pages validation or an actual browser screenshot.

## Next required gate for functional workspace creation

**CP-WS-01C/B3 — Controlled signed workspace creation contract activation and genuine owner/member read, idempotency, role-limit and privacy isolation acceptance**. Before changing production SQL, EXECUTE grants, roles, or lifecycle flags, obtain the required separate security/operational approval and ensure fresh session, RLS, foreign-user denial and rollback readiness. No authorization to bypass this gate is inferred from a request to repair a dialog.

**Rollback:** The UI changes can be reverted without database migration because no database or deployed RPC was changed.
