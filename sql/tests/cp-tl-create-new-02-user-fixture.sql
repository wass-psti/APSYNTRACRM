-- CP-TL-CREATE-NEW-02 disposable-only schema and signed-user fixtures.
-- This file is used only by the isolated PostgreSQL acceptance script.
ALTER TABLE public.work_board_items
 ADD COLUMN status text,
 ADD COLUMN position integer NOT NULL DEFAULT 0;
ALTER TABLE public.work_boards ADD COLUMN updated_by uuid;

CREATE TABLE public.work_board_columns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 system_key text,
 data_type text,
 position integer NOT NULL DEFAULT 0,
 config jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- The TradeLink User has only Board Viewer membership in this fixture.
ALTER TABLE public.profiles ADD COLUMN display_name text;
ALTER TABLE public.profiles ADD COLUMN email text;
UPDATE public.profiles p SET email=u.email,
 display_name=pg_catalog.initcap(pg_catalog.split_part(u.email,'@',1))
FROM auth.users u WHERE u.id=p.id;
UPDATE public.work_board_members
SET role='viewer'
WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'
 AND user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

UPDATE auth.users
SET email=CASE id
 WHEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN 'asenagan@watchdogautomation.com.ph'
 WHEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid THEN 'cp02-creator@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'msenagan@watchdogautomation.com.ph'
END,
email_confirmed_at=pg_catalog.now()
WHERE id IN (
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
);

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aacsenagan@watchdogautomation.com.ph',pg_catalog.now()),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','dsenagan@watchdogautomation.com.ph',pg_catalog.now()),
 ('12121212-1212-4212-8212-121212121212','rogang@watchdogautomation.com.ph',pg_catalog.now()),
 ('13131313-1313-4313-8313-131313131313','ppajulas@watchdogautomation.com.ph',pg_catalog.now());

INSERT INTO public.profiles(id,status) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','active'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','active'),
 ('12121212-1212-4212-8212-121212121212','active'),
 ('13131313-1313-4313-8313-131313131313','active');

INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('00000000-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true),
 ('00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff',true),
 ('00000000-0000-4000-8000-000000000001','12121212-1212-4212-8212-121212121212',true),
 ('00000000-0000-4000-8000-000000000001','13131313-1313-4313-8313-131313131313',true);

INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','tradelink','User',true),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','tradelink','User',true),
 ('12121212-1212-4212-8212-121212121212','tradelink','User',true),
 ('13131313-1313-4313-8313-131313131313','tradelink','User',true);

CREATE OR REPLACE FUNCTION public.has_module_access(
 p_module_id text,p_user_id uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $function$
 SELECT p_user_id IS NOT NULL
  AND public.current_workspace_id(p_user_id) IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.profiles p
   WHERE p.id=p_user_id AND p.status='active')
  AND public.module_role_for(p_module_id,p_user_id) IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.has_module_access(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(text,uuid) TO authenticated;


-- CP-NATIVE-APP-ACCESS-01 TradeLink exact-record projection baseline.
-- Only the TradeLink function is included here; unrelated native application
-- boards and functions are intentionally not part of this disposable fixture.
CREATE OR REPLACE FUNCTION private.tl03_board_projection(
 p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
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
REVOKE ALL ON FUNCTION private.tl03_board_projection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.tl03_board_projection(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tl03_board_projection(
 p_document_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT private.tl03_board_projection(p_document_id);
$function$;
REVOKE ALL ON FUNCTION public.tl03_board_projection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tl03_board_projection(uuid) TO authenticated;
