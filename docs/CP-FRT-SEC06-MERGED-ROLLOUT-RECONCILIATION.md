# CP-FRT-SEC06 — Merge and Backend Rollout Reconciliation

**Verified date:** 2026-10-31 (Asia/Manila)  
**Merged PR:** [#10](https://github.com/wass-psti/APSYNTRACRM/pull/10), merged at 2026-10-31 00:45:44 UTC  
**Merged `main` commit:** `9a9cde0fb3ed77295a002506bf28fc8095ba5ad0`

## Verified release facts

- Frontend workflow `41151913079`: completed successfully on the merged `main` SHA.
- GitHub Pages deployment `41151912260`: completed successfully on that same SHA.
- Connected production WatchdogWorkspace Supabase backend was read **without mutation**.
- The new `public.apsyntra_crm_platform_roles` table, `apsyntra_crm_platform_role_snapshot(uuid)`, `apsyntra_crm_platform_role_set(uuid,uuid,text,timestamptz)` and `apsyntra_crm_explicit_role(uuid,uuid)` are **NOT INSTALLED**.
- Existing records remain: 121 module assignments, 2 bootstrap identities, 3 FRT memberships, 74 boards and 15,469 board events.
- Accordingly frontend deployment is not evidence that effective CRM platform-role authorization is live.

## Controlled compatibility correction

The merged frontend requests the existing bootstrap-only assignment snapshot and the new CRM platform-role snapshot together. A missing CRM RPC makes the entire `#/user-role-management` page fail to load, affecting existing application and board role controls.

This isolated patch changes the behavior as follows:

1. **Always validate the existing bootstrap-only authorization snapshot first.** Invalid/unauthorized responses reject immediately.
2. Only a genuine PostgREST missing-function response (**HTTP 404, code `PGRST202`**) permits a temporary compatibility display of the existing signed application and board assignments.
3. In that exact case, show an explicit **backend migration pending** warning; all CRM platform assignment/change/revert controls are disabled and no CRM role is inferred, displayed as effective, or persisted.
4. Auth errors, 403 authorization denials, non-`PGRST202` 404 responses and backend failures propagate unchanged. No downgrade to a read-only public endpoint or role-cache fallback.
5. Once the authorized CRM backend migration exists, require the complete authenticated CRM snapshot and strict role schema; no change to the intended future authorization hierarchy.

## Gates and limitations

- CI frontend and authorization contract tests: run on this isolated branch. Static/synthetic tests do **not** establish a fresh signed-user browser runtime.
- **Production backend migration:** blocked pending explicit authorization for material production authorization changes, even though source was merged.
- **Full nonproduction compatibility:** disposable PostgreSQL 17 contract previously passed on PR #10, but its minimal fixture does not prove complete production schema or every twelve-application domain guard.
- **Canonical Mac native host:** `http://127.0.0.1:5173/#/` and `/api/v1/boards` remain inaccessible from this connected environment.
- **Merge:** separate draft PR required; do not automatically merge `main`.

## Recovery choices

- Lowest-risk remediation: verify this patch and merge only after explicit release authorization, restoring the legacy signed User Role Management controls while marking CRM-specific controls unavailable.
- Full activation: independently review the migrations in a production-equivalent nonproduction environment, secure authorization for production role/permission semantics changes, install the two SQL migrations in documented order, verify direct API and signed-user acceptance, then enable new CRM role controls.

No live identity, finance, board, workspace, policy or role record was changed in this checkpoint.
