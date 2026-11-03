-- CP-BOARD-MENU01: exact live pre-migration board lifecycle functions in disposable PostgreSQL.
CREATE OR REPLACE FUNCTION public.wm_delete_board_permanently(p_board_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare st text;
begin
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  select status into st from public.work_boards where id=p_board_id;
  if st<>'trashed' then raise exception 'Only trashed boards can be permanently deleted'; end if;
  if exists(select 1 from public.work_board_item_files where board_id=p_board_id)
     or exists(select 1 from storage.objects where bucket_id='work-board-files' and name like p_board_id::text||'/%') then
    raise exception 'Remove Board item files and pending Storage objects before permanently deleting the board';
  end if;
  delete from public.work_boards where id=p_board_id;
end $function$;

CREATE OR REPLACE FUNCTION public.wm_set_board_status(p_board_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_status not in ('active','archived','trashed') then raise exception 'Unsupported board status'; end if;
  if not public.work_board_access(p_board_id,'manage') then raise exception 'Board management access denied' using errcode='42501'; end if;
  update public.work_boards set status=p_status,archived_at=case when p_status='archived' then now() else null end,trashed_at=case when p_status='trashed' then now() else null end,updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.'||p_status,case p_status when 'active' then 'Board restored' when 'archived' then 'Board archived' else 'Board moved to trash' end,'board',p_board_id::text,'{}');
end $function$;

CREATE OR REPLACE FUNCTION public.wm_update_board(p_board_id uuid, p_name text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.work_board_access(p_board_id,'edit') then raise exception 'Board edit access denied' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  update public.work_boards set name=btrim(p_name),description=left(coalesce(p_description,''),1200),updated_by=auth.uid(),updated_at=now() where id=p_board_id;
  perform public.work_board_log(p_board_id,'board.updated','Board details updated','board',p_board_id::text,'{}');
end $function$;
