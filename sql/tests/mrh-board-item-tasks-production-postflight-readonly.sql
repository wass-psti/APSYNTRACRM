-- Live task schema postflight. Read-only. Expected to PASS only after
-- controlled additive activation; does not alter rows, roles, RPCs or grants.
with f as (
 select p.proname,p.oid,p.prosecdef,p.proowner,p.proconfig,
   has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,
   has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_exec
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
 ('mrh_board_item_tasks_read','mrh_board_item_tasks_write')
), board as (
 select b.id,b.workspace_id,b.name,b.status,
 (select count(*) from public.work_board_groups g where g.board_id=b.id and
   g.id='21566a87-b287-4a61-b521-bb233956e09e'::uuid and
   g.title='Main group' and g.position=0) as correct_group,
 (select count(*) from public.work_board_groups g where g.board_id=b.id) as total_groups,
 (select count(*) from public.work_board_columns c where c.board_id=b.id) as column_count,
 (select count(*) from public.work_board_items i where i.board_id=b.id) as item_count
 from public.work_boards b where
 b.id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid
), checks as (
 select exists(select 1 from board b where b.name='Material Request Hub'
   and b.status='active' and
   b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
   and b.correct_group=1 and b.total_groups=1 and b.column_count=8) as group_columns_preserved,
 (select count(*)=2 from f) as both_rpcs_present,
 (select coalesce(bool_and(prosecdef and proowner='postgres'::regrole
   and not anon_exec and authenticated_exec and
   coalesce(array_to_string(proconfig,','),'') like '%search_path=%'),false) from f)
    as rpc_definer_and_grants_verified,
 (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   where c.oid=to_regclass('private.mrh_board_item_tasks')) as private_rls_forced,
 not coalesce(has_table_privilege('anon',to_regclass('private.mrh_board_item_tasks'),'SELECT'),true)
   as anon_select_denied,
 not coalesce(has_table_privilege('authenticated',to_regclass('private.mrh_board_item_tasks'),'SELECT'),true)
   as signed_select_denied,
 not coalesce(has_table_privilege('authenticated',to_regclass('private.mrh_board_item_tasks'),'INSERT'),true)
   as signed_insert_denied,
 not exists(select 1 from pg_policies where schemaname='private'
  and tablename='mrh_board_item_tasks') as no_direct_table_policies,
 (select count(*) from pg_constraint where conrelid=to_regclass('private.mrh_board_item_tasks') and contype='f')=5 as five_foreign_keys
)
select case when group_columns_preserved and both_rpcs_present
 and rpc_definer_and_grants_verified and private_rls_forced
 and anon_select_denied and signed_select_denied and signed_insert_denied
 and no_direct_table_policies and five_foreign_keys
 then 'PRODUCTION_TASK_SCHEMA_ACTIVATION_PASS__SIGNED_ITEM_TRANSACTION_PENDING'
 else 'PRODUCTION_TASK_SCHEMA_ACTIVATION_FAIL__CONTAIN_API' end as postflight,*
 from checks;
