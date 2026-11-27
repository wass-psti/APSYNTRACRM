-- CP-MS-CRM-04B.2 candidate: NOT APPLIED to production.
-- Internal immutable history, no public RPC or changes to existing tables/policies.
create table private.mrh_fx_snapshots (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 item_id uuid not null,
 provenance text not null,
 usd numeric not null check(usd>0 and usd<1000000000000 and scale(trim_scale(usd))<=8),
 eur numeric not null check(eur>0 and eur<1000000000000 and scale(trim_scale(eur))<=8),
 provider text,
 observation_ref text,
 observed_at timestamptz,
 retrieved_at timestamptz,
 usd_revision bigint,
 eur_revision bigint,
 recorded_at timestamptz not null default clock_timestamp(),
 constraint mrh_fx_provenance_check check (
  (provenance='provider_reported' and provider is not null and length(provider) between 1 and 120
   and provider=btrim(provider) and observation_ref is not null and length(observation_ref) between 1 and 240
   and observation_ref=btrim(observation_ref) and observed_at is not null and retrieved_at is not null
   and isfinite(observed_at) and isfinite(retrieved_at) and observed_at<=retrieved_at and retrieved_at<=recorded_at
   and usd_revision is null and eur_revision is null)
  or
  (provenance='legacy_unverified' and provider is null and observation_ref is null
   and observed_at is null and retrieved_at is null
   and usd_revision is not null and usd_revision>0 and eur_revision is not null and eur_revision>0)
 ),
 constraint mrh_fx_snapshot_identity unique nulls not distinct
  (workspace_id,item_id,provenance,usd,eur,provider,observation_ref,observed_at,usd_revision,eur_revision)
);
-- Historical identity deliberately has no FK to live items: existing deletion and
-- archive semantics are unchanged. Scope is validated on every capture.
create function private.mrh_fx_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 raise exception 'FX snapshot history is immutable' using errcode='23514';
end $$;
create trigger mrh_fx_no_change before update or delete on private.mrh_fx_snapshots
 for each row execute function private.mrh_fx_immutable();
create trigger mrh_fx_no_truncate before truncate on private.mrh_fx_snapshots
 for each statement execute function private.mrh_fx_immutable();

create function private.mrh_fx_parse_rate(p_rate text)
returns numeric language plpgsql immutable set search_path='' as $$
begin
 if p_rate is null or length(p_rate)>21 or p_rate !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,8})?$' then return null; end if;
 if p_rate::numeric<=0 then return null; end if;
 return p_rate::numeric;
end $$;

create function private.mrh_fx_material_workspace(p_item uuid)
returns uuid language plpgsql volatile set search_path='' as $$
declare v_workspace uuid;
begin
 select b.workspace_id into v_workspace
 from public.work_board_items i join public.work_boards b on b.id=i.board_id
 where i.id=p_item and i.board_id='617c4c0f-e343-4b3b-8456-50d47dcbaf99'
 and i.group_id='21566a87-b287-4a61-b521-bb233956e09e'
 and i.archived_at is null and b.name='Material Request Hub' and b.status='active'
 for key share of i,b;
 if v_workspace is null then raise exception 'Material unavailable for FX capture' using errcode='PT409';end if;
 return v_workspace;
end $$;

-- Only called by the internal capture wrappers. Unique semantic identity handles
-- simultaneous retries without mutating a previously recorded snapshot.
create function private.mrh_fx_insert(
 p_workspace uuid,p_item uuid,p_kind text,p_usd numeric,p_eur numeric,
 p_provider text,p_ref text,p_observed timestamptz,p_retrieved timestamptz,
 p_usd_rev bigint,p_eur_rev bigint)
returns uuid language plpgsql volatile set search_path='' as $$
declare v_id uuid;
begin
 insert into private.mrh_fx_snapshots(workspace_id,item_id,provenance,usd,eur,provider,observation_ref,
  observed_at,retrieved_at,usd_revision,eur_revision)
 values(p_workspace,p_item,p_kind,p_usd,p_eur,p_provider,p_ref,p_observed,p_retrieved,p_usd_rev,p_eur_rev)
 on conflict on constraint mrh_fx_snapshot_identity do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from private.mrh_fx_snapshots
  where workspace_id=p_workspace and item_id=p_item and provenance=p_kind and usd=p_usd and eur=p_eur
   and provider is not distinct from p_provider and observation_ref is not distinct from p_ref
   and observed_at is not distinct from p_observed and usd_revision is not distinct from p_usd_rev
   and eur_revision is not distinct from p_eur_rev;
 end if;
 if v_id is null then raise exception 'Retry snapshot capture' using errcode='40001';end if;
 return v_id;
end $$;

-- Provenance is provider-reported, not verified by this storage function.
-- Future server-side provider adapter must validate the source and timestamps.
create function private.mrh_fx_capture_provider(
 p_item uuid,p_usd text,p_eur text,p_provider text,p_ref text,
 p_observed timestamptz,p_retrieved timestamptz)
