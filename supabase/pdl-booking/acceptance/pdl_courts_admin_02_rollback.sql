-- PDL-COURTS-ADMIN-ACCEPTANCE-02: disposable database only, no permanent changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='20s';
do $test$
declare
  actor uuid:=gen_random_uuid();
  test_day date:=(now() at time zone 'Asia/Manila')::date+4;
  result jsonb;
  block uuid;
begin
  insert into auth.users(id) values(actor);
  insert into pdl_booking.admin_users(user_id) values(actor);

  result:=public.pdl_backend_v1('configure_court',jsonb_build_object('actorId',actor,
    'courtId','court-1','enabled',true,'openMinute',540,'closeMinute',1320));
  if result->>'updated'<>'true' then raise exception 'court_save'; end if;
  result:=public.pdl_backend_v1('admin_courts',jsonb_build_object('actorId',actor));
  if not exists(select 1 from jsonb_array_elements(result->'courts') c
    where c->>'courtId'='court-1' and c->>'openMinute'='540') then
    raise exception 'court_readback'; end if;

  result:=public.pdl_backend_v1('configure_rate',jsonb_build_object('actorId',actor,
    'courtId','court-1','durationMinutes',60,'amountMinor',50000,'enabled',false));
  if result->>'updated'<>'true' then raise exception 'rate_save'; end if;
  result:=public.pdl_backend_v1('admin_courts',jsonb_build_object('actorId',actor));
  if not exists(select 1 from jsonb_array_elements(result->'courts') c,
    lateral jsonb_array_elements(c->'rates') r
    where c->>'courtId'='court-1' and r->>'amountMinor'='50000'
      and r->>'enabled'='false') then raise exception 'rate_readback'; end if;

  result:=pdl_booking.operations('ops_schedule_put',jsonb_build_object('actorId',actor,
    'courtId','court-1','weekday',extract(dow from test_day)::integer,
    'enabled',true,'openMinute',540,'closeMinute',1260));
  if result->>'updated'<>'true' then raise exception 'calendar_weekday_save: %',result; end if;
  result:=pdl_booking.operations('ops_block_add',jsonb_build_object('actorId',actor,
    'courtId','court-1','date',test_day,'startMinute',900,'endMinute',960));
  if result->>'created'<>'true' then raise exception 'maintenance_save: %',result; end if;
  block:=(result->>'id')::uuid;
  result:=pdl_booking.operations('ops_calendar',jsonb_build_object('actorId',actor));
  if not exists(select 1 from jsonb_array_elements(result->'weekdays') w
    where w->>'courtId'='court-1' and w->>'openMinute'='540')
    or not exists(select 1 from jsonb_array_elements(result->'blocks') b where b->>'id'=block::text)
    then raise exception 'calendar_readback'; end if;
  result:=pdl_booking.operations('ops_block_remove',jsonb_build_object('actorId',actor,'id',block));
  if result->>'removed'<>'true' then raise exception 'maintenance_remove'; end if;

  result:=pdl_booking.operations('ops_policy_put',jsonb_build_object('actorId',actor,
    'reservationLeadHours',3,'arrivalGraceMinutes',20,'publicNotice','Synthetic acceptance only'));
  if result->>'updated'<>'true' then raise exception 'policy_save'; end if;
  result:=pdl_booking.operations('ops_policy_get',jsonb_build_object('actorId',actor));
  if result->>'reservationLeadHours'<>'3' or result->>'arrivalGraceMinutes'<>'20'
    or result->>'publicNotice'<>'Synthetic acceptance only' then
    raise exception 'policy_readback'; end if;

  result:=public.pdl_backend_v1('payment_methods','{}'::jsonb);
  if jsonb_array_length(result->'methods')<>3 then raise exception 'payment_method_metadata'; end if;
  raise notice 'PDL_COURTS_ADMIN_02_ROLLBACK_ONLY_PASS';
end $test$;
rollback;
