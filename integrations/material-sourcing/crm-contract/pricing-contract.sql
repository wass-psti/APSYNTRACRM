-- Candidate calculation contract, executed only in disposable CI.
-- No production migration, public RPC, permissions or persistent table.
begin;
create temporary table cp_ms_pricing_probe(id integer);
create function pg_temp.cp_ms_price(q numeric,b numeric,c text,h numeric,hc text,u numeric,e numeric,s text)
returns jsonb language sql immutable as $$
select case when q is null or q<=0 or b is null or b<0 or h is null or h<0
 or c is null or c not in ('PHP','USD','EUR') or hc is null or hc not in ('PHP','USD','EUR')
 or u is null or u<=0 or e is null or e<=0
 or q>='Infinity'::numeric or b>='Infinity'::numeric or h>='Infinity'::numeric or u>='Infinity'::numeric or e>='Infinity'::numeric
 then null else jsonb_build_object('php',p.buying::text,'shipPhp',p.shipping::text,
 'landed',l.landed::text,'totalLanded',round(l.landed*q,2)::text,
 'selling',v.selling::text,'vatIn',round(v.selling*q*1.12,2)::text) end
from (select round(b*case c when 'USD' then u when 'EUR' then e else 1 end,2) buying,
 round(h*case hc when 'USD' then u when 'EUR' then e else 1 end,2) shipping) p
cross join lateral(select p.buying+p.shipping landed) l
cross join lateral(select round(l.landed*case s when 'Local' then 1.30 when 'Import' then 1.69 else null end,2) selling) v;
$$;
insert into material_sourcing.fx_snapshots(id,usd,eur,observed_at,provider,is_demo)
values('cp-ms-crm02-test',65.12345678,72.98765432,now(),'synthetic',true);
insert into material_sourcing.materials(id,group_id,part_number,source_type,description,brand,quantity,buying_price,currency,shipping_cost,shipping_currency,fx_snapshot_id)
select 'crm02-'||s||'-'||c||'-'||hc||'-'||v,'new_group','SYNTHETIC',s,'test','test',q,b,c,h,hc,'cp-ms-crm02-test'
from unnest(array['Local','Import','Unknown']) s cross join unnest(array['PHP','USD','EUR']) c
cross join unnest(array['PHP','USD','EUR']) hc
cross join (values ('a',1.234567::numeric,10.075::numeric,0.005::numeric),('b',0.000001,0.005,0.015),('c',4.5,0,0)) x(v,q,b,h);
do $$
declare n integer; mismatched integer; result jsonb;
begin
 select count(*),count(*) filter(where pg_temp.cp_ms_price(quantity,buying_price,currency,shipping_cost,shipping_currency,usd,eur,source_type)
 is distinct from jsonb_build_object('php',php_equivalent::text,'shipPhp',shipping_php::text,'landed',landed::text,
 'totalLanded',total_landed::text,'selling',selling::text,'vatIn',vat_in::text))
 into n,mismatched from material_sourcing.material_costs where id like 'crm02-%';
 if n<>81 or mismatched<>0 then raise exception 'Pricing reconciliation mismatch: % / %',mismatched,n;end if;
 result:=pg_temp.cp_ms_price(4,120.36,'USD',20,'USD',64.45,71,'Import');
 if result->>'totalLanded'<>'36184.80' or result->>'selling'<>'15288.08' or result->>'vatIn'<>'68490.60' then raise exception 'Reference pricing mismatch';end if;
 if pg_temp.cp_ms_price(1,0,'PHP',0,'PHP',null,71,'Local') is not null
 or pg_temp.cp_ms_price(1,null,'PHP',0,'PHP',64.45,71,'Local') is not null
 or pg_temp.cp_ms_price(0,1,'PHP',0,'PHP',64.45,71,'Local') is not null then raise exception 'Incomplete input produced price';end if;
 result:=pg_temp.cp_ms_price(1,0,'PHP',0,'PHP',64.45,71,'Unknown');
 if result->>'totalLanded'<>'0.00' or result->>'selling' is not null or result->>'vatIn' is not null then raise exception 'Zero/unknown mismatch';end if;
 raise notice 'PASS 81 exact numeric pricing cases, reference amounts, incomplete input and zero/unknown distinction';
end $$;
rollback;
