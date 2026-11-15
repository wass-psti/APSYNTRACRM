-- M144.17 draft: grouped Monday.com workbook imports.
-- REVIEW-ONLY: DO NOT APPLY TO THE SHARED PRODUCTION PROJECT.
-- The deployed M143 single-group RPC and its grants are preserved unchanged.
-- A single PostgREST RPC call is one PostgreSQL transaction; if any group
-- fails, all prior group/column/item changes in this call roll back.
create or replace function public.wm_import_board_wizard_groups_atomic(
  p_board_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  section jsonb;
  row_value jsonb;
  proposed jsonb;
  mapping jsonb;
  remapped jsonb := '[]'::jsonb;
  shared jsonb;
  subpayload jsonb;
  answer jsonb;
  result jsonb;
  item jsonb;
  board_version timestamptz;
  id uuid;
  count_groups int;
  expected_rows int;
  rows_seen int := 0;
  created_total int := 0;
  updated_total int := 0;
  skipped_total int := 0;
  rejected_total int := 0;
  columns_total int := 0;
  groups_total int := 0;
  seen_rows int[] := array[]::int[];
  group_names text[] := array[]::text[];
  target_groups text[] := array[]::text[];
  proposed_names text[] := array[]::text[];
  section_key text;
  section_name text;
  proposed_name text;
  source_row int;
  first_pass boolean := true;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' or p_payload->>'contract' <> 'm14417-v1' then
    raise exception 'Unsupported grouped Board Import contract' using errcode='22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'groups'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'rows'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'mappings'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'newColumns'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'matches'),'') <> 'object' then
    raise exception 'Grouped import requires groups, rows, mappings and matching policy' using errcode='22023';
  end if;
  count_groups := jsonb_array_length(p_payload->'groups');
  expected_rows := jsonb_array_length(p_payload->'rows');
  if count_groups not between 2 and 25 or expected_rows not between 1 and 5000 then
    raise exception 'Grouped import limits: 2-25 groups and 1-5000 rows' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text, 0));
  select updated_at into board_version from public.work_boards
    where id=p_board_id and status='active' for update;
  if board_version is null or not public.work_board_access(p_board_id,'edit') then
    raise exception 'Active Board edit access is required' using errcode='42501';
  end if;
  if p_expected_updated_at is null or board_version is distinct from p_expected_updated_at then
    raise exception 'Board changed since grouped import preview' using errcode='PT409';
  end if;
  -- Before ANY write, require distinct group targets and a bijection of source rows.
  for section in select value from jsonb_array_elements(p_payload->'groups') loop
    if coalesce(jsonb_typeof(section),'') <> 'object'
       or coalesce(jsonb_typeof(section->'group'),'') <> 'object'
       or coalesce(jsonb_typeof(section->'rows'),'') <> 'array' then
      raise exception 'Malformed source group' using errcode='22023';
    end if;
    section_name := btrim(coalesce(section->>'name',''));
    if char_length(section_name) not between 1 and 120
       or coalesce(section->>'heading_row','') !~ '^[0-9]+$' then
      raise exception 'Invalid source group name or heading position' using errcode='22023';
    end if;
    if lower(section_name)=any(group_names) then raise exception 'Duplicate source group names' using errcode='22023'; end if;
    group_names := array_append(group_names,lower(section_name));
    if jsonb_array_length(section->'rows')=0 then raise exception 'Every source group must contain items' using errcode='22023'; end if;
    if section->'group'->>'action'='create' then
      proposed_name := lower(btrim(coalesce(section->'group'->>'name','')));
      if proposed_name='' or char_length(proposed_name)>120
         or proposed_name=any(proposed_names) then
        raise exception 'Ambiguous target group name' using errcode='22023';
      end if;
      proposed_names := array_append(proposed_names,proposed_name);
      if exists(select 1 from public.work_board_groups g where g.board_id=p_board_id and lower(btrim(g.title))=proposed_name) then
        raise exception 'The destination group name already exists' using errcode='PT409';
      end if;
    elsif section->'group'->>'action'='existing' then
      begin id := (section->'group'->>'groupId')::uuid;
      exception when others then raise exception 'Invalid destination group ID' using errcode='22023'; end;
      if not exists(select 1 from public.work_board_groups g where g.id=id and g.board_id=p_board_id) then
        raise exception 'Destination group is not on this Board' using errcode='23503';
      end if;
      if id::text=any(target_groups) then raise exception 'Different source groups share a destination' using errcode='22023'; end if;
      target_groups := array_append(target_groups,id::text);
    else
      raise exception 'Unsupported target group action' using errcode='22023';
    end if;
    for row_value in select value from jsonb_array_elements(section->'rows') loop
      if coalesce(jsonb_typeof(row_value),'') <> 'object' or coalesce(row_value->>'source_row','') !~ '^[0-9]+$' then
        raise exception 'Invalid source row in group' using errcode='22023';
      end if;
      source_row := (row_value->>'source_row')::int;
      if source_row=any(seen_rows) then raise exception 'Source row occurs in more than one group' using errcode='22023'; end if;
      seen_rows := array_append(seen_rows,source_row);
      rows_seen := rows_seen+1;
    end loop;
  end loop;
  if rows_seen<>expected_rows then raise exception 'Unassigned source rows in grouped import' using errcode='22023'; end if;
  -- Root rows are a second, independently supplied proof of group coverage.
  for row_value in select value from jsonb_array_elements(p_payload->'rows') loop
    if (row_value->>'source_row')::int <> all(seen_rows) then
      raise exception 'A root source row is absent from the grouped sections' using errcode='22023';
    end if;
  end loop;
  shared := jsonb_build_object('contract','m143-v1','worksheet',p_payload->'worksheet',
    'mappings',p_payload->'mappings','newColumns',p_payload->'newColumns','matches',p_payload->'matches');
  for section in select value from jsonb_array_elements(p_payload->'groups') loop
    select updated_at into board_version from public.work_boards where id=p_board_id for update;
    subpayload := shared || jsonb_build_object('group',section->'group','rows',section->'rows');
    if not first_pass then
      -- The first reviewed M143 call created the proposed columns. Convert all
      -- subsequent sections to mappings of those exact columns, not duplicates.
      remapped := '[]'::jsonb;
      for mapping in select value from jsonb_array_elements(p_payload->'mappings') loop
        if mapping->>'action'='create' then
          select c.id into id from public.work_board_columns c
            where c.board_id=p_board_id and lower(btrim(c.name))=lower(btrim(mapping->>'name'));
          if id is null then raise exception 'Created column is missing in subsequent group' using errcode='PT409'; end if;
          mapping := jsonb_build_object('source',mapping->>'source','action','existing','columnId',id::text);
        end if;
        remapped := remapped || jsonb_build_array(mapping);
      end loop;
      subpayload := subpayload || jsonb_build_object('mappings',remapped,'newColumns','[]'::jsonb);
    end if;
    result := public.wm_import_board_wizard_atomic(p_board_id,board_version,subpayload);
    created_total := created_total + coalesce((result->>'created')::int,0);
    updated_total := updated_total + coalesce((result->>'updated')::int,0);
    skipped_total := skipped_total + coalesce((result->>'skipped')::int,0);
    rejected_total := rejected_total + coalesce((result->>'rejected')::int,0);
    columns_total := columns_total + coalesce((result->>'columnsCreated')::int,0);
    groups_total := groups_total + coalesce((result->>'groupsCreated')::int,0);
    first_pass := false;
  end loop;
  if created_total+updated_total+skipped_total+rejected_total<>expected_rows then
    raise exception 'Grouped import summary mismatch; rolling back' using errcode='22023';
  end if;
  return jsonb_build_object('created',created_total,'updated',updated_total,'skipped',skipped_total,
    'rejected',rejected_total,'affected',created_total+updated_total,
    'columnsCreated',columns_total,'groupsCreated',groups_total);
end $$;

revoke all on function public.wm_import_board_wizard_groups_atomic(uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.wm_import_board_wizard_groups_atomic(uuid,timestamptz,jsonb) to authenticated;
-- PostgREST schema cache reload is required after the approved deployment.

notify pgrst, 'reload schema';
;
