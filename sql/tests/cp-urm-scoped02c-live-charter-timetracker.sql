-- Real pre-migration functions captured for disposable PostgreSQL compatibility.
CREATE OR REPLACE FUNCTION public.charter_admin_roles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_roles jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = v_actor AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('user_id', m.user_id,
      'role', m.role, 'enabled', m.enabled, 'updated_at', m.updated_at)
    ORDER BY m.user_id), '[]'::jsonb)
  INTO v_roles
  FROM public.module_role_assignments m
  JOIN public.workspace_members w ON w.user_id = m.user_id
    AND w.workspace_id = v_workspace AND w.active
  WHERE m.module_id = 'charter-navigator';
  RETURN v_roles;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.charter_admin_set_role(p_user_id uuid, p_role text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_assignment public.module_role_assignments%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot modify your own Charter Navigator role' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('admin','user') OR p_role IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid Charter Navigator role or enabled state' USING ERRCODE = '22023';
  END IF;
  v_workspace := public.current_workspace_id(v_actor);
  IF v_workspace IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = v_actor AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active administrator workspace membership required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE w.user_id = p_user_id AND w.workspace_id = v_workspace
      AND w.active AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target must be an active member of the current workspace' USING ERRCODE = '42501';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.module_role_assignments
      (user_id, module_id, role, enabled, assigned_by)
    VALUES (p_user_id, 'charter-navigator', p_role, true, v_actor)
    ON CONFLICT (user_id, module_id)
    DO UPDATE SET role = EXCLUDED.role, enabled = true,
      assigned_by = EXCLUDED.assigned_by, updated_at = now();
  ELSE
    UPDATE public.module_role_assignments
    SET enabled = false, assigned_by = v_actor, updated_at = now()
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  END IF;

  SELECT * INTO v_assignment FROM public.module_role_assignments
    WHERE user_id = p_user_id AND module_id = 'charter-navigator';
  RETURN pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'role', CASE WHEN v_assignment.user_id IS NULL THEN NULL ELSE v_assignment.role END,
    'enabled', COALESCE(v_assignment.enabled, false),
    'updated_at', v_assignment.updated_at);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.charter_dispatch(p_workspace_id uuid, p_path text, p_method text, p_body jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 uid uuid := auth.uid(); role_name text; v_name text; v_email text;
 v_id uuid; v_owner uuid; v_key text; v_item public.charter_items%ROWTYPE;
 v_record jsonb; v_data jsonb; v_filters jsonb; v_order jsonb;
 v_limit integer; v_offset integer; v_total integer; v_rows jsonb;
 v_sort text; v_dir text; v_version integer; v_storage public.charter_storage%ROWTYPE;
 v_field text; v_group text; v_sum jsonb; v_alias text; v_count_alias text;
 v_arr jsonb := '[]'::jsonb; v_value numeric; v_groups jsonb := '{}'::jsonb;
 v_group_key text; v_group_rec jsonb; v_actor jsonb; v_notify_to uuid;
 v_text text; v_match text[]; v_now timestamptz := now();
BEGIN
 IF uid IS NULL OR p_workspace_id IS NULL OR p_method IS NULL OR p_path IS NULL THEN
   RAISE EXCEPTION 'Unauthorized Charter request' USING ERRCODE='42501'; END IF;
 IF p_body IS NULL THEN p_body:='{}'::jsonb; END IF;
 IF jsonb_typeof(p_body)<>'object' OR length(p_body::text)>65536 OR length(p_path)>220 THEN
   RAISE EXCEPTION 'Malformed Charter request' USING ERRCODE='22023'; END IF;
 SELECT p.display_name,p.email,m.role INTO v_name,v_email,role_name
 FROM public.profiles p
 JOIN public.workspace_members w ON w.user_id=p.id AND w.workspace_id=p_workspace_id AND w.active
 JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id='charter-navigator' AND m.enabled
 WHERE p.id=uid AND p.status='active' AND m.role IN ('admin','user');
 IF role_name IS NULL THEN RAISE EXCEPTION 'Charter access denied' USING ERRCODE='42501'; END IF;
 v_actor := pg_catalog.jsonb_build_object('id',uid::text,'name',coalesce(v_name,v_email),'email',v_email);
 IF p_path='/me' AND p_method='GET' THEN RETURN v_actor || '{"photo_thumb":null}'::jsonb; END IF;
 IF p_path='/users/subscribers' AND p_method='GET' THEN
   RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'id',p.id::text,'name',coalesce(p.display_name,p.email),'email',p.email) ORDER BY p.email)
   FROM public.profiles p JOIN public.workspace_members w ON w.user_id=p.id AND w.workspace_id=p_workspace_id AND w.active
   JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id='charter-navigator' AND m.enabled AND m.role IN ('admin','user')
   WHERE p.status='active'),'[]'::jsonb);
 END IF;
 IF p_path='/items/query' AND p_method='POST' THEN
   v_filters:=p_body->'where'; v_order:=p_body->'orderBy';
   IF v_order IS NOT NULL AND v_order<>'null'::jsonb AND jsonb_typeof(v_order)<>'object' THEN
     RAISE EXCEPTION 'Invalid sort' USING ERRCODE='22023'; END IF;
   v_sort:=coalesce(v_order->>'column','createdAt');
   v_dir:=lower(coalesce(v_order->>'direction','desc'));
   IF v_sort NOT IN ('name','createdAt','updatedAt','tripDate','guests','tier','session','bookingStatus')
      OR v_dir NOT IN ('asc','desc') THEN RAISE EXCEPTION 'Invalid sort' USING ERRCODE='22023'; END IF;
   IF (p_body->'pagination'->>'limit') !~ '^[0-9]{1,3}$' AND p_body->'pagination' ? 'limit' THEN
     RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
   v_limit:=least(250,greatest(1,coalesce((p_body->'pagination'->>'limit')::integer,50)));
   v_offset:=0;
   IF (p_body->'pagination'->>'cursor') IS NOT NULL THEN
     IF (p_body->'pagination'->>'cursor') !~ '^c:[0-9]{1,6}$' THEN
       RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
     v_offset:=substring(p_body->'pagination'->>'cursor' from 3)::integer;
   END IF;
   SELECT count(*) INTO v_total FROM public.charter_items i
   WHERE i.workspace_id=p_workspace_id AND i.archived_at IS NULL
   AND (role_name='admin' OR i.owner_id=uid)
   AND private.charter_match(i.data || pg_catalog.jsonb_build_object('createdAt',i.created_at,'updatedAt',i.updated_at,'group','topics'),v_filters);
   SELECT COALESCE(pg_catalog.jsonb_agg(q.payload),'[]'::jsonb) INTO v_rows FROM (
     SELECT i.data || pg_catalog.jsonb_build_object('id',i.id::text,
       'creator',pg_catalog.jsonb_build_object('id',i.owner_id::text,'name',coalesce(p.display_name,p.email),'email',p.email),
       'createdAt',i.created_at,'updatedAt',i.updated_at,'archived',false,'group','topics','version',i.version) payload
     FROM public.charter_items i JOIN public.profiles p ON p.id=i.owner_id
     WHERE i.workspace_id=p_workspace_id AND i.archived_at IS NULL
       AND (role_name='admin' OR i.owner_id=uid)
       AND private.charter_match(i.data || pg_catalog.jsonb_build_object('createdAt',i.created_at,'updatedAt',i.updated_at,'group','topics'),v_filters)
     ORDER BY
      CASE WHEN v_sort='name' AND v_dir='asc' THEN i.data->>'name' END ASC,
      CASE WHEN v_sort='name' AND v_dir='desc' THEN i.data->>'name' END DESC,
      CASE WHEN v_sort='guests' AND v_dir='asc' THEN (i.data->>'guests')::numeric END ASC,
      CASE WHEN v_sort='guests' AND v_dir='desc' THEN (i.data->>'guests')::numeric END DESC,
      CASE WHEN v_sort='createdAt' AND v_dir='asc' THEN i.created_at END ASC,
      CASE WHEN v_sort='createdAt' AND v_dir='desc' THEN i.created_at END DESC,
      CASE WHEN v_sort='tripDate' AND v_dir='asc' THEN i.data->>'tripDate' END ASC,
      CASE WHEN v_sort='tripDate' AND v_dir='desc' THEN i.data->>'tripDate' END DESC,
      CASE WHEN v_sort='updatedAt' AND v_dir='asc' THEN i.updated_at END ASC,
      CASE WHEN v_sort='updatedAt' AND v_dir='desc' THEN i.updated_at END DESC,
      CASE WHEN v_sort IN ('tier','session','bookingStatus') AND v_dir='asc' THEN i.data->>v_sort END ASC,
      CASE WHEN v_sort IN ('tier','session','bookingStatus') AND v_dir='desc' THEN i.data->>v_sort END DESC,
      i.created_at DESC,i.id
     LIMIT v_limit OFFSET v_offset
   ) q;
   RETURN pg_catalog.jsonb_build_object('items',v_rows,'total',v_total,
     'cursor',CASE WHEN v_offset+v_limit<v_total THEN 'c:'||(v_offset+v_limit)::text ELSE null END);
 END IF;
 IF p_path='/aggregate' AND p_method='POST' THEN
   v_filters:=p_body->'where'; v_field:=p_body->>'groupBy';
   v_count_alias:=coalesce(p_body->>'countAlias','count');
   IF v_field IS NOT NULL AND v_field NOT IN ('session','tier','bookingStatus') THEN
     RAISE EXCEPTION 'Invalid aggregation group' USING ERRCODE='22023'; END IF;
   IF v_count_alias !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' THEN
     RAISE EXCEPTION 'Invalid aggregation alias' USING ERRCODE='22023'; END IF;
   v_sum:=coalesce(p_body->'sums','[]'::jsonb);
   IF jsonb_typeof(v_sum)<>'array' OR jsonb_array_length(v_sum)>4 THEN
     RAISE EXCEPTION 'Invalid aggregation sums' USING ERRCODE='22023'; END IF;
   FOR v_record IN SELECT value FROM jsonb_array_elements(v_sum) LOOP
     IF v_record->>'column' NOT IN ('guests') OR
        coalesce(v_record->>'alias',v_record->>'column') !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' THEN
       RAISE EXCEPTION 'Invalid sum column or alias' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOR v_record IN SELECT i.data FROM public.charter_items i WHERE i.workspace_id=p_workspace_id
    AND i.archived_at IS NULL AND (role_name='admin' OR i.owner_id=uid)
    AND private.charter_match(i.data,v_filters) LOOP
     v_group_key:=coalesce(v_record->>v_field,'Unspecified');
     IF v_field IS NULL THEN v_group_key:='__total'; END IF;
     v_group_rec:=coalesce(v_groups->v_group_key,pg_catalog.jsonb_build_object(v_count_alias,0));
     v_group_rec:=pg_catalog.jsonb_set(v_group_rec,ARRAY[v_count_alias],to_jsonb((v_group_rec->>v_count_alias)::integer+1));
     FOR v_data IN SELECT value FROM jsonb_array_elements(v_sum) LOOP
       v_alias:=coalesce(v_data->>'alias',v_data->>'column');
       v_value:=coalesce((v_record->>(v_data->>'column'))::numeric,0);
       v_group_rec:=pg_catalog.jsonb_set(v_group_rec,ARRAY[v_alias],to_jsonb(coalesce((v_group_rec->>v_alias)::numeric,0)+v_value));
     END LOOP;
     IF v_field IS NOT NULL THEN v_group_rec:=v_group_rec||pg_catalog.jsonb_build_object(v_field,v_group_key); END IF;
     v_groups:=pg_catalog.jsonb_set(v_groups,ARRAY[v_group_key],v_group_rec);
   END LOOP;
   IF v_groups='{}'::jsonb AND v_field IS NULL THEN
     v_group_rec:=pg_catalog.jsonb_build_object(v_count_alias,0);
     FOR v_data IN SELECT value FROM jsonb_array_elements(v_sum) LOOP
       v_group_rec:=v_group_rec||pg_catalog.jsonb_build_object(coalesce(v_data->>'alias',v_data->>'column'),0);
     END LOOP;
     RETURN pg_catalog.jsonb_build_array(v_group_rec);
   END IF;
   SELECT coalesce(pg_catalog.jsonb_agg(value),'[]'::jsonb) INTO v_arr FROM jsonb_each(v_groups);
   RETURN v_arr;
 END IF;
 IF p_path='/items' AND p_method='POST' THEN
   v_data:=p_body - 'id' - 'creator' - 'createdAt' - 'updatedAt' - 'archived' - 'archivedAt'
     - 'version' - 'workspace_id' - 'workspaceId' - 'owner_id' - 'ownerId' - '_group' - '_returnColumns';
   IF nullif(trim(v_data->>'name'),'') IS NULL OR length(v_data->>'name')>250 THEN
     RAISE EXCEPTION 'Booking name required' USING ERRCODE='22023'; END IF;
   INSERT INTO public.charter_items(workspace_id,owner_id,data) VALUES(p_workspace_id,uid,v_data) RETURNING * INTO v_item;
   INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'booking.create',v_item.id::text);
   RETURN v_item.data || pg_catalog.jsonb_build_object('id',v_item.id::text,'creator',v_actor,
     'createdAt',v_item.created_at,'updatedAt',v_item.updated_at,'group','topics','version',v_item.version,'archived',false);
 END IF;
 IF p_path ~ '^/items/[0-9a-fA-F-]{36}(/updates|/notifications)?$' THEN
   v_match:=regexp_match(p_path,'^/items/([0-9a-fA-F-]{36})(/updates|/notifications)?$');
   v_id:=v_match[1]::uuid;
   SELECT * INTO v_item FROM public.charter_items WHERE id=v_id AND workspace_id=p_workspace_id AND archived_at IS NULL FOR UPDATE;
   IF NOT FOUND OR (role_name<>'admin' AND v_item.owner_id<>uid) THEN
     RAISE EXCEPTION 'Booking not found' USING ERRCODE='P0002'; END IF;
   SELECT pg_catalog.jsonb_build_object('id',p.id::text,'name',coalesce(p.display_name,p.email),'email',p.email)
     INTO v_actor FROM public.profiles p WHERE p.id=v_item.owner_id;
   IF p_method='GET' AND v_match[2] IS NULL THEN
     RETURN v_item.data||pg_catalog.jsonb_build_object('id',v_id::text,'creator',v_actor,'createdAt',v_item.created_at,
       'updatedAt',v_item.updated_at,'group','topics','version',v_item.version,'archived',false);
   END IF;
   IF p_method='PATCH' AND v_match[2] IS NULL THEN
     v_data:=coalesce(p_body->'updates',p_body);
     IF jsonb_typeof(v_data)<>'object' THEN RAISE EXCEPTION 'Invalid booking changes' USING ERRCODE='22023'; END IF;
     IF (p_body->>'expectedVersion') IS NOT NULL AND (p_body->>'expectedVersion')::integer<>v_item.version THEN
       RAISE EXCEPTION 'Booking version conflict' USING ERRCODE='40001'; END IF;
     v_data:=v_data - 'id' - 'creator' - 'createdAt' - 'updatedAt' - 'archived' - 'archivedAt'
       - 'version' - 'workspace_id' - 'workspaceId' - 'owner_id' - 'ownerId' - 'group'
       - 'expectedVersion' - 'returnColumns' - '_returnColumns' - '_group';
     UPDATE public.charter_items SET data=v_item.data||v_data,version=version+1,updated_at=v_now
       WHERE id=v_id RETURNING * INTO v_item;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'booking.update',v_id::text);
     RETURN v_item.data||pg_catalog.jsonb_build_object('id',v_id::text,'creator',v_actor,'createdAt',v_item.created_at,
       'updatedAt',v_item.updated_at,'group','topics','version',v_item.version,'archived',false);
   END IF;
   IF p_method='DELETE' AND v_match[2] IS NULL THEN
     UPDATE public.charter_items SET archived_at=v_now,updated_at=v_now,version=version+1 WHERE id=v_id;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'booking.archive',v_id::text);
     RETURN pg_catalog.jsonb_build_object('archived',true,'id',v_id::text);
   END IF;
   IF p_method='POST' AND v_match[2]='/updates' THEN
     v_text:=trim(coalesce(p_body->>'text',''));
     IF length(v_text)<1 OR length(v_text)>10000 THEN RAISE EXCEPTION 'Invalid update' USING ERRCODE='22023'; END IF;
     INSERT INTO public.charter_updates(workspace_id,item_id,actor_id,body) VALUES(p_workspace_id,v_id,uid,v_text) RETURNING id INTO v_id;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'booking.note',v_item.id::text);
     RETURN pg_catalog.jsonb_build_object('id',v_id::text,'itemId',v_item.id::text,'text',v_text,
       'createdBy',pg_catalog.jsonb_build_object('id',uid::text,'name',v_name,'email',v_email),'createdAt',v_now);
   END IF;
   IF p_method='POST' AND v_match[2]='/notifications' THEN
     IF p_body->>'userId' !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'Invalid recipient' USING ERRCODE='22023'; END IF;
     v_notify_to:=(p_body->>'userId')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.workspace_members w ON w.user_id=p.id AND w.workspace_id=p_workspace_id AND w.active
       JOIN public.module_role_assignments m ON m.user_id=p.id AND m.module_id='charter-navigator' AND m.enabled AND m.role IN ('admin','user')
       WHERE p.id=v_notify_to AND p.status='active') THEN
       RAISE EXCEPTION 'Recipient not in Charter workspace' USING ERRCODE='42501'; END IF;
     v_text:=trim(coalesce(p_body->>'message',''));
     IF length(v_text)<1 OR length(v_text)>4000 THEN RAISE EXCEPTION 'Invalid notification' USING ERRCODE='22023'; END IF;
     INSERT INTO public.charter_notifications(workspace_id,item_id,actor_id,recipient_id,message)
       VALUES(p_workspace_id,v_item.id,uid,v_notify_to,v_text) RETURNING id INTO v_id;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'booking.notify',v_item.id::text);
     RETURN pg_catalog.jsonb_build_object('id',v_id::text,'itemId',v_item.id::text,'userId',v_notify_to::text,
       'message',v_text,'createdAt',v_now,'delivery','in-app-only');
   END IF;
 END IF;
 IF p_path ~ '^/storage/[A-Za-z0-9._-]{1,120}$' AND p_method IN ('GET','PUT','DELETE') THEN
   v_key:=substring(p_path from 10);
   IF left(v_key,5)='user_' AND v_key !~ ('^user_'||uid::text||'_') THEN
     RAISE EXCEPTION 'User-scoped storage access denied' USING ERRCODE='42501'; END IF;
   IF p_method<>'GET' AND role_name<>'admin' AND left(v_key,5)<>'user_' THEN
     RAISE EXCEPTION 'Admin privileges required for shared Charter settings' USING ERRCODE='42501'; END IF;
   SELECT * INTO v_storage FROM public.charter_storage WHERE workspace_id=p_workspace_id AND key=v_key FOR UPDATE;
   IF p_method='GET' THEN
     RETURN pg_catalog.jsonb_build_object('value',v_storage.value,'version',v_storage.version); END IF;
   IF (p_body->>'version') IS NOT NULL AND (p_body->>'version')::integer IS DISTINCT FROM v_storage.version THEN
     RAISE EXCEPTION 'Storage concurrency conflict' USING ERRCODE='40001'; END IF;
   IF p_method='PUT' THEN
     IF length(coalesce((p_body->'value')::text,''))>100000 THEN RAISE EXCEPTION 'Storage value too large' USING ERRCODE='22023'; END IF;
     -- First creation is INSERT-only: a simultaneous first writer loses with SQLSTATE 23505
     -- rather than silently overwriting another user's newly created value. Existing rows
     -- are locked by SELECT FOR UPDATE above, so version checks serialize subsequent PUTs.
     IF v_storage.workspace_id IS NULL THEN
       INSERT INTO public.charter_storage(workspace_id,key,value,version,updated_by)
         VALUES(p_workspace_id,v_key,p_body->'value',1,uid)
         RETURNING * INTO v_storage;
     ELSE
       UPDATE public.charter_storage
         SET value=p_body->'value',version=version+1,updated_by=uid,updated_at=v_now
         WHERE workspace_id=p_workspace_id AND key=v_key RETURNING * INTO v_storage;
     END IF;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'storage.put',v_key);
     RETURN pg_catalog.jsonb_build_object('value',v_storage.value,'version',v_storage.version);
   END IF;
   IF p_method='DELETE' THEN
     DELETE FROM public.charter_storage WHERE workspace_id=p_workspace_id AND key=v_key;
     INSERT INTO public.charter_audit(workspace_id,actor_id,action,record_id) VALUES(p_workspace_id,uid,'storage.delete',v_key);
     RETURN pg_catalog.jsonb_build_object('deleted',true,'version',CASE WHEN v_storage.version IS NULL THEN null ELSE v_storage.version+1 END);
   END IF;
 END IF;
 RAISE EXCEPTION 'Operation not allowed' USING ERRCODE='22023';
END $function$
;

CREATE OR REPLACE FUNCTION public.timetracker_team_directory_snapshot(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_data jsonb;
BEGIN
 PERFORM public.apsyntra_role_require_bootstrap_scope(p_workspace_id);
 SELECT jsonb_build_object(
  'workspaceId',p_workspace_id,'bootstrapVerified',true,'mode','staged_only',
  'users',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',p.id,'displayName',p.display_name,'email',p.email,'status',p.status,
    'bootstrapProtected',EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
                               WHERE b.user_id=p.id))
    ORDER BY p.display_name)
   FROM public.workspace_members wm JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.workspace_id=p_workspace_id AND wm.active IS TRUE AND p.status='active'),'[]'::jsonb),
  'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'userId',a.user_id,'moduleId',a.module_id,'role',a.role,'enabled',a.enabled,
    'updatedAt',a.updated_at) ORDER BY a.user_id)
   FROM public.module_role_assignments a JOIN public.workspace_members wm
     ON wm.user_id=a.user_id AND wm.workspace_id=p_workspace_id AND wm.active IS TRUE
   WHERE a.module_id='time-tracker'),'[]'::jsonb)
 ) INTO v_data;
 RETURN v_data;
END;
$function$
;
