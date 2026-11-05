-- CP-WS-02D/B2 disposable original board create contracts and minimal schema.
-- The prior board ACL fixture must already be in place. Synthetic rows only.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.wm_create_board(text,text)') IS NOT NULL
 OR to_regprocedure('public.wm_create_board_configured(text,text,jsonb)') IS NOT NULL
 OR to_regclass('public.work_board_groups') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D/B2 board-create fixture collision'
 USING ERRCODE='42501'; END IF;
END $pre$;
ALTER TABLE public.work_boards ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.work_boards
 ADD COLUMN description text NOT NULL DEFAULT '',
 ADD COLUMN created_by uuid REFERENCES public.profiles(id),
 ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.work_board_members
 ADD COLUMN added_by uuid REFERENCES public.profiles(id);
CREATE TABLE public.work_board_groups(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 title text NOT NULL,position integer NOT NULL
);
CREATE TABLE public.work_board_columns(
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 column_key text NOT NULL,name text NOT NULL,data_type text NOT NULL,
 system_key text,position integer NOT NULL,
 visible boolean NOT NULL,required boolean NOT NULL,config jsonb NOT NULL,
 created_by uuid REFERENCES public.profiles(id),
 updated_by uuid REFERENCES public.profiles(id),
 PRIMARY KEY(board_id,column_key)
);
CREATE TABLE public.ws02d_b2_fixture_board_events(
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 action text NOT NULL,actor uuid
);
CREATE FUNCTION public.work_board_normalize_column_config(
 p_dtype text,p_config jsonb
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $normalize$
 SELECT coalesce(p_config,'{}'::jsonb);
$normalize$;
CREATE FUNCTION public.work_board_log(
 p_board_id uuid,p_event_type text,p_message text,p_entity_type text,
 p_entity_id text,p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $log$
BEGIN
 INSERT INTO public.ws02d_b2_fixture_board_events(board_id,action,actor)
 VALUES(p_board_id,p_event_type,auth.uid());
END $log$;

-- Original deployed wm_create_board body, before workspace-role ceiling.
CREATE FUNCTION public.wm_create_board(
 p_name text,p_description text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; bid uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Board name must contain 1-120 characters'; end if;
  insert into public.work_boards(workspace_id,name,description,created_by,updated_by)
  values(ws,btrim(p_name),left(coalesce(p_description,''),1200),caller,caller) returning id into bid;
  insert into public.work_board_members(board_id,user_id,role,added_by) values(bid,caller,'owner',caller);
  insert into public.work_board_groups(board_id,title,position) values(bid,'Main group',0);
  perform public.work_board_log(bid,'board.created','Board created','board',bid::text,jsonb_build_object('name',btrim(p_name),'starting_columns',0));
  return bid;
end $function$;
CREATE FUNCTION public.wm_create_board_configured(
 p_name text,p_description text DEFAULT '',p_columns jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; bid uuid; col jsonb; nm text; dtype text; cfg jsonb; pos integer:=0; key text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller); if ws is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
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
REVOKE ALL ON FUNCTION public.wm_create_board(text,text),
 public.wm_create_board_configured(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_create_board(text,text),
 public.wm_create_board_configured(text,text,jsonb) TO authenticated;
