\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text);
CREATE TABLE public.workspace_members(user_id uuid,workspace_id uuid,active boolean);
CREATE TABLE public.work_boards(id uuid PRIMARY KEY,workspace_id uuid,name text,description text,status text,archived_at timestamptz,trashed_at timestamptz);
CREATE TABLE public.work_board_items(id uuid PRIMARY KEY,board_id uuid,title text,archived_at timestamptz,updated_at timestamptz);
CREATE TABLE public.tradelink_documents(id uuid PRIMARY KEY,board_id uuid,workspace_id uuid,board_item_id uuid,document_number text,created_by uuid,archived_at timestamptz,deleted_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('qa.actor',true),'')::uuid $$;
CREATE FUNCTION public.current_workspace_id(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION public.has_module_access(text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $2 IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$;
CREATE FUNCTION private.wm_board_config_session_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('qa.active',true)='yes' $$;
CREATE FUNCTION private.tl03_can_manage(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
CREATE FUNCTION private.tl03_can_read_own_document(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.tradelink_documents WHERE id=$2 AND created_by=auth.uid()) $$;
CREATE FUNCTION private.tl03_document_read_assigned(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Document is not assigned to this signed account' USING ERRCODE='42501'; END $$;
CREATE OR REPLACE FUNCTION private.tl03_can_view_documents(p_board_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
  OR public.has_module_access('tradelink',v_actor) IS DISTINCT FROM TRUE
 THEN
  RETURN false;
 END IF;

 RETURN EXISTS(
  SELECT 1
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.work_boards b ON b.id=p_board_id
  JOIN public.workspace_members wm
   ON wm.user_id=v_actor AND wm.workspace_id=b.workspace_id AND wm.active IS TRUE
  WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL
   AND p.status='active'
   AND b.workspace_id=public.current_workspace_id(v_actor)
   AND b.name='TradeLink' AND b.status='active'
   AND b.archived_at IS NULL AND b.trashed_at IS NULL
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
 );
END;
$function$;
CREATE OR REPLACE FUNCTION private.tl03_board_projection(p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_board_id uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 v_document jsonb;
 v_board jsonb;
 v_item jsonb;
BEGIN
 IF v_actor IS NULL OR p_document_id IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink document context required' USING ERRCODE='42501';
 END IF;
 IF private.tl03_can_manage(v_board_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.archived_at IS NULL;
 ELSIF private.tl03_can_read_own_document(v_board_id,p_document_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.created_by=v_actor;
 ELSE
  v_document:=private.tl03_document_read_assigned(v_board_id,p_document_id);
 END IF;
 IF v_document IS NULL THEN RETURN NULL; END IF;
 SELECT pg_catalog.jsonb_build_object(
  'id',b.id,'workspace_id',b.workspace_id,'name',b.name,
  'description',b.description,'status',b.status,
  'archived_at',b.archived_at,'trashed_at',b.trashed_at
 ) INTO v_board
 FROM public.work_boards b
 WHERE b.id=v_board_id AND b.workspace_id=public.current_workspace_id(v_actor)
  AND b.name='TradeLink' AND b.status='active'
  AND b.archived_at IS NULL AND b.trashed_at IS NULL
  AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%';
 SELECT pg_catalog.jsonb_build_object(
  'id',i.id,'title',i.title,'archived_at',i.archived_at,'updated_at',i.updated_at
 ) INTO v_item
 FROM public.work_board_items i
 WHERE i.id=(v_document->>'board_item_id')::uuid
  AND i.board_id=v_board_id AND i.archived_at IS NULL
  AND i.title=v_document->>'document_number';
 IF v_board IS NULL OR v_item IS NULL THEN RETURN NULL; END IF;
 RETURN pg_catalog.jsonb_build_object(
  'contract','tradelink-board-projection-v1','board',v_board,'item',v_item
 );
END;
$function$;
INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()),('cccccccc-cccc-4ccc-8ccc-cccccccccccc',now());
INSERT INTO public.profiles SELECT id,'active' FROM auth.users;
INSERT INTO public.workspace_members SELECT id,'00000000-0000-4000-8000-000000000001',true FROM auth.users;
INSERT INTO public.work_boards VALUES ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001','TradeLink','[APSYNTRA:MODULE:tradelink:v1]','active',null,null);
INSERT INTO public.work_board_items VALUES ('11111111-1111-4111-8111-111111111111','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','QA-ONLY',null,now());
INSERT INTO public.tradelink_documents VALUES ('22222222-2222-4222-8222-222222222222','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','QA-ONLY','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,null);
SET qa.active='yes';
SET qa.actor='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$ BEGIN
 BEGIN PERFORM private.tl03_board_projection('22222222-2222-4222-8222-222222222222'); RAISE EXCEPTION 'old projection unexpectedly passed'; EXCEPTION WHEN SQLSTATE '42501' THEN RAISE NOTICE 'Old non-creator projection denied as reproduced'; END;
END $$;
\ir forward.sql
DO $test$
DECLARE doc uuid:='22222222-2222-4222-8222-222222222222'; result jsonb;
BEGIN
 result:=private.tl03_board_projection(doc);
 IF result->>'contract' IS DISTINCT FROM 'tradelink-board-projection-v1' OR result#>>'{item,id}' IS DISTINCT FROM '11111111-1111-4111-8111-111111111111' OR result#>>'{item,title}' IS DISTINCT FROM 'QA-ONLY' THEN RAISE EXCEPTION 'Shared projection mismatch'; END IF;
 PERFORM set_config('qa.actor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 IF private.tl03_board_projection(doc) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Manager projection changed'; END IF;
 PERFORM set_config('qa.actor','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
 BEGIN PERFORM private.tl03_board_projection(doc); RAISE EXCEPTION 'Unauthorized access'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('qa.actor','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 PERFORM set_config('qa.active','no',true);
 BEGIN PERFORM private.tl03_board_projection(doc); RAISE EXCEPTION 'Inactive session accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('qa.active','yes',true);
 UPDATE public.tradelink_documents SET workspace_id='00000000-0000-4000-8000-000000000002';
 IF private.tl03_board_projection(doc) IS NOT NULL THEN RAISE EXCEPTION 'Foreign workspace leaked'; END IF;
 UPDATE public.tradelink_documents SET workspace_id='00000000-0000-4000-8000-000000000001',deleted_at=now();
 IF private.tl03_board_projection(doc) IS NOT NULL THEN RAISE EXCEPTION 'Deleted document leaked'; END IF;
 UPDATE public.tradelink_documents SET deleted_at=null,archived_at=now();
 IF private.tl03_board_projection(doc) IS NOT NULL THEN RAISE EXCEPTION 'Archived document leaked'; END IF;
 UPDATE public.tradelink_documents SET archived_at=null;
 UPDATE public.work_board_items SET archived_at=now();
 IF private.tl03_board_projection(doc) IS NOT NULL THEN RAISE EXCEPTION 'Archived item leaked'; END IF;
 UPDATE public.work_board_items SET archived_at=null,title='Wrong';
 IF private.tl03_board_projection(doc) IS NOT NULL THEN RAISE EXCEPTION 'Mismatched item accepted'; END IF;
 RAISE NOTICE 'Shared projection: non-creator, manager, denial, workspace, lifecycle and item integrity PASS';
END $test$;
\ir rollback.sql
DO $$ BEGIN IF md5(pg_get_functiondef('private.tl03_board_projection(uuid)'::regprocedure)) <> '967da6fc87974783402200950d36ec51' THEN RAISE EXCEPTION 'rollback mismatch'; END IF; RAISE NOTICE 'Rollback exact fingerprint PASS'; END $$;
