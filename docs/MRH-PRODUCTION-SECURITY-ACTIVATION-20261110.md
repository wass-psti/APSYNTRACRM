# Material Request Hub — Production Security Activation Record (2026-11-10)

## Scope and source
Existing project: `jtlusodorfnyzgyuewkz` (WatchdogWorkspace). User request authorized **Material Request Hub — Approved Production Security Activation and Sourcing Column Persistence**.

Original private SQL contract: `sql/mrh-sourcing-sensitive-vault-CANDIDATE-NOT-APPLIED.sql`, reviewed in PR #194 and passed disposable PostgreSQL 17 acceptance. The exact reviewed SQL statements were applied with updated deployment comments through Supabase `apply_migration` as:

`mrh_secure_sourcing_private_vault_admin_only_activation`

**IMPORTANT:** The file carrying the candidate name remains an immutable source review artifact; its DDL is deployed, but its filename alone must not be interpreted as deployment status. Never rerun it blindly.

## Production verification (database read-only checks immediately after activation)

- `private.mrh_sourcing_sensitive_cells`: exists; **0 records**.
- `relrowsecurity`: `true`.
- `authenticated` direct table `SELECT`: `false`.
- `anon` EXECUTE on `public.mrh_sourcing_sensitive_read(uuid,uuid)`: `false`.
- `anon` EXECUTE on `public.mrh_sourcing_sensitive_write(uuid,uuid,text,jsonb,bigint)`: `false`.
- `authenticated` EXECUTE on those RPCs: `true`, with RPC code enforcing active domain `ADMIN` membership, workspace/item binding, and `work_board_access`.
- Existing Material Request Hub board: **1** group, exact `Main group` ID `21566a87-b287-4a61-b521-bb233956e09e`, position **0**.
- Custom columns **8**, board items **0**. None changed during the migration.
- Existing active MRH ADMIN membership count in the board workspace: **2** (read-only role count; no user identifiers recorded).

## Signed UI activation, deliberately separate from migration

`frontend/material-sourcing-controlled-activation.js` and the board structure modal implement opt-in execution of **six ordinary fields only**, through the signed `wm_board_schema_mutate` optimistic-concurrency RPC. The UI requires exact typed confirmation `ACTIVATE SOURCING COLUMNS`. Before each mutation it verifies:
- same signed user + active workspace,
- board manager authorization,
- live `material_request_hub_bootstrap` returns `ADMIN` for that workspace,
- exact original board and `Main group` identity,
- no conflicting existing column type and backend 30-column ceiling.

Each successful mutation is reread and checked. No direct SQL bypass, background activation, or automatic retries.

**This UI operation has not yet been executed against the production board.** A signed, authorized MRH ADMIN must open the board's **Board structure & views** modal and use the explicit button. Recheck the exact original eight column IDs and group after successful activation. The expected result is 14 custom columns (8 existing + 6 ordinary).

## Security and financial exclusions

The generic `wm_get_board` response includes all generic cell values for board viewers. NEVER place restricted sourcing prices, vendor, account, or requester data in `work_board_item_values`. The new private vault is a separate scoped access path; server-side signed role and revoked-session tests remain pending against live authenticated identities. The five derived financial calculations (PHP equivalents, landed buying totals, VAT-inclusive cost) remain disabled until exact business rules are approved.

**Disposition:** Private vault DDL activated; production grant/RLS checks VERIFIED; signed six-column activation remains pending user-facing execution; sensitive-field UX, full field-RBAC acceptance, and financial formula semantics remain separate unresolved requirements. Do not claim complete Material Sourcing alignment.
