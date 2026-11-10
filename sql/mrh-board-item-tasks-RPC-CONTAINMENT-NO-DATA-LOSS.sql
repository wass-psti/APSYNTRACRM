-- MRH emergency containment only. Does not drop tasks or modify roles, data,
-- groups, original columns, protected commercial values or function ownership.
-- Confirm target signatures before running; effect is to disable task API.
begin;
do $guard$
begin
 if to_regprocedure('public.mrh_board_item_tasks_read(uuid,uuid)') is null
 or to_regprocedure('public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)') is null then
  raise exception 'MRH task RPC signatures absent; containment not applied';
 end if;
end
$guard$;
revoke execute on function public.mrh_board_item_tasks_read(uuid,uuid)
 from public,anon,authenticated;
revoke execute on function public.mrh_board_item_tasks_write(uuid,uuid,uuid,text,text,bigint)
 from public,anon,authenticated;
commit;
