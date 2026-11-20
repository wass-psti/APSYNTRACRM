# APSYNTRA CRM — Access Model V2 rollout, source mapping and visual acceptance

**Feature branch:** feat/access-three-layers-screenshot-v1-20261120  
**PR:** #676 (draft). Do not merge as full RBAC activation.  
**Architecture:** Production frontend remains vanilla JavaScript; an isolated React/Vite preview is in `access-preview/`. The current signed Supabase/PostgreSQL production authorization remains authoritative. The new SQL at `sql/ACCESS_MODEL_V2_REVIEW_ONLY.sql` is **not in auto-applied migrations** and is not deployed.

## What the four requested screens mean

**1. How access works.** The supplied specification describes an optional help/onboarding screen with an indigo eyebrow, a 34px heading, three equal cards, Board highlighted with a 2px indigo outline, plus a full-width "How they combine" panel. *The image was not attached; source-copy beyond the text cannot be verified.*

**2. User Role Management.** The visible screenshot is a light page with a 240px sidebar, 300px teams list, 20px gap, soft 96px cover, 72px avatar, Users/Board access tabs, a compact role table, board access rows, and a footer reminding admins that app roles are managed inside each app. This replaces the earlier full-screen dark Teams modal presentation while reusing signed backend data.

**3. Board Invite.** The supplied specification calls for a 680px modal with people and teams tabs, Viewer/Editor roles, protected owners, keyboard navigation and direct Viewer invitations. *The image was not attached; source-copy and positioning beyond the text cannot be verified.* Production Viewer-only signed invitations stay active; Viewer-to-Editor controls remain disabled until the server authorizes them. The policy row is read-only pending a server-approved public/private board policy endpoint.

**4. Application roles.** The visible screenshot is FuelTrans Standalone > Settings > Roles, 240px sidebar, 280px role list, 20px gap, role detail, six capability columns, real checkboxes, people chips, conditional unsaved footer. The generic React preview includes FuelTrans, Tool Traceability, Order Intake and TimeTracker with **illustrative** feature catalogs. Actual production app-specific role definitions and persistence require module owners to approve each capability map.

## Visual verification checklist

| Target | Expected reference | Implemented |
| --- | --- | --- |
| Global light page | #F7F8FC | React preview and scoped workspace CSS |
| Cards/sidebar | #FFFFFF | Both |
| Text | #1B1F3B, #4A5068, #5B6178 | CSS tokens |
| Borders | #E3E6F0, #C9CDE0 | CSS tokens |
| Accent | #4F46E5; tint #E8E7FD | CSS tokens and primary actions |
| Workspace sidebar | 240px | Preview and production workspace overlay |
| Workspace Teams list | 300px + 20px gap | Preview and production workspace overlay |
| Team header | 96px cover, overlapping 72px avatar | Preview and production workspace overlay (production avatar visual 80px including border) |
| Workspace table | 40px headings, 48px rows, ellipsis tooltips | Implemented |
| Workspace role pills | Member gray, owner indigo, System Admin orange | Implemented |
| Board access | Viewer/Editor only and team inherited rows | Preview; signed team RPC still staged in production |
| Board Invite | 680px, 14px radius, backdrop, People/Teams, protected owner | Preview; production render refreshed, unsupported writes disabled |
| App role list | 280px + 20px gap | React preview |
| Capability matrix | Six columns, 18px checkboxes, gray dashes | React preview, app-specific fixture catalogs |
| Chips/footer | 26px avatars, conditional Discard/Save | React preview |
| Responsive | Mobile stack, safe table scroll | CSS breakpoints |
| Keyboard accessibility | Buttons, explicit labels, Escape, combobox arrow/Enter | Preview and production (complete keyboard QA still required) |
| Error/load/empty | No synthetic data, retry and skeleton | Production signed workspace view; preview is deterministic sample data |

One deliberate mismatch: the workspace screenshot displays **4 boards** but exposes only **3 board rows**. The React preview reproduces that sample count; the production page uses the actual signed list count to avoid inventing a fourth board.

