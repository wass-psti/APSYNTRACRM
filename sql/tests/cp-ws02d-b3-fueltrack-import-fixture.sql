-- CP-WS-02D/B3: synthetic FuelTrack activity import/role fixture.
-- Disposable PostgreSQL 17 only. No real employee or production activity.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
  OR to_regprocedure('public.import_fueltrack_activity_backup(jsonb)') IS NOT NULL
  OR to_regclass('public.module_activity_events') IS NOT NULL
 THEN RAISE EXCEPTION 'FuelTrack import fixture prerequisites/collision'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE public.module_activity_events(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL,event_id text NOT NULL,event_type text NOT NULL,
 title text NOT NULL,message text,request_id text,
 actor_user_id uuid NOT NULL REFERENCES public.profiles(id),
 actor_email text,actor_name text,actor_role text,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,module_id,event_id)
);
CREATE TABLE public.ws02d_fixture_fueltrack_roles(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 role text NOT NULL CHECK(role IN('Admin','User'))
);
CREATE FUNCTION public.module_role_for(p_module_id text,p_actor uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $role$
 SELECT CASE WHEN p_module_id='fueltrack-plus' THEN
  (SELECT r.role FROM public.ws02d_fixture_fueltrack_roles r
   WHERE r.user_id=p_actor) ELSE NULL END;
$role$;
-- Legacy import invokes digest(text,text) while search_path is public.
CREATE FUNCTION public.digest(p_text text,p_algorithm text)
RETURNS bytea LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $d$
 SELECT extensions.digest(pg_catalog.convert_to(p_text,'UTF8'),p_algorithm);
$d$;
CREATE OR REPLACE FUNCTION public.import_fueltrack_activity_backup(p_events jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; role_name text; item jsonb; eid text; at_time timestamptz; inserted_count integer:=0; prof public.profiles%rowtype;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if public.module_role_for('fueltrack-plus',caller)<>'Admin' then raise exception 'activity import requires FuelTrack+ Admin' using errcode='42501'; end if;
  if p_events is null or jsonb_typeof(p_events)<>'array' then raise exception 'activity import payload must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_events)>10000 then raise exception 'activity import exceeds 10000 events' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); select * into prof from public.profiles p where p.id=caller;
  for item in select * from jsonb_array_elements(p_events) loop
    eid:=coalesce(nullif(item->>'id',''),'backup-'||encode(digest(item::text,'sha256'),'hex'));
    begin at_time:=coalesce(nullif(item->>'at','')::timestamptz,now()); exception when others then at_time:=now(); end;
    insert into public.module_activity_events(workspace_id,module_id,event_id,event_type,title,message,request_id,actor_user_id,actor_email,actor_name,actor_role,payload,occurred_at)
    values(ws,'fueltrack-plus',eid,
      case when item->>'type' in ('submit','review','issue','system') then item->>'type' else 'system' end,
      left(coalesce(nullif(item->>'title',''),'Imported activity'),240),left(coalesce(item->>'message',''),4000),nullif(item->>'requestId',''),caller,
      coalesce(nullif(item->>'actorEmail',''),prof.email),coalesce(nullif(item->>'actor',''),prof.display_name,prof.email),coalesce(nullif(item->>'actorRole',''),'Imported'),
      coalesce(item->'payload','{}'::jsonb)||jsonb_build_object('backupImported',true,'importedBy',caller,'originalActorUserId',item->>'actorUserId'),at_time)
    on conflict(workspace_id,module_id,event_id) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return inserted_count;
end;
$function$
;
