-- Disposable-only acceptance after fixture and migration. psql -v ON_ERROR_STOP=1.
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$
declare b uuid:='7af78b3f-67bf-4600-9aa1-9006d19d486e';
 k uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 r jsonb; rr jsonb; rid uuid; denied boolean;
begin
 r:=public.fueltrack_v3_submit(b,k,'vehicle',
  '{"plate":"GAN 8289","owner":"Person A","origin":"Office","destination":"Depot","purpose":"Refuel vehicle","distance":8}'::jsonb);
 rid:=(r->>'id')::uuid;
 if r->>'state'<>'submitted' or r->>'idempotent'<>'false' then raise exception 'CREATE_FAILED';end if;
 rr:=public.fueltrack_v3_submit(b,k,'vehicle',
  '{"plate":"GAN 8289","owner":"Person A","origin":"Office","destination":"Depot","purpose":"Refuel vehicle","distance":8}'::jsonb);
 if rr->>'id'<>rid::text or rr->>'idempotent'<>'true' then raise exception 'IDEMPOTENCY_FAILED';end if;
 denied:=false;
 begin
  perform public.fueltrack_v3_submit(b,k,'vehicle',
  '{"plate":"GAN 8289","owner":"Person B","origin":"Office","destination":"Depot","purpose":"Different"}'::jsonb);
 exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'KEY_REUSE_ALLOWED';end if;
 rr:=public.fueltrack_v3_read(b,10);
 if (rr->'summary'->>'total')::integer<>1 or jsonb_array_length(rr->'rows')<>1 then
  raise exception 'READ_OWN_FAILED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_decide(b,rid,1,'approved');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'USER_APPROVE_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_mark_refueled(b,rid,1);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'USER_REFUEL_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_audit_read(b);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'USER_AUDIT_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_submit(b,pg_catalog.gen_random_uuid(),'container',
  '{"containerCount":0,"responsiblePerson":"Person A","purpose":"Test"}'::jsonb);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'INVALID_CONTAINER_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_submit(b,pg_catalog.gen_random_uuid(),'vehicle',
  '{"plate":"GAN 8289","owner":"Person A","origin":"Office","destination":"Depot",
    "purpose":"Refuel vehicle","requested_by":"attacker"}'::jsonb);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'SPOOFED_REQUESTOR_PAYLOAD_ALLOWED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_submit(b,pg_catalog.gen_random_uuid(),'vehicle',
  '{"plate":"GAN 8289","owner":123,"origin":"Office","destination":"Depot","purpose":"Refuel vehicle"}'::jsonb);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'WRONG_OWNER_TYPE_ALLOWED';end if;
 denied:=false;
 begin perform count(*) from public.fueltrack_v3_requests;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'DIRECT_TABLE_READ_ALLOWED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$
declare b uuid:='7af78b3f-67bf-4600-9aa1-9006d19d486e';
 rid uuid; rr jsonb; denied boolean;
begin
 rr:=public.fueltrack_v3_read(b,100);
 rid:=(rr->'rows'->0->>'id')::uuid;
 if rid is null then raise exception 'ADMIN_READ_FAILED';end if;
 rr:=public.fueltrack_v3_decide(b,rid,1,'approved');
 if rr->>'state'<>'approved' or (rr->>'revision')::int<>2 then raise exception 'APPROVE_FAILED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_decide(b,rid,1,'rejected','Late');
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'STALE_DECISION_ALLOWED';end if;
 rr:=public.fueltrack_v3_mark_refueled(b,rid,2);
 if rr->>'state'<>'refueling_done' then raise exception 'REFUEL_FAILED';end if;
 denied:=false;
 begin perform public.fueltrack_v3_complete(b,rid,2,500,10,'INV-001');
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'STALE_COMPLETE_ALLOWED';end if;
 rr:=public.fueltrack_v3_complete(b,rid,3,500,10,'INV-001');
 if rr->>'state'<>'completed' then raise exception 'COMPLETE_FAILED';end if;
 rr:=public.fueltrack_v3_read(b,100);
 if (rr->'summary'->>'completed')::int<>1 or (rr->'summary'->>'totalAmount')::numeric<>500
 then raise exception 'AGGREGATE_FAILED';end if;
 rr:=public.fueltrack_v3_analytics(b,90);
 if rr->>'status'<>'VERIFIED_READ' or
    (rr->'daily'->0->>'transactions')::int<>1 then raise exception 'ANALYTICS_FAILED';end if;
 rr:=public.fueltrack_v3_audit_read(b,null,100);
 if jsonb_array_length(rr->'events')<>4 or rr->>'hasMore'<>'false' or
    (rr->'events'->0->>'event_type')<>'request_complete'
 then raise exception 'IMMUTABLE_AUDIT_READ_FAILED';end if;
 rr:=public.fueltrack_v3_audit_read(b,(rr->>'nextCursor')::bigint,100);
 if jsonb_array_length(rr->'events')<>0 then raise exception 'AUDIT_CURSOR_FAILED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
do $$
declare denied boolean:=false;
begin
 begin perform public.fueltrack_v3_read('7af78b3f-67bf-4600-9aa1-9006d19d486e',10);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'FOREIGN_WORKSPACE_ALLOWED';end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
do $$
declare denied boolean:=false;
begin
 begin perform public.fueltrack_v3_read('7af78b3f-67bf-4600-9aa1-9006d19d486e',10);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'SIGNED_OUT_ALLOWED';end if;
end $$;
reset role;
do $$
declare n int;
begin
 select count(*) into n from public.ft3_test_events;
 if n<>4 then raise exception 'DISPLAY_EVENT_COUNT_FAILED %, expected 4',n;end if;
 select count(*) into n from public.fueltrack_v3_audit_events;
 if n<>4 then raise exception 'AUTHORITATIVE_AUDIT_COUNT_FAILED %, expected 4',n;end if;
 begin
  delete from public.fueltrack_v3_audit_events;
  raise exception 'AUDIT_DELETE_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
select 'FT3_BACKEND_CORE_ACCEPTANCE_PASS' as result;
