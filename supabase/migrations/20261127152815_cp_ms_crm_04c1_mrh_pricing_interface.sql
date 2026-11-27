-- CP-MS-CRM-04B.4: disposable candidate only. NOT APPLIED.
-- Read and write delegate existing signed MRH commercial contracts.
-- No production migration, existing role changes or provider access.
create function public.mrh_pricing_context(p_item uuid,p_fx uuid default null,p_version uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare
 b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 s jsonb; w uuid; snapshots jsonb; history jsonb; manual text;
begin
 perform public.mrh_sourcing_board_viewer_read(b,p_item);
 s:=private.mrh_pricing_input_state(p_item,p_fx);
 if s is null then raise exception 'Pricing context unavailable' using errcode='PT409';end if;
 w:=(s->>'workspaceId')::uuid;
 -- The selected immutable FX is always returned, even beyond the recent list.
 select coalesce(jsonb_agg(jsonb_build_object('snapshotId',f.id,'provenance',f.provenance,
  'usd',f.usd::numeric(20,8)::text,'eur',f.eur::numeric(20,8)::text,'recordedAt',f.recorded_at,
  'provider',f.provider,'observationRef',f.observation_ref,'observedAt',f.observed_at,'retrievedAt',f.retrieved_at)
  order by f.recorded_at desc,f.id), '[]'::jsonb) into snapshots
 from (select * from private.mrh_fx_snapshots where workspace_id=w and item_id=p_item
  order by (id is not distinct from p_fx) desc,recorded_at desc,id limit 50) f;
 select coalesce(jsonb_agg(private.mrh_pricing_read(w,p_item,v.id) order by v.recorded_at desc,v.id),'[]'::jsonb)
 into history from (select id,recorded_at from private.mrh_pricing_versions where workspace_id=w and item_id=p_item
  order by recorded_at desc,id limit 20) v;
 select value::text into manual from private.mrh_sourcing_sensitive_cells
 where board_id=b and workspace_id=w and item_id=p_item and field_name='Selling Price (VAT-EX)' and jsonb_typeof(value)='number';
 return jsonb_build_object('workspaceId',w,'itemId',p_item,'state',s,'snapshots',snapshots,'history',history,
  'manualSelling',manual,'receipt',private.mrh_pricing_read(w,p_item,p_version),
  'inputs',jsonb_build_object(
   'quantity',private.mrh_pricing_cell_input(s->'public'->'quantity','number'),
   'source',private.mrh_pricing_cell_input(s->'public'->'source','string'),
   'buyingPrice',private.mrh_pricing_cell_input(s->'private'->'buyingPrice','number'),
   'currency',private.mrh_pricing_cell_input(s->'private'->'currency','string'),
   'shipping',private.mrh_pricing_cell_input(s->'private'->'shipping','number'),
   'shipCurrency',private.mrh_pricing_cell_input(s->'private'->'shipCurrency','string')));
end $$;

create function public.mrh_save_pricing_atomic(p_item uuid,p_fx uuid,p_expected jsonb,p_draft jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 b constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 w uuid; s jsonb; f private.mrh_fx_snapshots%rowtype; calculated jsonb;
 public_changes jsonb:='[]';private_changes jsonb:='[]';
 k text; n text; old_cell jsonb; old_value jsonb; new_value jsonb; receipt jsonb;
begin
 -- Existing commercial write authority; ordinary edit entry point unchanged.
 w:=private.mrh_sourcing_scope(b,p_item);
 if not coalesce(public.work_board_access(b,'edit'),false) then
  raise exception 'Material pricing edit denied' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Pricing save requires READ COMMITTED' using errcode='25000';end if;
 if p_fx is null or jsonb_typeof(p_expected) is distinct from 'object' or
  jsonb_typeof(p_draft) is distinct from 'object' or
  not(p_draft ?& array['quantity','source','buyingPrice','currency','shipping','shipCurrency']) or
  (select count(*) from jsonb_object_keys(p_draft))<>6 then
  raise exception 'Invalid pricing draft' using errcode='22023';end if;
 perform 1 from public.work_board_items i where id=p_item and board_id=b
  and group_id='21566a87-b287-4a61-b521-bb233956e09e' and archived_at is null for update;
 if not found then raise exception 'Material unavailable' using errcode='PT409';end if;
 select * into f from private.mrh_fx_snapshots where id=p_fx and workspace_id=w and item_id=p_item;
 if not found then raise exception 'FX snapshot unavailable' using errcode='PT409';end if;
 -- Match B.3 lock order. A parent lock alone does not serialize direct cell edits.
 perform 1 from public.work_board_columns c where c.board_id=b and c.name in ('Quantity','Source Type') order by c.id for share;
 perform 1 from public.work_board_item_values v join public.work_board_columns c on c.id=v.column_id
  where v.item_id=p_item and c.board_id=b and c.name in ('Quantity','Source Type') order by v.column_id for update of v;
 perform 1 from private.mrh_sourcing_sensitive_cells v where v.board_id=b and v.item_id=p_item
  and (v.field_name in ('Buying Price','Currency','Shipping Cost','Shipping Cost Currency')
   or (f.provenance='legacy_unverified' and v.field_name in ('Ex. Rate USD','Ex. Rate EUR'))) order by v.field_name for update;
 perform 1 from public.work_boards where id=b and workspace_id=w and status='active' for share;
 if not found then raise exception 'Material scope changed' using errcode='PT409';end if;
 s:=private.mrh_pricing_input_state(p_item,p_fx);
 if s is null or s is distinct from p_expected then
  raise exception 'Pricing inputs changed; reload and review the retained draft' using errcode='PT409';end if;
 calculated:=private.mrh_calculate_pricing_v1(p_draft||jsonb_build_object('usd',f.usd::numeric(20,8)::text,'eur',f.eur::numeric(20,8)::text));
 if calculated->>'status' not in ('complete','partial') then
  raise exception 'Pricing draft is incomplete or invalid' using errcode='22023';end if;
 -- Exact numeric strings are converted by PostgreSQL, not JS Number.
 foreach k in array array['quantity','source'] loop
  old_cell:=s->'public'->k;
  old_value:=coalesce((old_cell->>'valueJson')::jsonb,'null'::jsonb);
  new_value:=case when k='quantity' then to_jsonb((p_draft->>k)::numeric) else p_draft->k end;
  if new_value is distinct from old_value then
   if k='source' and new_value<>'null'::jsonb and (new_value#>>'{}') not in ('Local','Import') then
    raise exception 'Select Local, Import or an empty source' using errcode='22023';end if;
   public_changes:=public_changes||jsonb_build_array(jsonb_build_object('column_id',old_cell->>'columnId','value',new_value,'expected_value',old_value));
  end if;
 end loop;
 for k,n in select * from (values ('buyingPrice','Buying Price'),('currency','Currency'),
  ('shipping','Shipping Cost'),('shipCurrency','Shipping Cost Currency')) x(input_key,field_name) loop
  old_cell:=s->'private'->k;
  old_value:=(old_cell->>'valueJson')::jsonb;
  new_value:=case when k in ('buyingPrice','shipping') then to_jsonb((p_draft->>k)::numeric) else p_draft->k end;
  if new_value is distinct from old_value then
   private_changes:=private_changes||jsonb_build_array(jsonb_build_object('field_name',n,'value',new_value,'expected_revision',old_cell->>'revision'));
  end if;
 end loop;
 if jsonb_array_length(public_changes)+jsonb_array_length(private_changes)>0 then
  perform public.mrh_edit_material_atomic(p_item,public_changes,private_changes);
 end if;
 -- B.3 validates legacy FX freshness after delegated writes and holds the same
 -- source locks to commit. If persisted values differ from the requested
 -- calculation (including server normalization), the whole transaction rolls back.
 receipt:=private.mrh_pricing_persist(p_item,p_fx,private.mrh_pricing_input_state(p_item,p_fx));
 -- A rounded total match alone cannot prove exact persistence.
 if (receipt->'pricingInputs'->>'quantity')::numeric is distinct from (p_draft->>'quantity')::numeric
 or (receipt->'pricingInputs'->>'buyingPrice')::numeric is distinct from (p_draft->>'buyingPrice')::numeric
 or (receipt->'pricingInputs'->>'shipping')::numeric is distinct from (p_draft->>'shipping')::numeric
 or receipt->'pricingInputs'->>'currency' is distinct from p_draft->>'currency'
 or receipt->'pricingInputs'->>'shipCurrency' is distinct from p_draft->>'shipCurrency'
 or receipt->'pricingInputs'->>'source' is distinct from p_draft->>'source' then
  raise exception 'Persisted pricing inputs differ from reviewed draft' using errcode='PT409';end if;
 if receipt->'calculation' is distinct from calculated then
  raise exception 'Persisted pricing calculation differs from the reviewed draft' using errcode='PT409';end if;
 return receipt;
end $$;
-- Candidate API only. Same signed viewer / commercial writer authority; do not
-- install before production activation approval. No changes to existing grants.
revoke all on function public.mrh_pricing_context(uuid,uuid,uuid),public.mrh_save_pricing_atomic(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mrh_pricing_context(uuid,uuid,uuid),public.mrh_save_pricing_atomic(uuid,uuid,jsonb,jsonb) to authenticated;
