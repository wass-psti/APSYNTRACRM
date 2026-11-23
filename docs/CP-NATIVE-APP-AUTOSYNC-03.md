# CP-NATIVE-APP-AUTOSYNC-03 — Existing-board application registry

## Verified registry source

The existing `public.work_boards` records contain canonical `[APSYNTRA:MODULE:<key>:v1]` registration markers. A **read-only production** SQL inventory found twelve active records, twelve unique module IDs, and no unmatched markers (November 22, 2026). No separate extensible registration table exists in the inspected public/private schemas. Legacy marker aliases (`frt`, `tools`, `orders`, etc.) map to the existing assignment IDs.

## Implementation

- `supabase/migrations/20261122010413_cp_native_app_autosync_03_registry_projection.sql` adds a **read-only** workspace-scoped catalog RPC over existing board registration records. No additional registry tables, assignment grants, RLS policies, or domain roles are created. The RPC reuses `apsyntra_role_require_scope`.
- The role-management client reads the catalog **only when Native Application Access is opened**. The exact missing-RPC response (`404` with `PGRST202`) retains existing snapshot compatibility. Other errors propagate.
- Individual and bulk list renderers use the same catalog. Existing module assignment services, roles, disabled-state rules, and authoritative readbacks are unchanged. Unrecognized new application IDs display without role-assignment controls until their existing domain assignment contract supports them.
- Stable IDs, rename, deactivation, removal, duplicate normalization, manual refresh, and throttled focus/visibility revalidation are covered by the read path. No continuous polling.

## Verification

- Read-only production inventory: twelve active registered boards; twelve canonical IDs; zero unmatched markers.
- SQL migration compiled in a **disposable local Supabase PostgreSQL instance** inside a transaction; the entire transaction was rolled back. No schema changes remain in that database.
- Synthetic client tests include catalog retrieval, rename, addition, removal, individual/bulk visibility, fallback, invalid response and transient connectivity errors.
- Full frontend regression: 3,320 tests passed, zero failed (after restricting new catalog reads to Native Application Access).
- Vite build passed with existing chunk-size warnings. Syntax and diff checks passed.

## Remaining acceptance boundary

The connected Supabase account exposes one APSYNTRACRM production project; no independent authenticated nonproduction web deployment and test identities were confirmed. The migration was **not** applied to production. No genuine signed two-profile registration/assignment/readback session has been performed. Existing domain writers do not define a role vocabulary for arbitrary new modules, so future registrations are discoverable but not automatically assignable until their application-specific role contract is supplied. Do not infer access or bypass existing enforcement.

## Required next phase

Provision or identify approved isolated signed QA profiles and deployment, apply the reviewed read-only catalog RPC to that nonproduction environment, verify actual registration lifecycle and cross-session refresh, and supply/reuse each new native application's established role and writer contract. Complete signed individual/bulk persistence and reversible QA cleanup before production review/merge.