returns uuid language plpgsql volatile set search_path='' as $$
declare v_workspace uuid; v_usd numeric; v_eur numeric;
begin
 v_workspace:=private.mrh_fx_material_workspace(p_item);
 v_usd:=private.mrh_fx_parse_rate(p_usd);v_eur:=private.mrh_fx_parse_rate(p_eur);
 if v_usd is null or v_eur is null then raise exception 'Invalid exact FX rate pair' using errcode='22023';end if;
 if p_provider is null or length(p_provider) not between 1 and 120 or p_provider<>btrim(p_provider)
 or p_ref is null or length(p_ref) not between 1 and 240 or p_ref<>btrim(p_ref)
 or p_observed is null or p_retrieved is null or not isfinite(p_observed) or not isfinite(p_retrieved)
 or p_observed>p_retrieved or p_retrieved>clock_timestamp() then
  raise exception 'Invalid provider provenance' using errcode='22023';
 end if;
 return private.mrh_fx_insert(v_workspace,p_item,'provider_reported',v_usd,v_eur,
  p_provider,p_ref,p_observed,p_retrieved,null,null);
end $$;

-- Capture both stored JSON numeric rates and revisions in one MVCC read.
-- No historical observation date or provider is inferred from updated_at.
create function private.mrh_fx_capture_legacy(p_item uuid)
returns jsonb language plpgsql volatile set search_path='' as $$
declare v_workspace uuid; u jsonb; e jsonb; ur bigint; er bigint;
 v_usd numeric; v_eur numeric; v_id uuid; missing text[]:=array[]::text[]; invalid text[]:=array[]::text[];
begin
 v_workspace:=private.mrh_fx_material_workspace(p_item);
 select
  (jsonb_agg(value) filter(where field_name='Ex. Rate USD'))->0,
  (jsonb_agg(value) filter(where field_name='Ex. Rate EUR'))->0,
  max(revision) filter(where field_name='Ex. Rate USD'),
  max(revision) filter(where field_name='Ex. Rate EUR')
 into u,e,ur,er from private.mrh_sourcing_sensitive_cells
 where board_id='617c4c0f-e343-4b3b-8456-50d47dcbaf99' and workspace_id=v_workspace and item_id=p_item
 and field_name in ('Ex. Rate USD','Ex. Rate EUR');
 if u is null or u='null'::jsonb then missing:=array_append(missing,'usd');
 elsif jsonb_typeof(u)='number' then
  v_usd:=private.mrh_fx_parse_rate(trim_scale((u#>>'{}')::numeric)::text);
  if v_usd is null or ur is null or ur<=0 then invalid:=array_append(invalid,'usd');end if;
 else invalid:=array_append(invalid,'usd');end if;
 if e is null or e='null'::jsonb then missing:=array_append(missing,'eur');
 elsif jsonb_typeof(e)='number' then
  v_eur:=private.mrh_fx_parse_rate(trim_scale((e#>>'{}')::numeric)::text);
  if v_eur is null or er is null or er<=0 then invalid:=array_append(invalid,'eur');end if;
 else invalid:=array_append(invalid,'eur');end if;
 if cardinality(missing)>0 or cardinality(invalid)>0 then
  return jsonb_build_object('status',case when cardinality(invalid)>0 then 'invalid' else 'incomplete' end,
   'snapshotId',null,'missing',missing,'invalid',invalid);
 end if;
 v_id:=private.mrh_fx_insert(v_workspace,p_item,'legacy_unverified',v_usd,v_eur,null,null,null,null,ur,er);
 return jsonb_build_object('status','captured','snapshotId',v_id,'missing',missing,'invalid',invalid);
end $$;

create function private.mrh_fx_read(p_workspace uuid,p_item uuid,p_snapshot uuid)
returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('snapshotId',id,'workspaceId',workspace_id,'itemId',item_id,
 'provenance',provenance,'usd',usd::numeric(20,8)::text,'eur',eur::numeric(20,8)::text,
 'provider',provider,'observationRef',observation_ref,'observedAt',observed_at,
 'retrievedAt',retrieved_at,'recordedAt',recorded_at,
 'usdRevision',usd_revision::text,'eurRevision',eur_revision::text)
 from private.mrh_fx_snapshots where id=p_snapshot and workspace_id=p_workspace and item_id=p_item
$$;
-- No new public entry point or grants. Internal callers must retain existing scope checks.
revoke all on table private.mrh_fx_snapshots from public;
revoke all on function private.mrh_fx_immutable(),private.mrh_fx_parse_rate(text),
 private.mrh_fx_material_workspace(uuid),private.mrh_fx_insert(uuid,uuid,text,numeric,numeric,text,text,timestamptz,timestamptz,bigint,bigint),
 private.mrh_fx_capture_provider(uuid,text,text,text,text,timestamptz,timestamptz),
 private.mrh_fx_capture_legacy(uuid),private.mrh_fx_read(uuid,uuid,uuid) from public;
