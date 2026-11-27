-- CP-MS-CRM-04B.1 candidate: NOT APPLIED to production.
-- Pure calculation only; no table reads/writes, clock, provider or authorization changes.
create function private.mrh_calculate_pricing_v1(p_inputs jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
 fields constant text[]:=array['quantity','buyingPrice','currency','shipping','shipCurrency','usd','eur','source'];
 required_fields constant text[]:=array['quantity','buyingPrice','currency','shipping','shipCurrency','usd','eur'];
 missing text[]:=array[]::text[];
 invalid text[]:=array[]::text[];
 field text;
 raw text;
 amount numeric;
 quantities jsonb:='{}'::jsonb;
 source_status text:='missing';
 source_type text;
 state text;
 buying_php numeric;
 shipping_php numeric;
 landed numeric;
 selling numeric;
 costs jsonb:=null;
begin
 if jsonb_typeof(p_inputs) is distinct from 'object' then
  return jsonb_build_object('formulaVersion','mrh-pricing-v1','status','invalid',
   'missing',missing,'invalid',array['input'],'sourceStatus','missing','costs',null);
 end if;
 if exists(select 1 from jsonb_object_keys(p_inputs) as k(name) where not(k.name=any(fields))) then
  invalid:=array_append(invalid,'unexpectedField');
 end if;
 foreach field in array required_fields loop
  if not(p_inputs ? field) or p_inputs->field='null'::jsonb then
   missing:=array_append(missing,field);
   continue;
  end if;
  if jsonb_typeof(p_inputs->field) is distinct from 'string' then
   invalid:=array_append(invalid,field);
   continue;
  end if;
  raw:=p_inputs->>field;
  if field in ('currency','shipCurrency') then
   if raw not in ('PHP','USD','EUR') then invalid:=array_append(invalid,field); end if;
   continue;
  end if;
  -- Match the established NUMERIC(20,6) and NUMERIC(20,8) input domains.
  -- Reject excess precision rather than silently rounding a financial input.
  if length(raw)>21 or (field in ('usd','eur') and raw !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,8})?$')
   or (field not in ('usd','eur') and raw !~ '^(0|[1-9][0-9]{0,13})([.][0-9]{1,6})?$') then
   invalid:=array_append(invalid,field);
   continue;
  end if;
  amount:=raw::numeric;
  if field in ('quantity','usd','eur') and amount<=0 then
   invalid:=array_append(invalid,field);
   continue;
  end if;
  quantities:=quantities||jsonb_build_object(field,amount);
 end loop;
 if p_inputs ? 'source' and p_inputs->'source'<>'null'::jsonb then
  if jsonb_typeof(p_inputs->'source') is distinct from 'string' then
   invalid:=array_append(invalid,'source');
   source_status:='invalid';
  else
   source_type:=p_inputs->>'source';
   source_status:=case when source_type in ('Local','Import') then 'known'
    when source_type='Unknown' then 'unknown' else 'unsupported' end;
  end if;
 end if;
 if cardinality(invalid)>0 then state:='invalid';
 elsif cardinality(missing)>0 then state:='incomplete';
 else
  buying_php:=round((quantities->>'buyingPrice')::numeric *
   case p_inputs->>'currency' when 'USD' then (quantities->>'usd')::numeric
   when 'EUR' then (quantities->>'eur')::numeric else 1 end,2);
  shipping_php:=round((quantities->>'shipping')::numeric *
   case p_inputs->>'shipCurrency' when 'USD' then (quantities->>'usd')::numeric
   when 'EUR' then (quantities->>'eur')::numeric else 1 end,2);
  landed:=buying_php+shipping_php;
  selling:=round(landed*case source_type when 'Local' then 1.30 when 'Import' then 1.69 else null end,2);
  state:=case when source_status='known' then 'complete' else 'partial' end;
  costs:=jsonb_build_object('php',buying_php::text,'shipPhp',shipping_php::text,
   'landed',landed::text,'totalLanded',round(landed*(quantities->>'quantity')::numeric,2)::text,
   'selling',selling::text,'vatIn',round(selling*(quantities->>'quantity')::numeric*1.12,2)::text);
 end if;
 return jsonb_build_object('formulaVersion','mrh-pricing-v1','status',state,
  'missing',missing,'invalid',invalid,'sourceStatus',source_status,'costs',costs);
end $$;
-- Internal candidate only; no new public RPC or role grants.
revoke all on function private.mrh_calculate_pricing_v1(jsonb) from public;
