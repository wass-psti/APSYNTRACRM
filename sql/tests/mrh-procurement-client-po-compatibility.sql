-- Disposable regression for CP-MS-CRM-05D.2B. Never run against production.
\i /tmp/mrh-procurement-fixture.sql
-- Model the exact operational archive overlay: explicit override wins, null
-- source archive state is retained if no override exists.
create table public.test_legacy_lifecycle(order_id uuid,workspace_id uuid,archived boolean,primary key(order_id,workspace_id));
create view public.order_intake_operational_registry with (security_invoker=true) as
 select r.id,r.workspace_id,r.record_kind,
 case when l.order_id is not null then l.archived else r.archived end as archived
 from public.order_intake_registry r left join public.test_legacy_lifecycle l
 on r.record_kind='legacy' and l.order_id=r.id and l.workspace_id=r.workspace_id;
insert into public.order_intake_registry values
 ('11111111-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy',null),
 ('11111111-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy',false),
 ('11111111-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy',true),
 ('11111111-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy',null),
 ('11111111-0000-4000-8000-000000000005','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy',true),
 ('11111111-0000-4000-8000-000000000006','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','native',true),
 ('11111111-0000-4000-8000-000000000007','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','native',null),
 ('11111111-0000-4000-8000-000000000008','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','legacy',null);
insert into public.test_legacy_lifecycle values
 ('11111111-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('11111111-0000-4000-8000-000000000005','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
select set_config('test.order_access','yes',false);
do $$ begin
 if private.mrh_procurement_client_source('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-0000-4000-8000-000000000001','legacy') is distinct from false then raise exception 'original incompatibility not reproduced'; end if;
end $$;
create temp table before_registry as select * from public.order_intake_registry;
create temp table before_overlay as select * from public.test_legacy_lifecycle;
\i /tmp/mrh-client-po-candidate.sql
do $$
declare w uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; c record;
begin
 for c in select * from (values
 ('11111111-0000-4000-8000-000000000001'::uuid,'legacy',true),
 ('11111111-0000-4000-8000-000000000002'::uuid,'legacy',true),
 ('11111111-0000-4000-8000-000000000003'::uuid,'legacy',false),
 ('11111111-0000-4000-8000-000000000004'::uuid,'legacy',false),
 ('11111111-0000-4000-8000-000000000005'::uuid,'legacy',true),
 ('11111111-0000-4000-8000-000000000006'::uuid,'native',false),
 ('11111111-0000-4000-8000-000000000007'::uuid,'native',false),
 ('11111111-0000-4000-8000-000000000008'::uuid,'legacy',false),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'native',true),
 ('11111111-0000-4000-8000-000000000001'::uuid,'native',false),
 ('11111111-0000-4000-8000-000000000009'::uuid,'legacy',false)
 ) as x(id,kind,expected)
 loop
 if private.mrh_procurement_client_source(w,c.id,c.kind) is distinct from c.expected then raise exception 'eligibility mismatch % %',c.id,c.kind; end if;
 end loop;
 perform set_config('test.order_access','no',true);
 if private.mrh_procurement_client_source(w,'11111111-0000-4000-8000-000000000001','legacy') is distinct from false then raise exception 'module denial bypassed'; end if;
 perform set_config('test.order_access','yes',true);
 perform set_config('test.actor','',true);
 if private.mrh_procurement_client_source(w,'11111111-0000-4000-8000-000000000001','legacy') is distinct from false then raise exception 'anonymous accepted'; end if;
 if has_function_privilege('authenticated','private.mrh_procurement_client_source(uuid,uuid,text)','execute') or has_function_privilege('anon','private.mrh_procurement_client_source(uuid,uuid,text)','execute') then raise exception 'private helper grants changed'; end if;
end $$;
set role authenticated;
do $$
declare item uuid:='22222222-2222-4222-8222-222222222222'; rfq uuid:=gen_random_uuid(); q uuid:=gen_random_uuid();
 links jsonb:='{"supplier_po_id":"33333333-3333-4333-8333-333333333333","client_po_id":"11111111-0000-4000-8000-000000000001","client_po_kind":"legacy"}'; s jsonb;
begin
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),0,'create','{"reference":"COMPAT-QA","issued_on":"2026-11-28","due_on":"2026-12-05"}');
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),1,'add_quote',jsonb_build_object('quote_id',q,'supplier','Supplier A','reference','Q1','issued_on','2026-11-28','valid_until','2026-12-31','quantity',1,'unit_price',100,'currency','PHP','shipping_total',0,'shipping_currency','PHP','tax_basis','tax_exclusive','lead_weeks',1));
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),2,'select_quote',jsonb_build_object('quote_id',q,'reason','Compatibility test'));
 begin
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),3,'link_po',links||'{"client_po_id":"11111111-0000-4000-8000-000000000004"}');
 raise exception 'archived override accepted';
 exception when sqlstate '42501' then null; end;
 perform public.mrh_procurement_apply(item,rfq,gen_random_uuid(),3,'link_po',links);
 s:=public.mrh_procurement_read(item,rfq)->'rows'->0->'snapshot';
 if s->>'status' is distinct from 'po_linked' or s->>'client_po_id' is distinct from links->>'client_po_id' or s->>'client_po_kind' is distinct from 'legacy' then raise exception 'legacy PO signed link/readback failed'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.mrh_procurement_revisions)<>4 then raise exception 'unexpected revisions'; end if;
 if exists(select * from before_registry except all select * from public.order_intake_registry) or exists(select * from public.order_intake_registry except all select * from before_registry) then raise exception 'registry mutated'; end if;
 if exists(select * from before_overlay except all select * from public.test_legacy_lifecycle) or exists(select * from public.test_legacy_lifecycle except all select * from before_overlay) then raise exception 'overlay mutated'; end if;
 if (select value from private.mrh_sourcing_sensitive_cells where field_name='Buying Price')<>'150.75'::jsonb then raise exception 'pricing changed'; end if;
end $$;
select 'CP_MS_CRM_05D2B_CLIENT_PO_COMPATIBILITY_PASS' as result;
