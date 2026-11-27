-- Execute only against the disposable standalone reference database.
begin;
create schema if not exists private;
\i /tmp/mrh-pricing-v1.sql
insert into material_sourcing.fx_snapshots(id,usd,eur,observed_at,provider,is_demo)
values('cp-ms-crm04b1-test',65.12345678,72.98765432,now(),'synthetic',true);
insert into material_sourcing.materials(id,group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,fx_snapshot_id)
select 'crm04b1-'||s||'-'||c||'-'||hc||'-'||v,'new_group','SYNTHETIC',s,'test','test',q,b,c,h,hc,'cp-ms-crm04b1-test'
from unnest(array['Local','Import','Unknown']) s cross join unnest(array['PHP','USD','EUR']) c
cross join unnest(array['PHP','USD','EUR']) hc
cross join (values ('a',1.234567::numeric,10.075::numeric,0.005::numeric),('b',0.000001,0.005,0.015),('c',4.5,0,0)) x(v,q,b,h);

do $$
declare n integer; mismatches integer;
begin
 select count(*),count(*) filter(where result->'costs' is distinct from
  jsonb_build_object('php',php_equivalent::text,'shipPhp',shipping_php::text,'landed',landed::text,
   'totalLanded',total_landed::text,'selling',selling::text,'vatIn',vat_in::text)
  or result->>'status' is distinct from case when source_type='Unknown' then 'partial' else 'complete' end
  or result->>'formulaVersion' is distinct from 'mrh-pricing-v1')
 into n,mismatches from material_sourcing.material_costs
 cross join lateral(select private.mrh_calculate_pricing_v1(jsonb_build_object(
  'quantity',quantity::text,'buyingPrice',buying_price::text,'currency',currency,
  'shipping',shipping_cost::text,'shipCurrency',shipping_currency,'usd',usd::text,'eur',eur::text,'source',source_type)) result) p
 where id like 'crm04b1-%';
 if n<>81 or mismatches<>0 then raise exception 'B1 reference parity: % mismatches of %',mismatches,n;end if;
 raise notice 'CP_MS_CRM_04B1_REFERENCE_81_PASS';
end $$;

do $$
declare
 base constant jsonb:='{"quantity":"4","buyingPrice":"120.36","currency":"USD","shipping":"20","shipCurrency":"USD","usd":"64.45","eur":"71","source":"Import"}';
 result jsonb;
 example record;
 n integer:=0;
 field text;
