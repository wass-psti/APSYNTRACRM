revoke all on function private.material_tracker_group_title(text) from public, anon;
revoke all on function private.material_tracker_material_json(public.material_tracker_materials) from public, anon;
revoke all on function private.material_tracker_record_metric(uuid) from public, anon;

grant execute on function private.material_tracker_group_title(text) to authenticated;
grant execute on function private.material_tracker_material_json(public.material_tracker_materials) to authenticated;
grant execute on function private.material_tracker_record_metric(uuid) to authenticated;;
