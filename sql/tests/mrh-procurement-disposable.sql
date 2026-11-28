\i /tmp/mrh-procurement-fixture.sql
-- No production connection: signed role and identity settings are synthetic.
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
select set_config('test.order_access','yes',false);
do $$
declare item uuid:='22222222-2222-4222-8222-222222222222'; other_item uuid:='22222222-2222-4222-8222-222222222223';
 rfq uuid:='44444444-4444-4444-8444-444444444444'; op uuid:=gen_random_uuid();
 q1 uuid:='55555555-5555-4555-8555-555555555555'; q2 uuid:='55555555-5555-4555-8555-555555555556';
 create_payload jsonb:='{"reference":"QA-RFQ","issued_on":"2026-11-28","due_on":"2026-12-05"}';
 quote jsonb:='{"supplier":"Supplier A","reference":"A-1","issued_on":"2026-11-28","valid_until":"2026-12-31","quantity":5,"unit_price":100.25,"currency":"PHP","shipping_total":10.25,"shipping_currency":"PHP","tax_basis":"tax_exclusive","lead_weeks":1}';
 quote2 jsonb; links jsonb; result jsonb; s jsonb; n bigint;
begin
 result:=public.mrh_procurement_apply(item,rfq,op,0,'create',create_payload);
 if result->>'revision'<>'1' then raise exception 'create receipt failed'; end if;
 result:=public.mrh_procurement_apply(item,rfq,op,0,'create',create_payload);
 if result->>'replayed'<>'true' then raise exception 'replay failed'; end if;
 begin
  perform public.mrh_procurement_apply(item,rfq,op,0,'create',create_payload||'{"reference":"Changed"}');
  raise exception 'changed replay accepted';
 exception when sqlstate 'PT409' then null; end;
 quote:=quote||jsonb_build_object('quote_id',q1,'supplier_source_id','33333333-3333-4333-8333-333333333333');
 quote2:=(quote-'supplier_source_id')||jsonb_build_object('quote_id',q2,'supplier','Supplier B','reference','B-1','unit_price',99.75);
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),1,'add_quote',quote);
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),2,'add_quote',quote2||'{"quantity":-1}');
  raise exception 'invalid quantity accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),2,'add_quote',quote2||'{"supplier_source_id":"33333333-3333-4333-8333-333333333333"}');
  raise exception 'mismatched supplier source accepted';
 exception when sqlstate '42501' then null; end;
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),2,'add_quote',quote2);
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),3,'amend_quote',quote||'{"unit_price":98.25}');
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),3,'select_quote',jsonb_build_object('quote_id',q1,'reason','stale'));
  raise exception 'stale revision accepted';
 exception when sqlstate 'PT409' then null; end;
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),4,'select_quote',jsonb_build_object('quote_id',q1,'reason','Comparable terms'));
 s:=public.mrh_procurement_read(item)->'rows'->0->'snapshot';
 if s#>>'{selection,quote_revision}'<>'2' or jsonb_array_length(s->'quotes')<>2 then raise exception 'selection/revision failed'; end if;
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),5,'amend_quote',quote);
  raise exception 'selected quote amendment accepted';
 exception when sqlstate 'PT409' then null; end;
 links:='{"supplier_po_id":"33333333-3333-4333-8333-333333333333","client_po_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","client_po_kind":"native"}';
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),5,'link_po',links||'{"client_po_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}');
  raise exception 'foreign client link accepted';
 exception when sqlstate '42501' then null; end;
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),5,'link_po',links);
 s:=public.mrh_procurement_read(item)->'rows'->0->'snapshot';
 if s->>'status'<>'po_linked' or s->>'client_po_id'<>links->>'client_po_id' then raise exception 'PO link failed'; end if;
 perform set_config('test.order_access','no',true);
 if public.mrh_procurement_read(item)->'rows'->0->'snapshot' ? 'client_po_id' then raise exception 'revoked client source exposed'; end if;
 perform set_config('test.order_access','yes',true);
 result:=public.mrh_procurement_read(item,rfq,null,2,0);
 if result->>'has_more'<>'true' or jsonb_array_length(result->'rows')<>2 then raise exception 'history page invalid'; end if;
 result:=public.mrh_procurement_read(item,rfq,4,10,0);
 if result#>>'{rows,1,snapshot,quotes,0,unit_price}'<>'100.25' then raise exception 'historical quote lost'; end if;
 if jsonb_array_length(public.mrh_procurement_read(other_item,rfq)->'rows')<>0 then raise exception 'foreign material history exposed'; end if;
 perform set_config('test.domain_role','VIEWER',true);
 if jsonb_array_length(public.mrh_procurement_read(item)->'rows')<>1 then raise exception 'ordinary viewer read failed'; end if;
 begin
  perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),6,'reopen','{}');
  raise exception 'viewer write accepted';
 exception when sqlstate '42501' then null; end;
 perform set_config('test.domain_role','ADMIN',true);
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),6,'reopen','{}');
 s:=public.mrh_procurement_read(item)->'rows'->0->'snapshot';
 if s->>'status'<>'open' or s->>'selection' is not null or s->>'supplier_po_id' is not null then raise exception 'reopen did not clear current selection'; end if;
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),7,'cancel','{}');
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),8,'reopen','{}');
 result:=public.mrh_procurement_apply(item,rfq,op,0,'create',create_payload);
 if result->>'replayed' is distinct from 'true' or result->>'revision' is distinct from '1' then raise exception 'historical operation receipt lost'; end if;
 select count(*) into n from public.work_board_events where entity_id=item::text and event_type='sourcing.procurement_changed';
 if n<>9 then raise exception 'unexpected audit count %',n; end if;
 if (select title from public.work_board_items where id=item)<>'Original material' then raise exception 'material mutated'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.mrh_procurement_revisions)<>9 then raise exception 'history count'; end if;
 if (select value from private.mrh_sourcing_sensitive_cells where field_name='Buying Price')<>'150.75'::jsonb then raise exception 'price changed'; end if;
 if has_table_privilege('authenticated','private.mrh_procurement_revisions','SELECT') then raise exception 'direct private read granted'; end if;
 if has_function_privilege('anon','public.mrh_procurement_read(uuid,uuid,bigint,integer,integer)','EXECUTE') then raise exception 'anon read granted'; end if;
