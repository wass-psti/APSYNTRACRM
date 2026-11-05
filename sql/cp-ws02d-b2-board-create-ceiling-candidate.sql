-- CP-WS-02D/B2 — review-only board-creation workspace role ceiling.
-- Production originals (Nov 5, 2026): wm_create_board MD5
-- 8925b3f3203d41306cfbc8a8f21bae87; configured MD5
-- 46576d8e4a295fa95f158d87dc1f0504.
-- Do not run in production without separately approved rollout/rollback and
-- live signed tests. No new grants, application role or data changes here.
BEGIN;
DO $pre$
DECLARE a text;b text;
BEGIN
 IF to_regprocedure('public.wm_create_board(text,text)') IS NULL
 OR to_regprocedure('public.wm_create_board_configured(text,text,jsonb)') IS NULL
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 THEN RAISE EXCEPTION 'Board-create ceiling dependencies unavailable'
 USING ERRCODE='42501'; END IF;
 SELECT pg_get_functiondef('public.wm_create_board(text,text)'::regprocedure)
 INTO a;
 SELECT pg_get_functiondef('public.wm_create_board_configured(text,text,jsonb)'::regprocedure)
 INTO b;
 IF a NOT LIKE '%perform public.work_board_log%'
 OR b NOT LIKE '%public.work_board_normalize_column_config%'
 OR a LIKE '%ws02d_workspace_ceiling%'
 OR b LIKE '%ws02d_workspace_ceiling%'
 THEN RAISE EXCEPTION 'Board-create production contract drift: stop migration'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.wm_create_board(
 p_name text,p_description text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; bid uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if not private.ws02d_workspace_ceiling(ws,caller,'edit') then raise exception 'Workspace role denies board creation' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by)
  values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0);
  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name),'starting_columns',0));
  return bid;
end $function$;
CREATE OR REPLACE FUNCTION public.wm_create_board_configured(
 p_name text,p_description text DEFAULT '',p_columns jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; bid uuid; col jsonb; nm text; dtype text; cfg jsonb; pos integer:=0; key text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if not private.ws02d_workspace_ceiling(ws,caller,'edit') then raise exception 'Workspace role denies board creation' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  if p_columns is null then p_columns:='[]'::jsonb; end if;
  if jsonb_typeof(p_columns)<>'array' then raise exception 'Starting columns must be an array'; end if;
  if jsonb_array_length(p_columns)>30 then raise exception 'A board can contain at most 30 columns'; end if;

  insert into public.work_boards(workspace_id,name,description,created_by,updated_by)
  values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0);

  for col in select value from jsonb_array_elements(p_columns) loop
    nm:=btrim(coalesce(col->>'name',''));
    dtype:=btrim(coalesce(col->>'data_type',''));
    if char_length(nm) not between 1 and 80 then raise exception 'Column name must contain 1-80 characters'; end if;
    if exists(select 1 from public.work_board_columns where board_id=bid and lower(name)=lower(nm)) then raise exception 'Starting column names must be unique'; end if;
    cfg:=public.work_board_normalize_column_config(dtype,coalesce(col->'config','{}'::jsonb));
    key:='col_'||replace(gen_random_uuid()::text,'-','');
    insert into public.work_board_columns(board_id,column_key,name,data_type,system_key,position,visible,required,config,created_by,updated_by)
    values(bid,key,nm,dtype,null,pos,true,false,cfg,caller,caller);
    pos:=pos+1;
  end loop;

  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name),'starting_columns',pos));
  return bid;
end $function$;
-- CREATE OR REPLACE preserves OIDs/old grants. This is an additional maximum
-- permission gate, not permission for any caller to bypass board/domain RBAC.
COMMIT;
