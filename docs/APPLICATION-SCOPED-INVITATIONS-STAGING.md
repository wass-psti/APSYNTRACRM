# Application-specific invitations — staged UI and signed administrative role management

Status: **REVIEW CANDIDATE; application-access UI is OFF by default. No new production permissions or RPC grants.**

## Purpose
A Monday.com-style "Invite to this application" dialog for APSYNTRA CRM applications, distinct from workspace email invitations and board Viewer sharing.

- Dark modal, searchable People tab, explicit application role selector, existing assignments, add/update/remove controls, protected identities.
- Teams tab is visibly unsupported until a signed workspace-group directory and group-to-module authorization model exist.
- Search lists only users returned in an authorized workspace-scoped administrator snapshot. It does not enumerate Supabase Auth users directly.
- A workspace invitation admits a user to a workspace; an application role must be assigned separately. Board membership does not grant an application role.

## Existing backend contracts reused (no new SQL)
- Authoritative signed manager snapshot: public.apsyntra_role_user_management_snapshot, via UserRoleManagementClient.snapshot().
- Live signed mutations use **workspace-scoped, module-specific** RPCs already wrapped by UserRoleManagementClient:
  - setScopedSixRole — time-tracker, fueltrack-plus, tradelink, order-intake, employee-eval, aps-aims
  - setFrtWorkspaceRole — fund-released-tracker
  - setToolTraceabilityWorkspaceRole — tool-traceability
  - setFueltransWorkspaceRole — fueltrans
  - setCharterWorkspaceRole — charter-navigator
- App roles and revisions are read back after each mutation. Unexpected, denied, stale or ambiguous results do NOT produce a success indication.
- No global module_role_assignments write, service role, raw table mutation, browser role authority, invitation token, or automatic board grant.

## Gating
- APPLICATION_ACCESS_DIALOG_ENABLED=false. Do NOT set true until the relevant production RPC signatures, scope enforcement, role limits and signed-user negative tests pass.
- Opener requires state.adminVerified=true plus a signed current workspace and a recognized app board. On every read/write, auth user, workspace, module and board are rechecked.
- Admin scope is deliberately narrow. Non-admin application-owner delegation requires a separate signed owner-management contract and tests; do not infer it from board ownership.
- FM1 and modules lacking a reviewed workspace-scoped role setter are deliberately unsupported in this initial UI.
- Teams/Agents and external email onboarding remain separate future capabilities.

## Required acceptance before activation
1. Verify exact backend production RPCs for each selected module and selected workspace; inspect workspace membership and CRM-role ceilings.
2. Test real CRM administrator grant, role change and revoke to a non-protected existing workspace user, with server readback and fresh sign-in.
3. Test employee, viewer, foreign workspace, revoked session, cross-application, protected admin/self-mutation, stale revision, and role elevation denials.
4. Verify each app's domain reads, exports, Realtime and Storage respect effective access, including after revocation.
5. Validate responsive modal, search, Escape, focus trap, protected identities and keyboard operation.
6. Re-run frontend tests and exact-order CSS bundle verification. After acceptance, activate the UI in a separately reviewed commit.

## Out of scope
- New account invitations and SMTP delivery (separate WS02D project, not yet production-activated).
- Team assignment, cross-company guest access, transfer of application ownership.
- Changes to existing database RLS, Auth providers, service role secrets or production feature flags.
