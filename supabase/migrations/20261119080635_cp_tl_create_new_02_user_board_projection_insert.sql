-- CP-TL-CREATE-NEW-02
-- Keep the existing TradeLink User domain capability functional when the
-- account has Board Viewer membership. The existing document save transaction
-- creates the matching Board item atomically; it must not call the generic
-- Board edit RPC for this narrowly scoped domain operation.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE
 definition text;
BEGIN
 IF to_regprocedure('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)') IS NULL
  OR to_regprocedure('private.tl03_can_create_draft(uuid)') IS NULL
  OR to_regprocedure('public.wm_add_board_item(uuid,uuid,text)') IS NULL
  OR to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NULL
  OR to_regclass('public.work_board_items') IS NULL
  OR to_regclass('public.work_board_columns') IS NULL
  OR to_regclass('public.work_board_groups') IS NULL
  OR to_regclass('public.work_boards') IS NULL
  OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.work_board_items'::regclass
    AND attname IN ('board_id','group_id','title','status','position','created_by','updated_by')
    AND attnum>0 AND NOT attisdropped
   GROUP BY attrelid HAVING count(*)=7
  )
  OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.work_boards'::regclass
    AND attname='updated_by' AND attnum>0 AND NOT attisdropped
  )
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 TradeLink Board projection prerequisites are incomplete'
  USING ERRCODE='55000'; END IF;

 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;
 IF definition IS NULL
  OR position('private.tl03_can_create_draft(p_board_id)' IN definition)=0
  OR position('private.tl03_can_manage(p_board_id)' IN definition)=0
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(
    definition,
    'item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>''documentNumber'');',
    ''
   ))<>pg_catalog.length(
    'item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>''documentNumber'');'
   )
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 save function baseline drift; no change applied'
  USING ERRCODE='55000'; END IF;

 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
   AND p.prosecdef
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[]
 ) THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 requires the existing postgres-owned SECURITY DEFINER save transaction'
  USING ERRCODE='55000'; END IF;
END;
$preflight$;

DO $patch$
DECLARE
 definition text;
 old_call text;
 new_call text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;

 old_call := $old$
  item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
$old$;

 new_call := $new$
  IF private.tl03_can_manage(p_board_id) IS TRUE THEN
   -- Preserve the existing manager path exactly.
   item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  ELSE
   -- The enclosing create branch has already verified the existing
   -- TradeLink User capability. Create the linked Board projection inside
   -- this same transaction without requiring generic Board edit membership.
   IF private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TradeLink Create New capability required'
     USING ERRCODE='42501';
   END IF;
   DECLARE
    direct_title text;
    direct_group_id uuid;
    direct_position integer;
    direct_status_col public.work_board_columns%rowtype;
    direct_initial_status text;
   BEGIN
    direct_title:=pg_catalog.btrim(coalesce(payload->>'documentNumber',''));
    direct_group_id:=group_id;
    IF pg_catalog.char_length(direct_title) NOT BETWEEN 1 AND 240 THEN
     RAISE EXCEPTION 'Item title is required';
    END IF;

    -- Match the generic Board insert's ordering lock and group validation.
    PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_board_id::text,0));
    IF NOT EXISTS(
     SELECT 1 FROM public.work_board_groups
     WHERE id=direct_group_id AND board_id=p_board_id
    ) THEN RAISE EXCEPTION 'Group does not belong to board'; END IF;

    -- Preserve the existing Board status default behavior.
    SELECT * INTO direct_status_col
    FROM public.work_board_columns
    WHERE board_id=p_board_id AND system_key='status' AND data_type='status'
    ORDER BY position,id LIMIT 1;
    IF direct_status_col.id IS NULL THEN
     direct_initial_status:='not_started';
    ELSE
     direct_initial_status:=NULLIF(direct_status_col.config->>'default_label_id','');
     IF direct_initial_status IS NULL OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE e->>'id'=direct_initial_status
       AND coalesce((e->>'active')::boolean,true)
     ) THEN
      SELECT e->>'id' INTO direct_initial_status
      FROM pg_catalog.jsonb_array_elements(
       coalesce(direct_status_col.config->'labels','[]'::jsonb)
      ) e
      WHERE coalesce((e->>'active')::boolean,true)
      ORDER BY coalesce((e->>'position')::integer,0),e->>'id'
      LIMIT 1;
     END IF;
    END IF;

    SELECT count(*) INTO direct_position
    FROM public.work_board_items i
    WHERE i.group_id=direct_group_id AND i.archived_at IS NULL;

    INSERT INTO public.work_board_items(
     board_id,group_id,title,status,position,created_by,updated_by
    ) VALUES(
     p_board_id,direct_group_id,direct_title,direct_initial_status,
     direct_position,actor,actor
    ) RETURNING id INTO item_id;

    UPDATE public.work_boards
    SET updated_at=pg_catalog.now(),updated_by=actor
    WHERE id=p_board_id;

    PERFORM public.work_board_log(
     p_board_id,'item.created','Item added','item',item_id::text,
     pg_catalog.jsonb_build_object(
      'title',direct_title,'status',direct_initial_status,
      'position',direct_position
     )
    );
   END;
  END IF;
$new$;

 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(
   definition,old_call,''
  ))<>pg_catalog.length(old_call)
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 exact Board insert call drift; no change applied'
  USING ERRCODE='55000'; END IF;

 EXECUTE pg_catalog.replace(definition,old_call,new_call);
END;
$patch$;

DO $postflight$
DECLARE
 definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;

 IF definition IS NULL
  OR position('IF private.tl03_can_manage(p_board_id) IS TRUE THEN' IN definition)=0
  OR position('item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>''documentNumber'');' IN definition)=0
  OR position('private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE' IN definition)=0
  OR position('INSERT INTO public.work_board_items' IN definition)=0
  OR position('pg_catalog.pg_advisory_xact_lock' IN definition)=0
  OR position('public.work_board_log' IN definition)=0
  OR position('UPDATE public.work_boards' IN definition)=0
  OR position('private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE' IN definition)=0
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 Board projection postflight failed'
  USING ERRCODE='55000'; END IF;

 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
   AND p.prosecdef
   AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']::text[]
 ) THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 changed the existing save execution context'
  USING ERRCODE='55000'; END IF;

 -- Generic Board permissions and the shared Board insert RPC remain unchanged.
 IF position('work_board_access(p_board_id,''edit'')' IN
    pg_catalog.pg_get_functiondef('public.wm_add_board_item(uuid,uuid,text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-02 unexpectedly changed the generic Board insert contract'
  USING ERRCODE='55000'; END IF;
END;
$postflight$;

COMMIT;
