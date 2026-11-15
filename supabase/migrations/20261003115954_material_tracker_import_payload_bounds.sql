-- Harden Material Tracker import payload/reference bounds.
create or replace function private.material_tracker_import_row_error(p_row jsonb)
returns text
language plpgsql
immutable
set search_path = public, private, pg_temp
as $$
declare
  p jsonb := coalesce(p_row->'payload','{}'::jsonb);
  v text;
  n numeric;
  rel jsonb;
begin
  if jsonb_typeof(p_row) <> 'object' then return 'row must be an object'; end if;
  if octet_length(p_row::text) > 65536 then return 'row exceeds 64 KiB import limit'; end if;
  v := btrim(coalesce(p_row->>'id',''));
  if v <> '' and (length(v) > 128 or v !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') then return 'invalid Material ID'; end if;
  v := btrim(coalesce(p_row->>'name',''));
  if v = '' then return 'Part Number is required'; end if;
  if length(v) > 200 then return 'Part Number exceeds 200 characters'; end if;
  if coalesce(p_row->>'groupId','') not in ('new_group','topics') then return 'invalid Group'; end if;
  if jsonb_typeof(p) <> 'object' then return 'payload must be an object'; end if;
  if coalesce(p->>'sourceType','') not in ('Local','Import') then return 'invalid Source Type'; end if;
  if btrim(coalesce(p->>'materialDescription','')) = '' or length(p->>'materialDescription') > 4000 then return 'invalid Material Description'; end if;
  if btrim(coalesce(p->>'brand','')) = '' or length(p->>'brand') > 200 then return 'invalid Brand'; end if;
  v := coalesce(p->>'quantity',''); if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Quantity'; end if;
  n := v::numeric; if n <= 0 or n > 1000000000 then return 'Quantity out of range'; end if;
  v := coalesce(p->>'buyingPrice',''); if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Buying Price'; end if;
  n := v::numeric; if n <= 0 or n > 1000000000000000 then return 'Buying Price out of range'; end if;
  if coalesce(p->>'currency','') not in ('PHP','USD','EUR') then return 'invalid Currency'; end if;
  if p ? 'shippingCost' and p->'shippingCost' <> 'null'::jsonb then
    v := p->>'shippingCost'; if v !~ '^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$' then return 'invalid Shipping Cost'; end if;
    n := v::numeric; if n < 0 or n > 1000000000000000 then return 'Shipping Cost out of range'; end if;
  end if;
  if p ? 'shippingCostCurrency' and coalesce(p->>'shippingCostCurrency','') not in ('PHP','USD','EUR') then return 'invalid Shipping Currency'; end if;
  if p ? 'leadtimeInWeeks' and p->'leadtimeInWeeks' <> 'null'::jsonb then
    v := p->>'leadtimeInWeeks'; if v !~ '^[0-9]+$' then return 'invalid Lead Time'; end if;
    n := v::numeric; if n < 0 or n > 5200 then return 'Lead Time out of range'; end if;
  end if;
  if p ? 'dateRequired' and coalesce(p->>'dateRequired','') <> '' then
    v := p->>'dateRequired'; if v !~ '^\d{4}-\d{2}-\d{2}$' then return 'Date Required must be YYYY-MM-DD'; end if;
    begin if to_char(v::date,'YYYY-MM-DD') <> v then return 'invalid Date Required'; end if; exception when others then return 'invalid Date Required'; end;
  end if;
  if length(coalesce(p->>'rfqRefNo','')) > 200 then return 'RFQ Ref No exceeds 200 characters'; end if;
  if length(coalesce(p->>'vendorDetails','')) > 500 then return 'Vendor Details exceeds 500 characters'; end if;
  foreach v in array array['accounts','supplierPoNo'] loop
    if p ? v then
      if jsonb_typeof(p->v->'linkedItems') <> 'array' then return format('invalid %s references',v); end if;
      if jsonb_array_length(p->v->'linkedItems') > 50 then return format('%s exceeds 50 references',v); end if;
      for rel in select value from jsonb_array_elements(p->v->'linkedItems') loop
        if jsonb_typeof(rel) <> 'object' then return format('invalid %s reference object',v); end if;
        if btrim(coalesce(rel->>'name','')) = '' or length(rel->>'name') > 200 then return format('invalid %s reference name',v); end if;
        if length(coalesce(rel->>'id','')) > 200 then return format('invalid %s reference id',v); end if;
      end loop;
    end if;
  end loop;
  return null;
exception when others then
  return 'malformed import row';
end $$;;
