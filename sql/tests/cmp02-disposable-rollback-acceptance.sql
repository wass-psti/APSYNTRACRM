-- CMP02 PG17 rollback verification: original type admission and existing values restored.
\set ON_ERROR_STOP on
DO $check$
DECLARE denied boolean:=false;
BEGIN
 if (select count(*) from public.work_board_columns where data_type in ('phone','rating','percentage'))<>0 then
  raise exception 'CMP02 typed columns survive rollback';
 end if;
 if md5(pg_get_functiondef('public.work_board_normalize_column_config(text,jsonb)'::regprocedure))
  <> '0246a27eb7e8428575188f31d0a48148' or
  md5(pg_get_functiondef('public.work_board_validate_column_value(uuid,uuid,jsonb)'::regprocedure))
  <> '0f027e692f487ca637bdaab7e52af5d5' then
  raise exception 'Original function definitions not restored';
 end if;
 begin
  perform public.work_board_normalize_column_config('phone','{}'::jsonb);
 exception when others then denied:=true;
 end;
 if not denied then raise exception 'Phone type not denied after rollback'; end if;
 if not exists(select 1 from public.work_board_columns where column_key='col_seeded' and data_type='text') then
  raise exception 'Original column lost during guarded rollback';
 end if;
 raise notice 'CMP02 guarded rollback PASS';
END $check$;
