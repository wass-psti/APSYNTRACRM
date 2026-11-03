-- CP-BOARD-CONFIG01 — STAGED PRODUCTION-AUTHORIZATION CANDIDATE, NOT DEPLOYED.
-- This migration changes function EXECUTE privileges and adds schema-mutating RPCs.
-- Separate production authorization, independent security review, disposable PostgreSQL
-- acceptance and signed-session regression checks are required BEFORE execution.
-- Existing domain columns (column_key col_*) are never physically deleted or retyped.
BEGIN;

CREATE TABLE public.wm_board_ui_settings (
 board_id uuid PRIMARY KEY REFERENCES public.work_boards(id) ON DELETE CASCADE,
 primary_label text NOT NULL DEFAULT 'Record'
   CHECK (char_length(btrim(primary_label)) BETWEEN 1 AND 80),
 tabs jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK (jsonb_typeof(tabs)='array'),
 column_labels jsonb NOT NULL DEFAULT '{}'::jsonb
   CHECK (jsonb_typeof(column_labels)='object'),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.wm_board_ui_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wm_board_ui_settings FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wm_board_ui_read(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v public.wm_board_ui_settings%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Board view access denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v FROM public.wm_board_ui_settings WHERE board_id=p_board_id;
 RETURN pg_catalog.jsonb_build_object(
  'board_id',p_board_id,
  'revision',coalesce(v.revision,0),
  'primary_label',coalesce(v.primary_label,'Record'),
  'tabs',coalesce(v.tabs,'[]'::jsonb),
  'column_labels',CASE WHEN public.work_board_access(p_board_id,'manage')
    THEN coalesce(v.column_labels,'{}'::jsonb) ELSE '{}'::jsonb END
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_board_ui_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_board_ui_read(uuid) TO authenticated;

CREATE FUNCTION public.wm_board_ui_save(
 p_board_id uuid,p_expected_revision bigint,p_primary_label text,
 p_tabs jsonb,p_column_labels jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_revision bigint; v_row record; v_text text; v_tab jsonb;
 v_key text; v_label text; v_seen text[]:=ARRAY[]::text[];
 v_board_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'Board configuration permission denied' USING ERRCODE='42501';
 END IF;
 SELECT b.name INTO v_board_name FROM public.work_boards b WHERE b.id=p_board_id FOR UPDATE;
 IF v_board_name IS NULL THEN RAISE EXCEPTION 'Board not found' USING ERRCODE='42501'; END IF;
 v_text:=pg_catalog.btrim(coalesce(p_primary_label,''));
 IF pg_catalog.char_length(v_text) NOT BETWEEN 1 AND 80 THEN
  RAISE EXCEPTION 'Primary display label must have 1-80 characters' USING ERRCODE='22023';
 END IF;
 IF p_tabs IS NULL OR pg_catalog.jsonb_typeof(p_tabs)<>'array' OR
    pg_catalog.jsonb_array_length(p_tabs)>4 OR pg_catalog.jsonb_array_length(p_tabs)<1 THEN
  RAISE EXCEPTION 'Invalid board views' USING ERRCODE='22023';
 END IF;
 FOR v_tab IN SELECT value FROM pg_catalog.jsonb_array_elements(p_tabs) LOOP
  IF pg_catalog.jsonb_typeof(v_tab)<>'object' OR
     NOT (v_tab ? 'key' AND v_tab ? 'label' AND v_tab ? 'visible') OR
     pg_catalog.jsonb_typeof(v_tab->'visible')<>'boolean' THEN
   RAISE EXCEPTION 'Invalid board view entry' USING ERRCODE='22023';
  END IF;
  v_key:=v_tab->>'key'; v_label:=pg_catalog.btrim(v_tab->>'label');
  IF v_key NOT IN ('items','issues','finance','attendance') OR
     v_key=ANY(v_seen) OR pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 60 OR
     (v_key='finance' AND v_board_name<>'Fund Released Tracker') OR
     (v_key='attendance' AND v_board_name<>'TimeTracker Attendance') OR
     (v_key='items' AND v_tab->>'visible'<>'true') THEN
   RAISE EXCEPTION 'Unsupported or duplicate board view' USING ERRCODE='22023';
  END IF;
  v_seen:=pg_catalog.array_append(v_seen,v_key);
 END LOOP;
 IF NOT ('items'=ANY(v_seen)) THEN
  RAISE EXCEPTION 'Primary board view cannot be removed' USING ERRCODE='22023';
 END IF;
 IF p_column_labels IS NULL OR pg_catalog.jsonb_typeof(p_column_labels)<>'object' OR
    (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_column_labels))>30 THEN
  RAISE EXCEPTION 'Invalid column display settings' USING ERRCODE='22023';
 END IF;
 FOR v_key,v_label IN SELECT key,value FROM pg_catalog.jsonb_each_text(p_column_labels) LOOP
  IF v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
     pg_catalog.char_length(pg_catalog.btrim(v_label)) NOT BETWEEN 1 AND 80 OR
     NOT EXISTS (SELECT 1 FROM public.work_board_columns c WHERE c.id=v_key::uuid AND c.board_id=p_board_id) THEN
   RAISE EXCEPTION 'Invalid or foreign column display label' USING ERRCODE='22023';
  END IF;
 END LOOP;
 SELECT s.revision INTO v_revision FROM public.wm_board_ui_settings s
  WHERE s.board_id=p_board_id FOR UPDATE;
 IF v_revision IS NULL THEN
  IF p_expected_revision IS DISTINCT FROM 0 THEN
   RAISE EXCEPTION 'Board settings changed; reload before saving' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.wm_board_ui_settings(board_id,primary_label,tabs,column_labels,updated_by)
   VALUES(p_board_id,v_text,p_tabs,p_column_labels,auth.uid());
 ELSE
  IF p_expected_revision IS DISTINCT FROM v_revision THEN
   RAISE EXCEPTION 'Board settings changed; reload before saving' USING ERRCODE='40001';
  END IF;
  UPDATE public.wm_board_ui_settings SET primary_label=v_text,tabs=p_tabs,
   column_labels=p_column_labels,revision=revision+1,
   updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
   WHERE board_id=p_board_id;
 END IF;
 PERFORM public.work_board_log(p_board_id,'board.views_updated',
  'Board display configuration updated','board',p_board_id::text,
  pg_catalog.jsonb_build_object('view_count',pg_catalog.jsonb_array_length(p_tabs),
   'primary_display_updated',true));
 RETURN public.wm_board_ui_read(p_board_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_board_ui_save(uuid,bigint,text,jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.wm_board_schema_mutate(
 p_board_id uuid,p_expected_updated_at timestamptz,p_action text,
 p_column_id uuid DEFAULT NULL,p_name text DEFAULT NULL,p_data_type text DEFAULT NULL,
 p_config jsonb DEFAULT '{}'::jsonb,p_visible boolean DEFAULT true,
 p_confirm_delete boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_board public.work_boards%ROWTYPE;
 v_column public.work_board_columns%ROWTYPE;
 v_name text:=pg_catalog.btrim(coalesce(p_name,''));
 v_config jsonb; v_position integer; v_new uuid;
 v_value_rows integer; v_old_type text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'Board structure management denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_board FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF v_board.id IS NULL THEN RAISE EXCEPTION 'Board not found' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR v_board.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Board was modified; reload before editing columns' USING ERRCODE='40001';
 END IF;
 IF p_action NOT IN ('create','update','delete') OR p_action IS NULL THEN
  RAISE EXCEPTION 'Unsupported board structure action' USING ERRCODE='22023';
 END IF;
 IF p_action='create' THEN
  IF p_column_id IS NOT NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 THEN
   RAISE EXCEPTION 'Invalid new column request' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM public.work_board_columns WHERE board_id=p_board_id)>=30 THEN
   RAISE EXCEPTION 'Board column limit reached' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.work_board_columns
            WHERE board_id=p_board_id AND pg_catalog.lower(name)=pg_catalog.lower(v_name)) THEN
   RAISE EXCEPTION 'Column name already exists' USING ERRCODE='22023';
  END IF;
  v_config:=public.work_board_normalize_column_config(p_data_type,p_config);
  SELECT coalesce(max(position),-1)+1 INTO v_position
   FROM public.work_board_columns WHERE board_id=p_board_id;
  INSERT INTO public.work_board_columns
   (board_id,column_key,name,data_type,position,config,visible,created_by,updated_by)
  VALUES (p_board_id,'custom:'||pg_catalog.gen_random_uuid()::text,v_name,p_data_type,
   v_position,v_config,coalesce(p_visible,true),auth.uid(),auth.uid()) RETURNING id INTO v_new;
  PERFORM public.work_board_log(p_board_id,'column.created',
   'Custom column created','column',v_new::text,
   pg_catalog.jsonb_build_object('name',v_name,'data_type',p_data_type));
 ELSE
  SELECT * INTO v_column FROM public.work_board_columns
   WHERE id=p_column_id AND board_id=p_board_id FOR UPDATE;
  IF v_column.id IS NULL OR v_column.system_key IS NOT NULL OR
     NOT (v_column.column_key LIKE 'custom:%' OR v_column.column_key LIKE 'custom_%') THEN
   RAISE EXCEPTION 'Domain or primary column is protected' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO v_value_rows FROM public.work_board_item_values WHERE column_id=v_column.id;
  IF p_action='delete' THEN
   IF NOT p_confirm_delete THEN
    RAISE EXCEPTION 'Explicit deletion confirmation required' USING ERRCODE='22023';
   END IF;
   IF v_value_rows>0 THEN
    RAISE EXCEPTION 'Column contains item values; deletion blocked to prevent data loss' USING ERRCODE='23503';
   END IF;
   DELETE FROM public.work_board_columns WHERE id=v_column.id;
   PERFORM public.work_board_log(p_board_id,'column.deleted',
    'Empty custom column deleted','column',v_column.id::text,
    pg_catalog.jsonb_build_object('name',v_column.name,'value_rows',0));
   v_new:=v_column.id;
  ELSE
   IF pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid column name' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM public.work_board_columns c
     WHERE c.board_id=p_board_id AND c.id<>v_column.id AND
       pg_catalog.lower(c.name)=pg_catalog.lower(v_name)) THEN
    RAISE EXCEPTION 'Column name already exists' USING ERRCODE='22023';
   END IF;
   v_old_type:=v_column.data_type;
   IF p_data_type IS DISTINCT FROM v_old_type AND v_value_rows>0 THEN
    RAISE EXCEPTION 'Column contains values; type conversion requires separate data migration'
     USING ERRCODE='23503';
   END IF;
   IF p_config IS DISTINCT FROM v_column.config AND v_value_rows>0 THEN
    RAISE EXCEPTION 'Column contains values; configuration change requires validation'
     USING ERRCODE='23503';
   END IF;
   v_config:=public.work_board_normalize_column_config(p_data_type,p_config);
   UPDATE public.work_board_columns SET name=v_name,data_type=p_data_type,
    config=v_config,visible=coalesce(p_visible,true),updated_by=auth.uid(),
    updated_at=pg_catalog.clock_timestamp()
    WHERE id=v_column.id;
   PERFORM public.work_board_log(p_board_id,'column.updated',
    'Custom column updated','column',v_column.id::text,
    pg_catalog.jsonb_build_object('name',v_name,'from_type',v_old_type,'to_type',p_data_type));
   v_new:=v_column.id;
  END IF;
 END IF;
 UPDATE public.work_boards SET updated_by=auth.uid(),updated_at=pg_catalog.clock_timestamp()
  WHERE id=p_board_id;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id,'column_id',v_new,
  'action',p_action,'updated_at',(SELECT updated_at FROM public.work_boards WHERE id=p_board_id));
END;
$function$;
REVOKE ALL ON FUNCTION public.wm_board_schema_mutate(
 uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_board_schema_mutate(
 uuid,timestamptz,text,uuid,text,text,jsonb,boolean,boolean
) TO authenticated;

-- SECURITY TRANSITION: Legacy column writers currently accept board EDIT and
-- can bypass the new MANAGE/primary-column boundary. This is a BREAKING contract
-- change requiring separate signed-user/application-client compatibility approval.
REVOKE EXECUTE ON FUNCTION public.wm_add_board_column(uuid,text,text,jsonb)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_add_board_column_at(uuid,text,text,jsonb,integer)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_change_board_column_type(uuid,text,jsonb,boolean)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_delete_board_column(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_duplicate_board_column(uuid,boolean)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_move_board_column(uuid,integer)
 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wm_update_board_column(uuid,text,jsonb,boolean)
 FROM authenticated;

-- Fail the entire transaction if any legacy editor-accessible path remains.
DO $verify_grants$
DECLARE legacy_count integer;
BEGIN
 SELECT count(*) INTO legacy_count FROM pg_catalog.pg_proc f
 JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
 WHERE n.nspname='public' AND f.proname IN
  ('wm_add_board_column','wm_add_board_column_at','wm_change_board_column_type',
   'wm_delete_board_column','wm_duplicate_board_column','wm_move_board_column',
   'wm_update_board_column')
  AND (pg_catalog.has_function_privilege('authenticated',f.oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('anon',f.oid,'EXECUTE'));
 IF legacy_count<>0 THEN
  RAISE EXCEPTION 'Legacy column-management execution grants remain; activation aborted'
   USING ERRCODE='42501';
 END IF;
END $verify_grants$;
COMMIT;
