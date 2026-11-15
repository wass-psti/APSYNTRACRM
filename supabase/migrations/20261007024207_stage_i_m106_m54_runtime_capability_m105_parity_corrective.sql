
begin;

create or replace function public.wm_runtime_capabilities() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  required_tables text[] := array[
    'profiles','module_role_assignments','module_state_entries','module_activity_events','module_operation_locks','workspaces','workspace_members',
    'work_boards','work_board_members','work_board_groups','work_board_columns','work_board_items','work_board_item_values','work_board_item_updates','work_board_item_files','work_board_events'
  ]::text[];
  required_rpcs text[] := array[
    'update_own_profile','list_user_directory','admin_set_user_access','claim_bootstrap_admin',
    'list_module_directory','list_module_state','put_module_state','delete_module_state','list_module_activity','append_module_activity','acquire_module_operation_lock','release_module_operation_lock',
    'commit_timetracker_attendance_action','commit_fueltrack_requests_with_activity','wm_restore_workspace_backup_v4',
    'wm_board_backend_capabilities','wm_list_boards','wm_get_board','wm_create_board','wm_create_board_configured','wm_add_board_column','wm_add_board_column_at','wm_duplicate_board','wm_update_board','wm_delete_board_permanently',
    'wm_get_board_preferences','wm_set_board_preferences','wm_add_board_group','wm_update_board_group','wm_move_board_group','wm_delete_board_group','wm_set_board_group_accent',
    'wm_update_board_column','wm_change_board_column_type','wm_move_board_column','wm_duplicate_board_column','wm_delete_board_column',
    'wm_add_board_item','wm_update_board_item','wm_move_board_item','wm_duplicate_board_item','wm_delete_board_item','wm_set_board_item_archived','wm_set_board_cell','wm_set_board_cell_if_current','wm_import_board_items_atomic','wm_set_board_status','wm_set_board_status_labels','wm_set_board_view',
    'wm_add_board_member','wm_remove_board_member','wm_get_board_item_workspace','wm_add_board_item_update','wm_delete_board_item_update','wm_register_board_item_file','wm_delete_board_item_file','wm_list_board_events'
  ]::text[];
  required_triggers text[] := array[
    'work_boards_realtime_change','work_board_members_realtime_change','work_board_groups_realtime_change','work_board_items_realtime_change',
    'work_board_columns_realtime_change','work_board_item_values_realtime_change','work_board_item_updates_realtime_change','work_board_item_files_realtime_change'
  ]::text[];
  existing_tables text[];
  existing_rpcs text[];
  existing_storage text[] := '{}'::text[];
  existing_realtime text[] := '{}'::text[];
  trigger_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select coalesce(array_agg(name order by name),'{}'::text[])
    into existing_tables
    from unnest(required_tables) as name
   where to_regclass(format('public.%I',name)) is not null;

  select coalesce(array_agg(name order by name),'{}'::text[])
    into existing_rpcs
    from unnest(required_rpcs) as name
   where exists (
     select 1 from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=name and p.prokind='f'
       and has_function_privilege('authenticated',p.oid,'EXECUTE')
   );

  if exists(select 1 from storage.buckets where id='work-board-files' and public=false) then
    existing_storage := array['work-board-files']::text[];
  end if;

  if to_regclass('realtime.messages') is not null then
    existing_realtime := array_append(existing_realtime,'private-channels');
  end if;
  if exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='wm_board_realtime_receive') then
    existing_realtime := array_append(existing_realtime,'broadcast-receive-policy');
  end if;
  if exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='wm_board_realtime_presence_track') then
    existing_realtime := array_append(existing_realtime,'presence-track-policy');
  end if;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='work_board_realtime_topic_access' and has_function_privilege('authenticated',p.oid,'EXECUTE')
  ) then
    existing_realtime := array_append(existing_realtime,'board-topic-authorization');
  end if;
  select count(*) into trigger_count
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and t.tgname=any(required_triggers) and not t.tgisinternal;
  if trigger_count=array_length(required_triggers,1)
     and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='realtime' and p.proname='send') then
    existing_realtime := array_append(existing_realtime,'board-change-broadcast-triggers');
  end if;

  return jsonb_build_object(
    'schema_version','1.43.2-m38-v2',
    'tables',to_jsonb(existing_tables),
    'rpcs',to_jsonb(existing_rpcs),
    'storage',to_jsonb(existing_storage),
    'realtime',to_jsonb(existing_realtime),
    'missing_tables',to_jsonb(array(select unnest(required_tables) except select unnest(existing_tables))),
    'missing_rpcs',to_jsonb(array(select unnest(required_rpcs) except select unnest(existing_rpcs))),
    'missing_storage',to_jsonb(array(select unnest(array['work-board-files']::text[]) except select unnest(existing_storage))),
    'missing_realtime',to_jsonb(array(select unnest(array['private-channels','broadcast-receive-policy','presence-track-policy','board-topic-authorization','board-change-broadcast-triggers']::text[]) except select unnest(existing_realtime)))
  );
end $$;

revoke all on function public.wm_runtime_capabilities() from public, anon;
grant execute on function public.wm_runtime_capabilities() to authenticated;
notify pgrst, 'reload schema';

commit;
;
