-- CP-WS-02D/B3 — dormant FuelTrack admin import extra workspace ceiling.
-- Preserve the original Admin-only domain check and exact import behavior.
-- No production change authorized. Original source MD5 2dc777a252161222a3d2e316dd458eb6.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.import_fueltrack_activity_backup(jsonb)') IS NULL
 OR md5(pg_get_functiondef('public.import_fueltrack_activity_backup(jsonb)'::regprocedure))
  <>'2dc777a252161222a3d2e316dd458eb6'
 THEN RAISE EXCEPTION 'FuelTrack import original contract drift' USING ERRCODE='42501'; END IF;
END $guard$;
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
  ws:=public.current_workspace_id(caller);
  IF NOT private.ws02d_workspace_ceiling(ws,caller,'edit') THEN
   RAISE EXCEPTION 'Workspace role denies FuelTrack activity import' USING ERRCODE='42501';
  END IF;
  select * into prof from public.profiles p where p.id=caller;
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
-- Same function OID, grants, Admin domain role, event schema and idempotency.
COMMIT;