end $$;
-- A failed audit insert must roll back the entire candidate write.
create function public.test_procurement_audit_failure() returns trigger language plpgsql as $$
begin
 if new.event_type='sourcing.procurement_changed' then raise exception 'synthetic audit failure' using errcode='23514'; end if;
 return new;
end $$;
create trigger test_procurement_audit_failure before insert on public.work_board_events for each row execute function public.test_procurement_audit_failure();
set role authenticated;
do $$ begin
 begin
  perform public.mrh_procurement_apply('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',gen_random_uuid(),9,'select_quote','{"quote_id":"55555555-5555-4555-8555-555555555555","reason":"rollback fixture"}');
  raise exception 'audit failure did not propagate';
 exception when check_violation then null; end;
end $$;
reset role;
drop trigger test_procurement_audit_failure on public.work_board_events;
drop function public.test_procurement_audit_failure();
do $$ begin
 if (select count(*) from private.mrh_procurement_revisions)<>9 or (select count(*) from public.work_board_events where event_type='sourcing.procurement_changed')<>9 then raise exception 'audit failure left a partial write'; end if;
end $$;
delete from public.work_board_members where board_id='aa0d8acb-5f0e-4628-b0b4-76ef369b9f51';
set role authenticated;
do $$ begin
 if public.mrh_procurement_read('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',7)->'rows'->0->'snapshot' ? 'supplier_po_id' then raise exception 'revoked source exposed'; end if;
end $$;
reset role;
set role authenticated;
select public.wm_set_board_item_archived('22222222-2222-4222-8222-222222222222',true);
do $$ begin
 begin
  perform public.mrh_procurement_read('22222222-2222-4222-8222-222222222222');
  raise exception 'archived material read accepted';
 exception when sqlstate '42501' then null; end;
end $$;
select public.wm_set_board_item_archived('22222222-2222-4222-8222-222222222222',false);
do $$ begin
 if jsonb_array_length(public.mrh_procurement_read('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444')->'rows')<>9 then raise exception 'restore history lost'; end if;
end $$;
reset role;
select 'CP_MS_CRM_05D_PROCUREMENT_DISPOSABLE_PASS' as result;
