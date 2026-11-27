# CP-MS-CRM-04A.4 — production activation

Explicit approval received 2026-11-27 for two additive RPCs, frontend
activation, and controlled signed acceptance using designated test records.
Baseline main 5ec7bc248ad537c20e90d5537a45b1be2b0d740a had 24/24 successful
post-merge workflows. Nine live dependency definitions matched the frozen
representative fixture; the existing creation function body also matched.

Production migration 20261127113859_cp_ms_crm_04a4_atomic_crud_recovery was applied through Supabase's
migration API. Source is recovered byte-for-byte from the live ledger and
registered in the repository manifest. It creates only
public.mrh_edit_material_atomic(uuid,jsonb,jsonb) and
public.mrh_material_create_receipt(uuid), with the previously validated
contracts and a PostgREST schema reload. Both functions were read back with
authenticated EXECUTE, no anon EXECUTE, and fixed empty search_path.
Material records 3 -> 3, existing create receipts 2 -> 2, protected cells
10 -> 10. No operational records were created, edited or removed by
activation; existing role definitions and policies were not modified.

This commit enables the two frontend deployment flags after backend readback.
It is not evidence of a completed Pages deployment or genuine signed
production write acceptance. The originating signed browser connector
returned an access error. No account, role, credential, or test record was
invented. Use the existing designated signed QA account and designated test
material only; record successful create, readback, atomic mixed edit, recovery
using the original UUID, archive/restore, and regression behavior before
final runtime certification. Do not modify existing operational materials.

Rollback: first disable both flags and verify the deployed frontend; then
use sql/mrh-atomic-crud-ROLLBACK-CANDIDATE.sql under approved rollback scope.
Do not drop the existing receipt table or original creation RPC.

No new dependencies or model training.
