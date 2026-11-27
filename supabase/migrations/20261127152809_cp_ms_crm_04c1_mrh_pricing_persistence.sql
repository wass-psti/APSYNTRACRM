-- CP-MS-CRM-04B.3 disposable candidate only. NOT APPLIED.
-- No source-table writes, public RPC, provider network or change to existing permissions.
create table private.mrh_pricing_versions (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 item_id uuid not null,
 fx_snapshot_id uuid references private.mrh_fx_snapshots(id),
 formula_version text not null,
 input_state jsonb not null,
 pricing_inputs jsonb not null,
 calculation jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index mrh_pricing_versions_item_history
 on private.mrh_pricing_versions(workspace_id,item_id,recorded_at,id);

create function private.mrh_pricing_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 raise exception 'Pricing history is immutable' using errcode='23514';
end $$;
create trigger mrh_pricing_no_change before update or delete on private.mrh_pricing_versions
 for each row execute function private.mrh_pricing_immutable();
create trigger mrh_pricing_no_truncate before truncate on private.mrh_pricing_versions
 for each statement execute function private.mrh_pricing_immutable();

-- One MVCC statement. JSON values are transported as JSON text, so both
-- decimals and bigint revision strings survive a future client round trip.
-- The public token is the column identity, exact value and cell updated_at;
-- the private token is the exact value and its existing per-cell revision.
-- A provider snapshot does not depend on unrelated legacy rate cells.
create function private.mrh_pricing_input_state(p_item uuid,p_fx uuid)
returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 with scope as (
  select b.workspace_id,i.id item_id,b.id board_id
  from public.work_board_items i join public.work_boards b on b.id=i.board_id
  where i.id=p_item and b.id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'
   and i.group_id='21566a87-b287-4a61-b521-bb233956e09e' and i.archived_at is null
   and b.name='Material Request Hub' and b.status='active'
 ), fx as (
  select f.* from private.mrh_fx_snapshots f join scope s
   on f.workspace_id=s.workspace_id and f.item_id=s.item_id where f.id=p_fx
 ), columns as (
  select c.* from public.work_board_columns c join scope s on c.board_id=s.board_id
  where c.name in ('Quantity','Source Type')
 ), public_inputs as (
  select jsonb_object_agg(case c.name when 'Quantity' then 'quantity' else 'source' end,
   jsonb_build_object('columnId',c.id,'valueJson',v.value::text,'updatedAt',v.updated_at::text)) data
  from scope s cross join columns c
  left join public.work_board_item_values v on v.item_id=s.item_id and v.column_id=c.id
 ), private_inputs as (
  select jsonb_object_agg(f.input_key,jsonb_build_object('valueJson',v.value::text,'revision',v.revision::text)) data
  from scope s cross join (values ('buyingPrice','Buying Price'),('currency','Currency'),
   ('shipping','Shipping Cost'),('shipCurrency','Shipping Cost Currency'),
   ('usd','Ex. Rate USD'),('eur','Ex. Rate EUR')) f(input_key,field_name)
  left join private.mrh_sourcing_sensitive_cells v on v.board_id=s.board_id
   and v.workspace_id=s.workspace_id and v.item_id=s.item_id and v.field_name=f.field_name
  where f.input_key not in ('usd','eur') or exists(select 1 from fx where provenance='legacy_unverified')
 )
 select jsonb_build_object('workspaceId',s.workspace_id,'itemId',s.item_id,
  'fxSnapshotId',p_fx,'fxProvenance',(select provenance from fx),
  'public',(select data from public_inputs),'private',(select data from private_inputs))
 from scope s
 where (p_fx is null or exists(select 1 from fx))
  and (select count(*) from columns)=2
  and (select count(distinct name) from columns)=2
  and (select count(*) from columns where visible and system_key is null
   and data_type=case name when 'Quantity' then 'number' else 'dropdown' end
   and (column_key like 'custom:%' or column_key like 'custom_%'
    or (name='Quantity' and column_key like 'col_%')))=2
$$;

-- Never accept a legacy string pretending to be a numeric JSON cell.
-- Normalizing trailing zeroes is exact; all other domain checks stay in B.1.
create function private.mrh_pricing_cell_input(p_cell jsonb,p_kind text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v jsonb;
begin
 v:=(p_cell->>'valueJson')::jsonb;
 if v is null or v='null'::jsonb then return 'null'::jsonb; end if;
 if p_kind='number' and jsonb_typeof(v)='number' then
  return to_jsonb(trim_scale((v#>>'{}')::numeric)::text);
 elsif p_kind='string' and jsonb_typeof(v)='string' then
  return v;
 end if;
 return jsonb_build_object('invalidStoredType',jsonb_typeof(v));
end $$;

create function private.mrh_pricing_read(p_workspace uuid,p_item uuid,p_version uuid)
returns jsonb language sql stable security invoker set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('pricingVersionId',id,'workspaceId',workspace_id,'itemId',item_id,
  'fxSnapshotId',fx_snapshot_id,'formulaVersion',formula_version,'inputState',input_state,
  'pricingInputs',pricing_inputs,'calculation',calculation,'recordedAt',recorded_at)
 from private.mrh_pricing_versions
 where workspace_id=p_workspace and item_id=p_item and id=p_version
$$;

-- Internal call contract: obtain the expected state from the server, then
-- persist in READ COMMITTED. A future signed adapter must delegate existing
-- commercial authority. No public entry point is introduced here.
create function private.mrh_pricing_persist(p_item uuid,p_fx uuid,p_expected jsonb)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_board constant uuid:='617c4c0f-e343-4b3b-8456-50d47dcbaf99';
 v_workspace uuid;
 v_state jsonb;
 v_inputs jsonb;
 v_result jsonb;
 v_fx private.mrh_fx_snapshots%rowtype;
 v_id uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Pricing persistence requires READ COMMITTED' using errcode='25000';
 end if;
 if p_item is null or jsonb_typeof(p_expected) is distinct from 'object' then
  raise exception 'Invalid expected pricing state' using errcode='22023';
 end if;
 -- Per-material serialization plus non-deferrable child FKs prevent new
 -- missing cells from becoming visible between validation and commit.
 -- Existing direct writers may not lock the item: lock existing source
 -- rows too. No table-wide locks or changes to their contracts.
 perform 1 from public.work_board_items i where i.id=p_item and i.board_id=v_board
  and i.group_id='21566a87-b287-4a61-b521-bb233956e09e' and i.archived_at is null for update;
 if not found then raise exception 'Material unavailable for pricing' using errcode='PT409';end if;
 if p_fx is not null then
  select * into v_fx from private.mrh_fx_snapshots where id=p_fx and item_id=p_item;
  if not found then raise exception 'FX snapshot unavailable for pricing' using errcode='PT409';end if;
 end if;
 perform 1 from public.work_board_columns c where c.board_id=v_board
  and c.name in ('Quantity','Source Type') order by c.id for share;
 perform 1 from public.work_board_item_values v join public.work_board_columns c on c.id=v.column_id
  where v.item_id=p_item and c.board_id=v_board and c.name in ('Quantity','Source Type')
  order by v.column_id for update of v;
 perform 1 from private.mrh_sourcing_sensitive_cells v where v.board_id=v_board and v.item_id=p_item
  and (v.field_name in ('Buying Price','Currency','Shipping Cost','Shipping Cost Currency')
   or (v_fx.provenance='legacy_unverified' and v.field_name in ('Ex. Rate USD','Ex. Rate EUR')))
  order by v.field_name for update;
 select b.workspace_id into v_workspace from public.work_boards b
  where b.id=v_board and b.name='Material Request Hub' and b.status='active' for share;
 if v_workspace is null then raise exception 'Material board unavailable for pricing' using errcode='PT409';end if;
 v_state:=private.mrh_pricing_input_state(p_item,p_fx);
 if v_state is null or v_state is distinct from p_expected then
  raise exception 'Pricing inputs changed; refresh and retry after review' using errcode='PT409';
 end if;
 -- A freshly read state cannot authorize an older legacy observation.
 -- Validate both exact stored rates and both existing revision tokens.
 if v_fx.provenance='legacy_unverified' and (
  private.mrh_fx_parse_rate(private.mrh_pricing_cell_input(v_state->'private'->'usd','number')#>>'{}') is distinct from v_fx.usd
  or private.mrh_fx_parse_rate(private.mrh_pricing_cell_input(v_state->'private'->'eur','number')#>>'{}') is distinct from v_fx.eur
  or v_state->'private'->'usd'->>'revision' is distinct from v_fx.usd_revision::text
  or v_state->'private'->'eur'->>'revision' is distinct from v_fx.eur_revision::text) then
  raise exception 'Legacy FX snapshot is stale; capture the current pair' using errcode='PT409';
 end if;
 -- Identity is exact state plus formula, not client-calculated totals or
 -- an item-level timestamp that changes on unrelated edits.
 select id into v_id from private.mrh_pricing_versions where workspace_id=v_workspace
  and item_id=p_item and formula_version='mrh-pricing-v1' and input_state=v_state
  order by recorded_at,id limit 1;
 if v_id is not null then return private.mrh_pricing_read(v_workspace,p_item,v_id);end if;
 v_inputs:=jsonb_build_object(
  'quantity',private.mrh_pricing_cell_input(v_state->'public'->'quantity','number'),
  'source',private.mrh_pricing_cell_input(v_state->'public'->'source','string'),
  'buyingPrice',private.mrh_pricing_cell_input(v_state->'private'->'buyingPrice','number'),
  'currency',private.mrh_pricing_cell_input(v_state->'private'->'currency','string'),
  'shipping',private.mrh_pricing_cell_input(v_state->'private'->'shipping','number'),
  'shipCurrency',private.mrh_pricing_cell_input(v_state->'private'->'shipCurrency','string'),
  'usd',v_fx.usd::numeric(20,8)::text,'eur',v_fx.eur::numeric(20,8)::text);
 v_result:=private.mrh_calculate_pricing_v1(v_inputs);
 insert into private.mrh_pricing_versions(workspace_id,item_id,fx_snapshot_id,formula_version,input_state,pricing_inputs,calculation)
 values(v_workspace,p_item,p_fx,'mrh-pricing-v1',v_state,v_inputs,v_result) returning id into v_id;
 return private.mrh_pricing_read(v_workspace,p_item,v_id);
end $$;

-- Same private candidate boundary as B.1/B.2, no new public grants.
revoke all on table private.mrh_pricing_versions from public;
revoke all on function private.mrh_pricing_immutable(),private.mrh_pricing_input_state(uuid,uuid),
 private.mrh_pricing_cell_input(jsonb,text),private.mrh_pricing_read(uuid,uuid,uuid),
 private.mrh_pricing_persist(uuid,uuid,jsonb) from public;
