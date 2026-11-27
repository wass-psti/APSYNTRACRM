-- CP-CRM-PERF-01B: repair Board group-view JSON aggregation.
-- COALESCE is SQL expression syntax, not a pg_catalog function.
-- Replace only the affected bodies; preserve signatures, owner, SECURITY DEFINER,
-- empty search_path and existing function ACLs.
BEGIN;

CREATE OR REPLACE FUNCTION public.wm_board_group_view_read(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE actor uuid:=auth.uid(); group_count int; first_visit boolean;
 workspace_id uuid; payload jsonb;
BEGIN
 IF actor IS NULL OR p_board_id IS NULL OR
    NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Board group preference view denied' USING ERRCODE='42501';
 END IF;
 SELECT b.workspace_id INTO workspace_id FROM public.work_boards b
  WHERE b.id=p_board_id AND b.status='active';
 IF workspace_id IS NULL THEN
  RAISE EXCEPTION 'Active Board unavailable' USING ERRCODE='42501';
 END IF;
 -- Serialize first-use defaults for the same signed actor and board. A new
 -- group added after initialization must always start expanded.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(actor::text||':'||p_board_id::text,0));
 SELECT NOT EXISTS(
  SELECT 1 FROM public.wm_board_group_view_initialization
   WHERE user_id=actor AND board_id=p_board_id) INTO first_visit;
 IF first_visit THEN
  INSERT INTO public.wm_board_group_view_initialization(user_id,board_id)
   VALUES(actor,p_board_id) ON CONFLICT DO NOTHING;
 END IF;
 SELECT count(*) INTO group_count FROM public.work_board_groups g
   WHERE g.board_id=p_board_id;
 WITH ordered AS (
  SELECT g.id,pg_catalog.row_number() OVER(ORDER BY g.position,g.id) AS ordinal
   FROM public.work_board_groups g WHERE g.board_id=p_board_id
 )
 INSERT INTO public.wm_board_group_view_state(user_id,board_id,group_id,collapsed)
 SELECT actor,p_board_id,o.id,(first_visit AND group_count>5 AND o.ordinal>1)
 FROM ordered o ON CONFLICT(user_id,board_id,group_id) DO NOTHING;
 SELECT COALESCE(
  pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'group_id',s.group_id::text,'collapsed',s.collapsed,'revision',s.revision)
    ORDER BY g.position,g.id),'[]'::jsonb)
 INTO payload
 FROM public.wm_board_group_view_state s
 JOIN public.work_board_groups g ON g.id=s.group_id AND g.board_id=s.board_id
 WHERE s.user_id=actor AND s.board_id=p_board_id;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id::text,'groups',payload);
END;
$read$;

CREATE OR REPLACE FUNCTION public.wm_board_group_view_set_all(
 p_board_id uuid,p_collapsed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $all$
DECLARE actor uuid:=auth.uid(); payload jsonb;
BEGIN
 IF actor IS NULL OR p_board_id IS NULL OR p_collapsed IS NULL OR
    NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Board group preference bulk mutation denied' USING ERRCODE='42501';
 END IF;
 PERFORM public.wm_board_group_view_read(p_board_id);
 UPDATE public.wm_board_group_view_state s
 SET collapsed=p_collapsed,revision=s.revision+1,updated_at=pg_catalog.clock_timestamp()
 WHERE s.user_id=actor AND s.board_id=p_board_id AND EXISTS(
  SELECT 1 FROM public.work_board_groups g WHERE g.id=s.group_id AND g.board_id=p_board_id);
 SELECT COALESCE(
  pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'group_id',s.group_id::text,'collapsed',s.collapsed,'revision',s.revision)
   ORDER BY g.position,g.id),'[]'::jsonb)
 INTO payload FROM public.wm_board_group_view_state s
 JOIN public.work_board_groups g ON g.id=s.group_id AND g.board_id=p_board_id
 WHERE s.user_id=actor AND s.board_id=p_board_id;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id::text,'groups',payload);
END;
$all$;

DO $verify$
DECLARE
  read_fn oid := 'public.wm_board_group_view_read(uuid)'::regprocedure;
  set_all_fn oid := 'public.wm_board_group_view_set_all(uuid,boolean)'::regprocedure;
BEGIN
  IF position('pg_catalog.coalesce' IN pg_get_functiondef(read_fn)) > 0
     OR position('pg_catalog.coalesce' IN pg_get_functiondef(set_all_fn)) > 0 THEN
    RAISE EXCEPTION 'Invalid schema-qualified COALESCE remains in Board group-view RPCs';
  END IF;

  IF NOT has_function_privilege('authenticated', read_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', set_all_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Existing authenticated Board group-view execution grants were not preserved';
  END IF;

  IF has_function_privilege('anon', read_fn, 'EXECUTE')
     OR has_function_privilege('anon', set_all_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected anonymous Board group-view execution grant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = read_fn AND prosecdef
      AND proconfig @> ARRAY['search_path=""']
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = set_all_fn AND prosecdef
      AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'Existing SECURITY DEFINER or empty search_path contract changed';
  END IF;
END;
$verify$;

COMMIT;
