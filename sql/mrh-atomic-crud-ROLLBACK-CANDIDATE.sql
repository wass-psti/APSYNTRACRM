-- CP-MS-CRM-04A.3 rollback candidate. NOT APPLIED.
-- First disable both frontend deployment flags and verify deployment.
-- Existing create RPC, receipt table, records and policies remain untouched.
begin;
drop function if exists public.mrh_material_create_receipt(uuid);
drop function if exists public.mrh_edit_material_atomic(uuid,jsonb,jsonb);
commit;