The screenshot does not establish actual approval permissions, precise server app role keys, deleted people, or board public-visibility policy. None of those can be inferred from pixels.

## Schema model

Tables in the review SQL: `access_v2.board_members`, `access_v2.board_team_access`, `access_v2.apps`, `access_v2.app_features`, `access_v2.app_roles`, `access_v2.app_role_capabilities`, `access_v2.app_role_members`, `access_v2.legacy_app_role_mappings`, `access_v2.audit_log`, plus revision tables. Reuse the separately staged system-scoped Teams, team-membership, explicit System Admin grant and inherited General administration design.

**Ownership** is a protected flag; Viewer and Editor are the only selectable board roles. A change resulting in zero board owners aborts with HTTP 409. System Admin is based on inherited membership in the ID-flagged General administration team or active explicit grants only, with a last-admin invariant. App administrator is a special application role (not a general CRM admin, department title, or automatic IT role). Every mutation is signed, revision-guarded, scoped and audited.

## Permission resolution pseudocode

```text
is_system_admin(user, workspace):
  ASSERT signed_actor == user AND active_membership(user, workspace)
  return inherited_is_system_team_membership(user, workspace)
         OR active_explicit_system_admin_grant(user, workspace)

effective_board_role(user, board):
  ASSERT active_member(user, board.workspace)
  if is_system_admin(user, board.workspace): return OWNER
  if protected_owner(user, board): return OWNER
  roles = direct_board_roles(user, board) UNION
          team_board_roles(active_team_memberships(user), board)
  if EDITOR in roles: return EDITOR
  if VIEWER in roles: return VIEWER
  return DENY

is_app_admin(user, app):
  return is_system_admin(user, app.workspace) OR
         member_of_active_app_admin_role(user, app.id)

has_app_capability(user, app, feature, capability):
  ASSERT feature + capability is in that app's approved catalog
  if is_system_admin(user, app.workspace): return true
  return any active app_role membership with an allowed capability

can_act(user, board, app, feature, capability):
  return effective_board_role(user, board) permits requested board mutation
         AND has_app_capability(user, app, feature, capability)
  // Server resolves both layers for operations where both apply.
```

**Critical note:** The shadow SQL functions do not yet replace existing board/workspace/module policies. They are a migration target, not active security.

## Preserve existing users and permissions: required migration

1. **Inventory real production grants** per verified workspace, board, active user and each application. Record all foreign keys, board owners, effective `allowed()` behavior and historical audit, but never export passwords/secrets. Snapshot membership and effective access with an authenticated per-user acceptance harness.
2. **Preserve the source identities and role keys**. Use stable app IDs, role keys, and role records scoped to each app; do not normalize away legacy keys such as `employee`, `ADMIN`, `REQUESTOR`, `global_l1_support`. Seed each application's capability catalog from its actual, independently approved server-side domain checks, not from the screenshot's sample.
3. **Mapping inventory — requires app-owner approval:**
   - TimeTracker: Employee, OJT, Supervisor, HR, Finance, System Admin, IT Administrator (note: app-local "System Admin" legacy string **must not** become global System Admin).
   - FuelTrack+: User, Pump Attendant, Admin.
   - TradeLink: User, Sales Supervisor, General Manager.
   - Toolbox Issues: admin, supervisor, employee, viewer.
   - Fund Released Tracker: GENERAL_MANAGER, FINANCE_MANAGER, FINANCE_APPROVER, REQUESTOR.
   - FuelTrans: Admin, User, Viewer; its **separate** workspace membership keys also include `admin`, `fueltrans`, `watchdog_employee`, `global_l1_support`, `local_l2_support`, `call_center_specialist`, `viewer`. Mapping this to screenshot roles Requester/Approver/Dispatcher/Auditor is **ambiguous** and must not auto-apply.
   - Order Intake: Admin, User, Viewer.
   - Tool Traceability: ADMIN, LOGISTICS, USER, VIEWER.
   - Material Request Hub: ADMIN, REQUESTOR, APPROVER, WAREHOUSE, VIEWER.
   - APS-AIMS: Administrator, AssetManager, Custodian, Viewer.
   - Employee Evaluation: admin, supervisor, employee.
   - Charter Navigator: admin, user.
   - The legacy four CRM platform tiers admin/supervisor/employee/viewer and all scoped-six module and workspace overrides need an independent mapping to workspace/member/team/app; **do not silently remove tier ceilings or protection**.
