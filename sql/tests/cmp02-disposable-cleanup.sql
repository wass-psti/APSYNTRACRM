-- CMP02 disposable cleanup. Production data must never be deleted using this script.
\set ON_ERROR_STOP on
DO $cleanup$
BEGIN
 if (select count(*) from public.work_board_columns
  where data_type in ('phone','rating','percentage'))<>3 then
  raise exception 'Expected three disposable CMP02 columns for rollback test';
 end if;
 if exists(select 1 from public.work_board_item_values v
   join public.work_board_columns c on c.id=v.column_id
   where c.data_type in ('phone','rating','percentage')) then
  raise exception 'Cannot clean populated new typed values';
 end if;
END $cleanup$;
DELETE FROM public.work_board_columns
 WHERE data_type in ('phone','rating','percentage');