begin
 result:=private.mrh_calculate_pricing_v1(base);
 if result->'costs' is distinct from '{"php":"7757.20","shipPhp":"1289.00","landed":"9046.20","totalLanded":"36184.80","selling":"15288.08","vatIn":"68490.60"}'::jsonb then
  raise exception 'Reference amounts mismatch: %',result;end if;
 n:=n+1;
 foreach field in array array['quantity','buyingPrice','currency','shipping','shipCurrency','usd','eur'] loop
  result:=private.mrh_calculate_pricing_v1(base-field);
  if result->>'status' is distinct from 'incomplete' or result->'missing' is distinct from jsonb_build_array(field)
   or result->'costs' is distinct from 'null'::jsonb then raise exception 'Missing %',field;end if;
  n:=n+1;
  result:=private.mrh_calculate_pricing_v1(base||jsonb_build_object(field,null));
  if result->>'status' is distinct from 'incomplete' or result->'missing' is distinct from jsonb_build_array(field)
   or result->'costs' is distinct from 'null'::jsonb then raise exception 'Null %',field;end if;
  n:=n+1;
 end loop;
 for example in select * from (values
  ('quantity','"0"'::jsonb),('quantity','"-1"'),('buyingPrice','"-0.01"'),
  ('shipping','"-1"'),('usd','"0"'),('eur','"0"'),
  ('usd','"NaN"'),('eur','"Infinity"'),('shipping','"1e3"'),
  ('quantity','"0.0000001"'),('usd','"0.000000001"'),
  ('buyingPrice','"100000000000000"'),('eur','"1000000000000"'),
  ('buyingPrice','12.34'),('quantity','true'),('shipping','[]'),
  ('currency','"GBP"'),('shipCurrency','"php"'),('currency','{}'),
  ('usd','" 64.45"'),('shipping','""'),('source','42'),
  ('buyingPrice','"01"'),('eur','"1.2.3"'),('shipping','"1\n"'),
  ('quantity','"1234567890123456789012345678901234567890"')
 ) as v(key,value) loop
  result:=private.mrh_calculate_pricing_v1(base||jsonb_build_object(example.key,example.value));
  if result->>'status' is distinct from 'invalid' or not(result->'invalid' ? example.key)
   or result->'costs' is distinct from 'null'::jsonb then raise exception 'Invalid % %: %',example.key,example.value,result;end if;
  n:=n+1;
 end loop;
 for example in select * from (values
  ('Unknown'::text,'unknown'),(''::text,'unsupported'),('Other'::text,'unsupported'),(null::text,'missing')
 ) as v(source,expected) loop
  result:=private.mrh_calculate_pricing_v1(base||jsonb_build_object('source',example.source));
  if result->>'status' is distinct from 'partial' or result->>'sourceStatus' is distinct from example.expected
   or result->'costs'->>'totalLanded' is distinct from '36184.80'
   or result->'costs'->'selling' is distinct from 'null'::jsonb or result->'costs'->'vatIn' is distinct from 'null'::jsonb then raise exception 'Source classification %',result;end if;
  n:=n+1;
 end loop;
 result:=private.mrh_calculate_pricing_v1(base-'source');
 if result->>'status'<>'partial' or result->>'sourceStatus'<>'missing' then raise exception 'Absent source';end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1(base||'{"buyingPrice":"0","shipping":"0","source":"Local"}');
 if result->'costs' is distinct from '{"php":"0.00","shipPhp":"0.00","landed":"0.00","totalLanded":"0.00","selling":"0.00","vatIn":"0.00"}'::jsonb then raise exception 'Zero distinction';end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1(base||'{"quantity":"1","buyingPrice":"10.075","currency":"PHP","shipping":"0.005","shipCurrency":"PHP","source":"Local"}');
 if result->'costs' is distinct from '{"php":"10.08","shipPhp":"0.01","landed":"10.09","totalLanded":"10.09","selling":"13.12","vatIn":"14.69"}'::jsonb then raise exception 'Rounding sequence %',result;end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1(base||'{"quantity":"99999999999999.999999","buyingPrice":"99999999999999.999999","currency":"PHP","shipping":"0","shipCurrency":"PHP","source":"Local"}');
 if result->>'status'<>'complete' or result->'costs'->>'totalLanded'<>'9999999999999999999900000000.00' then raise exception 'Large exact amount %',result;end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1(base||'{"legacySelling":"99.99"}');
 if result->>'status'<>'invalid' or result->'invalid' is distinct from '["unexpectedField"]'::jsonb then raise exception 'Legacy selling must not become derived input';end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1((base-'usd')||'{"currency":"PHP","shipCurrency":"PHP"}');
 if result->>'status'<>'incomplete' then raise exception 'Existing paired FX contract changed';end if;
 n:=n+1;
 result:=private.mrh_calculate_pricing_v1((base-'quantity')||'{"usd":"0"}');
 if result->>'status'<>'invalid' or result->'missing' is distinct from '["quantity"]'::jsonb or result->'invalid' is distinct from '["usd"]'::jsonb then raise exception 'Mixed missing and invalid';end if;
 n:=n+1;
 foreach result in array array[null::jsonb,'null'::jsonb,'[]'::jsonb,'42'::jsonb] loop
  if private.mrh_calculate_pricing_v1(result)->>'status' is distinct from 'invalid' then raise exception 'Non-object accepted';end if;
  n:=n+1;
 end loop;
 if n<>56 then raise exception 'Unexpected edge count %',n;end if;
 raise notice 'CP_MS_CRM_04B1_EDGE_CASES_PASS %',n;
end $$;
rollback;