4. **Direct board mapping:** existing `owner` maps to `is_owner=true, role=editor`. Existing `editor` maps to editor. Existing `viewer` maps to viewer. Other grants or policy overrides require explicit semantic review; converting every non-editor without checking its effective capabilities could downgrade an account or create a bypass.
5. **Existing administrators:** only explicitly approved trusted staff may be seeded into the ID-backed General administration team or given separately attributable explicit grants. Existing IT department membership alone never grants System Admin. Review protected bootstrap identities, break-glass recovery, new workspace creation, and multi-workspace effects.
6. **Additive shadow writes:** create tables and seed mapping decisions on a disposable PostgreSQL 17 clone first. Backfill authorized canonical app/board rows. Store per-resource reconciliation version and never overwrite the legacy live tables. Dual-read signed, same-user, same-workspace projections to detect missing/excess permissions at row/capability level.
7. **Zero-difference acceptance:** for every test identity and resource, compare before/after `VIEW`, `CREATE`, `EDIT`, `DELETE`, `APPROVE`, `EXPORT`, team and admin operations. **Require zero differences** unless the organization explicitly approves a change to policy and records it as a separate change control. Include inherited board access, direct-vs-team precedence, removal, last-owner, last-admin, inactive users, stale updates, cross-tenant attempts and app admin isolation.
8. **Staged cutover:** first enable read-only projection for a small approved cohort; then route individual module authorization through centralized signed checks in small, rollbackable slices (one app/board resource at a time). Audit and sign off every module. Require MFA/reauth for global grant/revoke and clear incident ownership.
9. **Rollback:** retain complete existing tables/functions/policies, original role keys, migration ledger, and an immutable before-snapshot. Disable the new Edge flag and every access-V2 authorization integration feature flag; restore old routing while keeping audit evidence. If an individual module migration already wrote records, use a verified replay/backfill plan and two-person recovery review. Never delete legacy tables as part of first release.

## Activation blockers and current scope

- The original Teams SQL and board-team invite SQL are still **review candidates**, not production migrations. New Access V2 SQL depends on them.
- The Edge router is disabled by default and several proposed V2 role RPCs do not exist. Direct Viewer/Editor mutation and app-role mutations must return unavailable rather than success until implemented and signed-tested.
- The standalone React preview is **not** connected to Supabase and changing its checkboxes does not change real roles; production remains vanilla JS for compatibility.
- The production workspace page uses signed Teams snapshots and fails closed if missing.
- Review in PostgreSQL 17 with verified schema ownership, RLS, session revocation, privilege boundaries and negative two-account tests before enabling.
- No "real-time" access claim is justified until the existing data authorization and cache invalidation paths have a verified revocation story.

## Remaining explicit visual questions

1. Could the missing Screen 1 and Screen 3 images be supplied for exact matching of their detailed copy and microspacing?
2. For the Screen 2 "4 boards" label with only 3 rows shown, is the fourth board below the viewport or intentionally hidden?
3. Does the Board Invite policy row permit switching board public/private visibility, and which signed server policy should authorize it? This control remains disabled until answered.
4. Which actual FuelTrans role definitions and capabilities correspond to screenshot examples? The current stored legacy role keys do **not** establish a one-to-one mapping.

## Test commands (local preview)

```bash
cd access-preview
npm install
npm run build
npm run dev
# open http://127.0.0.1:5192/?screen=workspace
# use ?screen=board, ?screen=app, ?screen=overview
```

CI includes `scripts/access-v2-browser-acceptance.mjs` for pixel-space geometry and interactive behavior and exports desktop/mobile screenshots. This evidence is necessary but not sufficient for production access activation.
