-- CP-TL-03A: isolated PostgreSQL 17 fixture, NO production Supabase connection.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE
AS $$SELECT jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),''))$$;

CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),status text NOT NULL DEFAULT 'active');
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),
 active boolean NOT NULL DEFAULT true,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.module_role_assignments(user_id uuid NOT NULL REFERENCES auth.users(id),module_id text NOT NULL,
 role text NOT NULL,enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(user_id,module_id));
CREATE TABLE public.work_boards(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,name text NOT NULL,
 description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'active',
 archived_at timestamptz,trashed_at timestamptz,updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.work_board_members(board_id uuid NOT NULL REFERENCES public.work_boards(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),role text NOT NULL,PRIMARY KEY(board_id,user_id));
CREATE TABLE public.work_board_groups(
 id uuid PRIMARY KEY,board_id uuid NOT NULL REFERENCES public.work_boards(id),
 title text NOT NULL,position integer NOT NULL DEFAULT 0);
CREATE TABLE public.work_board_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 group_id uuid NOT NULL REFERENCES public.work_board_groups(id),
 title text NOT NULL,archived_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.work_board_events(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,board_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),event_type text NOT NULL,
 message text NOT NULL,entity_type text,entity_id text,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$SELECT workspace_id FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active AND p.status='active'
 ORDER BY m.workspace_id LIMIT 1$$;
CREATE FUNCTION public.work_board_access(p_board_id uuid,p_required text DEFAULT 'view')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $board$
DECLARE actor uuid:=auth.uid();r text;
BEGIN
 IF actor IS NULL OR p_required NOT IN ('view','edit','manage') OR
   NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND status='active') OR
   NOT EXISTS(SELECT 1 FROM public.work_boards b
     WHERE b.id=p_board_id AND b.workspace_id=public.current_workspace_id(actor))
 THEN RETURN false; END IF;
 SELECT role INTO r FROM public.work_board_members WHERE board_id=p_board_id AND user_id=actor;
 IF p_required='manage' THEN RETURN coalesce(r='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(r IN ('owner','editor'),false); END IF;
 RETURN coalesce(r IN ('owner','editor','viewer'),false);
END $board$;
CREATE FUNCTION public.module_role_for(p_module_id text,p_actor uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$SELECT role FROM public.module_role_assignments
 WHERE user_id=p_actor AND module_id=p_module_id AND enabled=true$$;
CREATE FUNCTION private.wm_board_config_session_active() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $session$
DECLARE actor uuid:=auth.uid();sid text:=auth.jwt()->>'session_id';
BEGIN
 IF actor IS NULL OR sid IS NULL OR sid !~*
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid
  AND s.user_id=actor AND (s.not_after IS NULL OR s.not_after>now()));
END $session$;
CREATE FUNCTION public.work_board_log(
 p_board_id uuid,p_type text,p_message text,p_entity_type text,p_entity_id text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $log$
BEGIN
 INSERT INTO public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id,payload)
 VALUES(p_board_id,auth.uid(),p_type,p_message,p_entity_type,p_entity_id,p_payload);
END $log$;
CREATE FUNCTION public.wm_add_board_item(p_board_id uuid,p_group_id uuid,p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE result uuid;
BEGIN
 IF NOT public.work_board_access(p_board_id,'edit') OR
  NOT EXISTS(SELECT 1 FROM public.work_board_groups WHERE id=p_group_id AND board_id=p_board_id) THEN
  RAISE EXCEPTION 'Board insert denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.work_board_items(board_id,group_id,title,created_by,updated_by)
 VALUES(p_board_id,p_group_id,p_title,auth.uid(),auth.uid()) RETURNING id INTO result;
 PERFORM public.work_board_log(p_board_id,'item.created','Item created','item',result::text,'{}');
 RETURN result;
END $create$;
CREATE FUNCTION public.wm_set_board_cell_if_current(
 p_item_id uuid,p_column_id uuid,p_value jsonb,p_expected_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $cas$
DECLARE row public.work_board_items%rowtype;
BEGIN
 SELECT * INTO row FROM public.work_board_items WHERE id=p_item_id FOR UPDATE;
 IF row.id IS NULL OR NOT public.work_board_access(row.board_id,'edit')
  OR p_column_id IS NOT NULL OR to_jsonb(row.title) IS DISTINCT FROM p_expected_value THEN
  RAISE EXCEPTION 'Board cell CAS conflict' USING ERRCODE='40001'; END IF;
 UPDATE public.work_board_items SET title=p_value#>>'{}',updated_at=now(),updated_by=auth.uid()
 WHERE id=p_item_id;
 PERFORM public.work_board_log(row.board_id,'item.cell_updated','Title updated','item',p_item_id::text,'{}');
END $cas$;
CREATE FUNCTION public.wm_set_board_item_archived(p_item_id uuid,p_archived boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $archive$
DECLARE row public.work_board_items%rowtype;
BEGIN
 SELECT * INTO row FROM public.work_board_items WHERE id=p_item_id FOR UPDATE;
 IF row.id IS NULL OR NOT public.work_board_access(row.board_id,'edit') THEN
  RAISE EXCEPTION 'Board archive denied' USING ERRCODE='42501'; END IF;
 UPDATE public.work_board_items SET archived_at=CASE WHEN p_archived THEN now() ELSE NULL END,
  updated_by=auth.uid(),updated_at=now() WHERE id=p_item_id;
 PERFORM public.work_board_log(row.board_id,'item.archived','Archive state changed',
  'item',p_item_id::text,jsonb_build_object('archived',p_archived));
END $archive$;

INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.profiles(id,status) SELECT id,'active' FROM auth.users;
INSERT INTO public.workspace_members(workspace_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('00000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('00000000-0000-4000-8000-000000000001','cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('00000000-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.module_role_assignments(user_id,module_id,role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','tradelink','General Manager'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','tradelink','User'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','tradelink','General Manager'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','tradelink','General Manager');
INSERT INTO public.work_boards(id,workspace_id,name,description) VALUES
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001',
  'TradeLink','[APSYNTRA:MODULE:tradelink:v1] Synthetic QA board'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','00000000-0000-4000-8000-000000000002',
  'Foreign Board','Synthetic QA board');
INSERT INTO public.work_board_groups(id,board_id,title,position) VALUES
 ('867aeecd-ea67-4e2f-aec7-1207e2ebe20f','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','Main group',0);
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner'),
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','cccccccc-cccc-4ccc-8ccc-cccccccccccc','editor'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','owner');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('44444444-4444-4444-8444-444444444444','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
