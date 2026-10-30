-- Live CP-A12.1 remediation: stale compare-and-set conflicts use PostgREST HTTP 409, not PostgreSQL serialization failure SQLSTATE 40001.
-- No changes to role checks, item locks, writes, or audit.
CREATE OR REPLACE FUNCTION public.wm_set_board_cell_if_current(p_item_id uuid, p_column_id uuid, p_value jsonb, p_expected_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.work_board_items%rowtype;
  c public.work_board_columns%rowtype;
  current_value jsonb;
  next_title text;
begin
  -- Lock the item to serialize compare-and-set decisions for both system and
  -- custom cells belonging to this item.
  select * into i from public.work_board_items where id=p_item_id for update;
  if i.id is null or not public.work_board_access(i.board_id,'edit') then
    raise exception 'Board edit access denied' using errcode='42501';
  end if;

  -- A NULL column id represents the intrinsic item title. Modern Boards may
  -- intentionally have an empty/custom-only schema, so title concurrency cannot
  -- depend on the presence of a legacy system title column.
  if p_column_id is null then
    current_value:=to_jsonb(i.title);
  else
    select * into c from public.work_board_columns where id=p_column_id and board_id=i.board_id;
    if c.id is null then raise exception 'Column does not belong to this board'; end if;

    if c.system_key='title' then current_value:=to_jsonb(i.title);
    elsif c.system_key='status' then current_value:=coalesce(to_jsonb(i.status),'null'::jsonb);
    elsif c.system_key='assignee' then current_value:=coalesce(to_jsonb(i.assignee_id::text),'null'::jsonb);
    elsif c.system_key='due_date' then current_value:=coalesce(to_jsonb(i.due_date::text),'null'::jsonb);
    elsif c.system_key='notes' then current_value:=to_jsonb(coalesce(i.notes,''));
    else
      select value into current_value from public.work_board_item_values where item_id=i.id and column_id=c.id;
      current_value:=coalesce(current_value,'null'::jsonb);
    end if;
  end if;

  if current_value is distinct from coalesce(p_expected_value,'null'::jsonb) then
    raise exception 'This Board value changed in another session. Reload the latest value before saving.' using errcode='PT409';
  end if;

  if p_column_id is null then
    if p_value is null or jsonb_typeof(p_value)<>'string' then
      raise exception 'Item name must contain 1-240 characters';
    end if;
    next_title:=btrim(p_value#>>'{}');
    if char_length(next_title) not between 1 and 240 then
      raise exception 'Item name must contain 1-240 characters';
    end if;
    update public.work_board_items set title=next_title,updated_by=auth.uid(),updated_at=now() where id=i.id;
    update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=i.board_id;
    perform public.work_board_log(i.board_id,'item.cell_updated','Item name updated','item',i.id::text,jsonb_build_object('column_id',null,'column_name','Item','column_key','title'));
  else
    perform public.wm_set_board_cell(p_item_id,p_column_id,p_value);
  end if;
end $function$
;
