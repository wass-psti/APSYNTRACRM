-- Material Request Hub tasks — PRODUCTION READ-ONLY ACTIVATION PREFLIGHT.
-- No DDL/DML, no auth/session overrides, no synthetic fixtures, no direct grants.
-- Verify this result plus current backup/restore rehearsal and approved executor
-- BEFORE deploying sql/mrh-board-item-tasks-CANDIDATE-NOT-APPLIED.sql.
with scope as (
 select b.id,b.workspace_id,b.name,b.status,
   (select count(*) from public.work_board_groups g
      where g.board_id=b.id and g.id='21566a87-b287-4a61-b521-bb233956e09e'::uuid
        and g.title='Main group' and g.position=0) as preserved_group,
   (select count(*) from public.work_board_groups g where g.board_id=b.id) as total_groups,
   (select count(*) from public.work_board_columns c where c.board_id=b.id) as columns,
   (select count(*) from public.work_board_items i where i.board_id=b.id) as items,
   (select count(*) from private.mrh_sourcing_sensitive_cells s where s.board_id=b.id) as private_cells
 from public.work_boards b
 where b.id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
), checks as (
 select (select count(*)=1 from scope s
   where s.name='Material Request Hub' and s.status='active'
   and s.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
   and s.preserved_group=1 and s.total_groups=1) as board_identity_preserved,
  (select columns=8 from scope) as eight_original_columns,
  (select items from scope) as existing_item_count,
  (select private_cells from scope) as existing_protected_cell_count,
  to_regclass('private.mrh_board_item_tasks') is null as new_table_not_installed,
  to_regprocedure('public.mrh_board_item_tasks_read(uuid,uuid)') is null as read_rpc_not_installed,
  to_regprocedure('public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)') is null as write_rpc_not_installed,
  to_regprocedure('private.mrh_sourcing_scope(uuid,uuid)') is not null as signed_item_scope_available,
  to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') is not null as board_audit_available,
  coalesce((select rolbypassrls from pg_roles where rolname='postgres'),false) as migration_owner_bypassrls,
  not coalesce((select rolbypassrls from pg_roles where rolname='authenticated'),true) as signed_role_not_bypassrls,
  current_setting('server_version_num')::integer>=170000 as postgres17_or_newer
)
select
  case when board_identity_preserved and eight_original_columns
   and new_table_not_installed and read_rpc_not_installed and write_rpc_not_installed
   and signed_item_scope_available and board_audit_available
   and migration_owner_bypassrls and signed_role_not_bypassrls and postgres17_or_newer
  then 'STRUCTURAL_PREFLIGHT_PASS__BACKUP_RESTORE_AND_SIGNED_ITEM_ACCEPTANCE_STILL_REQUIRED'
  else 'STRUCTURAL_PREFLIGHT_FAIL__DO_NOT_ACTIVATE' end as readiness,
  *
from checks;
