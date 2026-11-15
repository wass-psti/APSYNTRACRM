-- M196.26 SCHEMA-ONLY CANDIDATE; UNTESTED, NOT APPROVED FOR PRODUCTION.
-- Derived from CP8 with composite workspace FKs and no authenticated EXECUTE grant.
-- CHARTER NAVIGATOR CP8 -- REVIEW ONLY. NOT DEPLOYED. DO NOT EXECUTE ON SHARED SUPABASE PRODUCTION.
-- Preserves CP6 controls. Corrects storage first-create race and requires explicit QA approval before migration.
-- PostgreSQL syntax/runtime and RLS have NOT been live-certified; verify in a non-production rehearsal first.
-- Requires separate authorization, Supabase migration staging, transaction review and QA.
-- Changes since CP5: PATCH control keys stripped from stored record; CP5 kept unchanged for provenance.
-- Uses existing public.profiles/workspaces/workspace_members/module_role_assignments.
-- Auth identity is auth.uid(); browser-provided user/email/roles are never authority.
BEGIN;
CREATE TABLE IF NOT EXISTS public.charter_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(workspace_id,id)
);
CREATE INDEX IF NOT EXISTS charter_items_workspace_live_idx ON public.charter_items(workspace_id,archived_at,created_at DESC);
-- Atomic booking-slot exclusivity across concurrent authenticated clients.
CREATE UNIQUE INDEX IF NOT EXISTS charter_items_unique_active_slot
 ON public.charter_items(workspace_id,(left(data->>'tripDate',10)),(data->>'tier'),(data->>'session'))
 WHERE archived_at IS NULL AND (data->>'bookingStatus') IN ('Pending','Confirmed')
   AND (data->>'tripDate') IS NOT NULL AND (data->>'tier') IS NOT NULL AND (data->>'session') IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.charter_storage (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 120),
  value jsonb,
  version integer NOT NULL CHECK (version>0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,key)
);
CREATE TABLE IF NOT EXISTS public.charter_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  item_id uuid NOT NULL,
  CONSTRAINT charter_item_same_workspace_fk FOREIGN KEY (workspace_id,item_id) REFERENCES public.charter_items(workspace_id,id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.charter_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  item_id uuid NOT NULL,
  CONSTRAINT charter_notification_item_workspace_fk FOREIGN KEY (workspace_id,item_id) REFERENCES public.charter_items(workspace_id,id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivery text NOT NULL DEFAULT 'in-app-only' CHECK (delivery='in-app-only')
);
CREATE TABLE IF NOT EXISTS public.charter_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  record_id text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.charter_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charter_storage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charter_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charter_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charter_audit ENABLE ROW LEVEL SECURITY;
-- All data tables are intentionally denied to the Data API roles. Database RPC
-- alone performs row-level authentication/authorization and data writes.
REVOKE ALL ON public.charter_items,public.charter_storage,public.charter_updates,
  public.charter_notifications,public.charter_audit FROM PUBLIC,anon,authenticated;

-- Filter whitelisting: no dynamic SQL, no access to arbitrary JSON paths.
CREATE OR REPLACE FUNCTION private.charter_match(data jsonb, criteria jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $f$
DECLARE k text; e jsonb; actual jsonb; s text; a text;
BEGIN
 IF criteria IS NULL OR criteria='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(criteria)<>'object' OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(criteria))>12 THEN
   RAISE EXCEPTION 'Invalid Charter filter' USING ERRCODE='22023'; END IF;
 FOR k,e IN SELECT key,value FROM jsonb_each(criteria) LOOP
   IF k NOT IN ('name','bookingStatus','tripDate','guests','tier','session','createdAt','updatedAt','group') THEN
     RAISE EXCEPTION 'Charter filter column not supported' USING ERRCODE='22023'; END IF;
   actual := data->k; s := data->>k;
   IF jsonb_typeof(e)='array' THEN
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e) expected WHERE expected=actual) THEN RETURN false; END IF;
   ELSIF jsonb_typeof(e)='object' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(e) op WHERE op NOT IN ('between','gte','lte','gt','lt')) THEN
       RAISE EXCEPTION 'Unsupported Charter filter comparison' USING ERRCODE='22023'; END IF;
     IF s IS NULL THEN RETURN false; END IF;
     IF e ? 'between' THEN
       IF jsonb_typeof(e->'between') <> 'array' OR jsonb_array_length(e->'between')<>2 THEN
         RAISE EXCEPTION 'Invalid between filter' USING ERRCODE='22023'; END IF;
       IF s < (e->'between'->>0) OR s > (e->'between'->>1) THEN RETURN false; END IF;
     END IF;
     IF e ? 'gte' AND s < (e->>'gte') THEN RETURN false; END IF;
     IF e ? 'lte' AND s > (e->>'lte') THEN RETURN false; END IF;
     IF e ? 'gt' AND s <= (e->>'gt') THEN RETURN false; END IF;
     IF e ? 'lt' AND s >= (e->>'lt') THEN RETURN false; END IF;
   ELSIF k='tripDate' AND jsonb_typeof(e)='string' AND length(e #>> '{}')=10 THEN
     IF left(coalesce(s,''),10)<>(e #>> '{}') THEN RETURN false; END IF;
   ELSIF k='name' AND jsonb_typeof(e)='string' THEN
     IF position(lower(e #>> '{}') IN lower(coalesce(s,'')))=0 THEN RETURN false; END IF;
   ELSIF actual IS DISTINCT FROM e THEN RETURN false;
   END IF;
 END LOOP;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION private.charter_match(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

-- Narrow authenticated RPC; this function is a privileged DB boundary, not
-- generic SQL proxy. Invoker auth.uid() is always derived from the user JWT.
CREATE OR REPLACE FUNCTION public.charter_dispatch(
 p_workspace_id uuid,p_path text,p_method text,p_body jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $api$
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
    AND i.archived_at IS NULL AND (role_name='admin' OR i.owner_id=uid OR (v_filters ? 'tripDate' AND v_filters ? 'tier' AND v_filters ? 'session' AND v_filters ? 'bookingStatus'))
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
END $api$;
REVOKE ALL ON FUNCTION public.charter_dispatch(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
-- M196.26: Schema-only deployment candidate. EXECUTE deliberately NOT granted.
-- Grant only in a separately approved activation migration.
-- No service_role key in client; no direct table grants. No email delivery.
COMMIT;
;
