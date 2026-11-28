-- CP-MS-CRM-05A candidate. Read-only board projection; NOT APPLIED.
-- Same board-viewer predicate as mrh_sourcing_board_viewer_read.
-- No pricing recalculation, historical mutation, role changes or provider requests.
create function public.mrh_pricing_board_projection(p_board_id uuid)
returns jsonb language plpgsql stable security definer
set search_path='' set timezone='UTC' as $$
declare
 w uuid; actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null or p_board_id is distinct from '617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 select b.workspace_id into w from public.work_boards b
 join public.work_board_groups g on g.board_id=b.id
 where b.id=p_board_id and b.name='Material Request Hub' and b.status='active'
 and g.id='21566a87-b287-4a61-b521-bb233956e09e' and g.title='Main group';
 if w is null or not coalesce(public.work_board_access(p_board_id,'view'),false)
 or not exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=actor and m.active=true)
 or not exists(select 1 from public.profiles p where p.id=actor and p.status='active') then
  raise exception 'Material sourcing access denied' using errcode='42501';
 end if;
 with items as materialized (
  select i.id from public.work_board_items i
  where i.board_id=p_board_id and i.group_id='21566a87-b287-4a61-b521-bb233956e09e' and i.archived_at is null
 ), latest as materialized (
  select distinct on (v.item_id) v.* from private.mrh_pricing_versions v
  join items i on i.id=v.item_id where v.workspace_id=w
  order by v.item_id,v.recorded_at desc,v.id
 ), classified as materialized (
  select i.id as item_id,v.id as version_id,v.fx_snapshot_id,v.recorded_at,v.formula_version,
   v.pricing_inputs,v.calculation,
   case when v.id is null then 'missing'
        when private.mrh_pricing_input_state(i.id,v.fx_snapshot_id) is distinct from v.input_state then 'stale'
        when v.formula_version<>'mrh-pricing-v1' then 'unavailable'
        when v.calculation->>'status'='complete' then 'current'
        when v.calculation->>'status'='partial' then 'partial'
        else 'incomplete' end as state
  from items i left join latest v on v.item_id=i.id
 ), latest_fx as (
  select f.* from private.mrh_fx_snapshots f join items i on i.id=f.item_id
  where f.workspace_id=w and f.provenance='provider_reported'
  order by f.observed_at desc,f.retrieved_at desc,f.id limit 1
 )
 select jsonb_build_object('boardId',p_board_id,'workspaceId',w,
  'coverage',jsonb_build_object('total',count(*),'current',count(*) filter(where state='current'),
   'missing',count(*) filter(where state='missing'),'stale',count(*) filter(where state='stale'),
   'partial',count(*) filter(where state='partial'),'incomplete',count(*) filter(where state='incomplete'),
   'unavailable',count(*) filter(where state='unavailable')),
  'totals',jsonb_build_object(
   'buying',sum(round((calculation->'costs'->>'php')::numeric*(pricing_inputs->>'quantity')::numeric,2)) filter(where state='current')::text,
   'shipping',sum(round((calculation->'costs'->>'shipPhp')::numeric*(pricing_inputs->>'quantity')::numeric,2)) filter(where state='current')::text,
   'landed',sum((calculation->'costs'->>'totalLanded')::numeric) filter(where state='current')::text,
   'sellingVatIn',sum((calculation->'costs'->>'vatIn')::numeric) filter(where state='current')::text),
  'rows',coalesce(jsonb_agg(jsonb_build_object('itemId',item_id,'state',state,'pricingVersionId',version_id,
   'fxSnapshotId',fx_snapshot_id,'recordedAt',recorded_at,'formulaVersion',formula_version,
   'costs',case when state in ('current','partial') then calculation->'costs' else null end)
   order by item_id),'[]'::jsonb),
  'latestFx',(select jsonb_build_object('snapshotId',id,'itemId',item_id,'provider',provider,
   'provenance',provenance,'observationRef',observation_ref,'observedAt',observed_at,
   'retrievedAt',retrieved_at,'usd',usd::numeric(20,8)::text,'eur',eur::numeric(20,8)::text) from latest_fx))
 into result from classified;
 return result;
end $$;
revoke all on function public.mrh_pricing_board_projection(uuid) from public,anon,authenticated;
grant execute on function public.mrh_pricing_board_projection(uuid) to authenticated;
