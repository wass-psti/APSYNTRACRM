-- Run after representative CRUD and concurrency fixture.
\i /tmp/mrh-receipt.sql
insert into public.profiles values('22222222-2222-4222-8222-222222222222','active');
insert into public.work_board_members values('617c4c0f-e343-4b3b-8456-50d47dcbaf99','22222222-2222-4222-8222-222222222222','editor');
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
do $$
declare req uuid:='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 missing uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 result jsonb;
 target uuid:=(select id from public.work_board_items limit 1);
begin
 result:=public.mrh_material_create_receipt(req);
 if result is distinct from jsonb_build_object('request_id',req,'status','committed','item_id',target)
  then raise exception 'committed receipt mismatch'; end if;
 if public.mrh_material_create_receipt(missing) is distinct from jsonb_build_object('request_id',missing,'status','unresolved')
  then raise exception 'unresolved receipt mismatch'; end if;
 perform set_config('test.actor','22222222-2222-4222-8222-222222222222',true);
 if public.mrh_material_create_receipt(req) is distinct from jsonb_build_object('request_id',req,'status','unresolved')
  then raise exception 'foreign actor receipt disclosed'; end if;
 perform set_config('test.actor','11111111-1111-4111-8111-111111111111',true);
 perform set_config('test.domain_role','VIEWER',true);
 begin
  perform public.mrh_material_create_receipt(req);
  raise exception 'existing role restriction bypassed';
 exception when sqlstate '42501' then null; end;
 perform set_config('test.domain_role','ADMIN',true);
 perform public.wm_set_board_item_archived(target,true);
 if public.mrh_material_create_receipt(req) is distinct from result then raise exception 'archived receipt lost'; end if;
 perform public.wm_set_board_item_archived(target,false);
 raise notice 'CP_MS_CRM_04A3_RECEIPT_RECOVERY_PASS';
end$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.mrh_material_create_receipt(uuid)','execute') then
  raise exception 'receipt RPC accessible anonymously'; end if;
end$$;
\i /tmp/mrh-rollback.sql
do $$begin
 if to_regprocedure('public.mrh_material_create_receipt(uuid)') is not null or
    to_regprocedure('public.mrh_edit_material_atomic(uuid,jsonb,jsonb)') is not null or
    to_regprocedure('public.mrh_create_material_atomic(uuid,text,jsonb,jsonb)') is null or
    (select count(*) from private.mrh_material_create_requests)<>1 or
    (select count(*) from public.work_board_items)<>1 then raise exception 'rollback altered existing data or contract'; end if;
 raise notice 'CP_MS_CRM_04A3_ADDITIVE_ROLLBACK_PASS';
end$$;
