# CP-FRT-NATIVE-ROLE-01 — Fund Tracker Assignment → Native Role Source Parity

## Authoritative production diagnosis (read-only, 2026-11-20)

Target account: `senaganlexx06@gmail.com`, active member of **Work Management**.

| Check | Production evidence |
|---|---|
| URM resource identifier | `fund-released-tracker` |
| `#/fund-tracker` route → module | `fund-released-tracker` |
| Native canonical Board | Present and active in Work Management |
| Dedicated FRT assignment (`frt_memberships`) | `REQUESTOR`, enabled, active |
| CRM effective role | `employee` (rank 1) |
| FRT REQUESTOR rank | 1; within Employee ceiling |
| `apsyntra_scoped_module_role('fund-released-tracker',target,workspace)` | **NULL** before fix |

**Root cause is not an application-name mismatch.** User Role Management persists the scoped Fund Tracker assignment in `public.frt_memberships`. The native context and common shell call `has_module_access` / `module_role_for`, which resolve through `public.apsyntra_scoped_module_role`. That shared resolver did not examine `frt_memberships` and returned NULL when there was no legacy/global assignment. The existing FRT domain role helper already understands `frt_memberships`; the native access helper did not.

## Scoped source-of-truth fix

The additive migration `20261120043846_cp_frt_native_role_source_parity.sql` only replaces the existing `public.apsyntra_scoped_module_role(text,uuid,uuid)` definition:

- For canonical `fund-released-tracker`, an existing workspace-specific `frt_memberships` row takes precedence. Only `enabled=true AND status='active'` projects a role; a disabled membership remains an explicit denial, without reviving stale legacy assignments.
- With no FRT workspace membership, the original `apsyntra_workspace_module_roles` and `module_role_assignments` behavior is retained. Other modules, including TimeTracker, FuelTrack+ and TradeLink, use unchanged branches.
- The original workspace active-membership/profile-active guard remains intact. No duplicate registry, role writes, permission grants, new security barriers or data backfill are introduced. Function owner and ACL are preserved by `CREATE OR REPLACE`.

## Test and activation boundary

The disposable PostgreSQL 17 acceptance test covers scoped role precedence, disabled status, inactive user, workspace isolation, legacy fallback and the unaffected TimeTracker/TradeLink paths. Node regressions verify route, URM writer and migration invariants.

**Deployment state:** A merged source migration is not evidence the production database applied the change. Changes to production effective role permissions need a separate explicit authorization before activation. No production role or permission records have been edited for this investigation.

**Signed runtime closeout required after authorized activation:** With the genuine Employee session in Work Management, verify effective-access `allowed=true`, canonical native Board HTTP 200, `frt_bootstrap` HTTP 200, refresh, sign-out/sign-in, and no regressions in TimeTracker, FuelTrack+ or TradeLink. Do not mark these criteria passed until live evidence is captured.
