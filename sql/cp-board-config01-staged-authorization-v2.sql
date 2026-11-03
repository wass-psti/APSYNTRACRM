-- CP-BOARD-CONFIG01 — STAGED PRODUCTION-AUTHORIZATION CANDIDATE, NOT DEPLOYED.
-- This migration changes function EXECUTE privileges and adds schema-mutating RPCs.
-- Separate production authorization, independent security review, disposable PostgreSQL
-- acceptance and signed-session regression checks are required BEFORE execution.
-- Existing domain columns (column_key col_*) are never physically deleted or retyped.
BEGIN;

DO $version$
BEGIN
 IF to_regnamespace('private') IS NULL OR
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='wm_import_board_wizard_atomic') IS DISTINCT FROM 'b6a4761ab2f872a723f26fd34848c299' OR
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='wm_set_board_status_labels') IS DISTINCT FROM 'd5e7d49c4613133d3ad6b1d14e5826c5'
 THEN RAISE EXCEPTION 'Unreviewed live writer source or private schema' USING ERRCODE='42501'; END IF;
END $version$;

CREATE FUNCTION private.wm_board_config_session_active()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $session$
DECLARE sid text:=auth.jwt()->>'session_id'; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR sid IS NULL OR sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'view') THEN
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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'manage') THEN
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
     NOT EXISTS (SELECT 1 FROM public.work_board_columns c WHERE c.id=v_key::uuid AND c.board_id=p_board_id AND c.system_key IS NULL AND (c.column_key LIKE 'custom:%' OR c.column_key LIKE 'custom_%')) THEN
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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'manage') THEN
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

 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid AND s.user_id=actor
  AND (s.not_after IS NULL OR s.not_after>pg_catalog.now()));
END $session$;
REVOKE ALL ON FUNCTION private.wm_board_config_session_active() FROM PUBLIC,anon,authenticated;


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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'view') THEN
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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'manage') THEN
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
 IF NOT private.wm_board_config_session_active() OR NOT public.work_board_access(p_board_id,'manage') THEN
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
-- Supersedes original wizard/status definer implementations after exact MD5 preflight.
CREATE OR REPLACE FUNCTION public.wm_import_board_wizard_atomic(p_board_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  actor uuid := auth.uid();
  b public.work_boards%rowtype;
  target_group uuid;
  gp jsonb;
  match_policy jsonb;
  behavior text;
  match_column_id text;
  match_source text;
  match_target uuid;
  match_type text;
  match_system_key text;
  match_value text;
  current_key text;
  known_keys text[] := array[]::text[];
  mapping jsonb;
  definition jsonb;
  record_row jsonb;
  mappings jsonb;
  new_columns jsonb;
  row_values jsonb;
  map_by_source jsonb := '{}'::jsonb;
  columns_by_source jsonb := '{}'::jsonb;
  source_name text;
  source_column_id uuid;
  source_column_type text;
  new_name text;
  new_type text;
  created_column uuid;
  item_name text;
  item_id uuid;
  version_expected timestamptz;
  matches_found integer;
  position_new integer;
  item_mapping_count integer := 0;
  created_items integer := 0;
  updated_items integer := 0;
  skipped_items integer := 0;
  created_columns integer := 0;
  created_groups integer := 0;
  row_count integer;
  column_count integer;
  mapped_value jsonb;
  col_name text;
  column_options jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(jsonb_typeof(p_payload),'') <> 'object' or p_payload->>'contract' is distinct from 'm143-v1' then
    raise exception 'Unsupported wizard import contract' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'mappings'),'') <> 'array' or coalesce(jsonb_typeof(p_payload->'rows'),'') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'newColumns'),'') <> 'array' or coalesce(jsonb_typeof(p_payload->'group'),'') <> 'object'
     or coalesce(jsonb_typeof(p_payload->'matches'),'') <> 'object' then
    raise exception 'Wizard import requires mappings, rows, group, columns and matching policy' using errcode = '22023';
  end if;
  row_count := jsonb_array_length(p_payload->'rows');
  if row_count not between 1 and 5000 then raise exception 'Wizard import must contain 1-5000 rows' using errcode = '54000'; end if;
  if jsonb_array_length(p_payload->'mappings') not between 1 and 30 then
    raise exception 'Wizard mapping count must be 1-30' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'newColumns') > 30 then raise exception 'Too many new columns' using errcode = '54000'; end if;
  if jsonb_array_length(p_payload->'newColumns')>0 then
    if not private.wm_board_config_session_active()
       or not public.work_board_access(p_board_id,'manage') then
      raise exception 'Board manage permission required for wizard-created columns'
        using errcode='42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_board_id::text, 0));
  select * into b from public.work_boards where id=p_board_id for update;
  if b.id is null or b.status <> 'active' or not public.work_board_access(p_board_id,'edit') then
    raise exception 'Active Board edit access is required' using errcode = '42501';
  end if;
  if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'Board changed after preview; refresh and review before retry' using errcode = 'PT409';
  end if;
  perform 1 from public.work_board_groups where board_id=p_board_id for update;
  perform 1 from public.work_board_columns where board_id=p_board_id for update;
  perform 1 from public.work_board_items where board_id=p_board_id and archived_at is null for update;
  perform 1 from public.work_board_item_values v
    join public.work_board_items i on i.id=v.item_id
    where i.board_id=p_board_id and i.archived_at is null for update of v;
  perform 1 from public.work_board_members where board_id=p_board_id for share;

  gp := p_payload->'group';
  if gp->>'action' = 'existing' then
    begin target_group := (gp->>'groupId')::uuid;
    exception when others then raise exception 'Invalid destination Group ID' using errcode = '22023'; end;
    if not exists (select 1 from public.work_board_groups where id=target_group and board_id=p_board_id) then
      raise exception 'Destination Group no longer belongs to this Board' using errcode = '23503';
    end if;
  elsif gp->>'action' = 'create' then
    new_name := btrim(coalesce(gp->>'name',''));
    if char_length(new_name) not between 1 and 120 then raise exception 'New Group name length is invalid' using errcode = '22023'; end if;
    if exists (select 1 from public.work_board_groups where board_id=p_board_id and lower(btrim(title))=lower(new_name)) then
      raise exception 'Group name now collides with an existing Group' using errcode = 'PT409';
    end if;
    target_group := public.wm_add_board_group(p_board_id,new_name);
    created_groups := 1;
  else
    raise exception 'Unsupported Group action' using errcode = '22023';
  end if;

  select count(*) into column_count from public.work_board_columns where board_id=p_board_id;
  if column_count + jsonb_array_length(p_payload->'newColumns') > 30 then
    raise exception 'The Board supports at most 30 columns' using errcode = '54000';
  end if;
  -- Source headers and destination targets are unique in this transaction.
  mappings := p_payload->'mappings';
  for mapping in select value from jsonb_array_elements(mappings) loop
    if coalesce(jsonb_typeof(mapping),'') <> 'object' then raise exception 'Invalid mapping object' using errcode = '22023'; end if;
    source_name := btrim(coalesce(mapping->>'source',''));
    if source_name='' or char_length(source_name)>240 or map_by_source ? source_name then
      raise exception 'Missing or repeated source header' using errcode = '22023';
    end if;
    if coalesce(mapping->>'action','') not in ('item','skip','existing','create') then
      raise exception 'Unsupported mapping action' using errcode = '22023';
    end if;
    if mapping->>'action' = 'item' then item_mapping_count := item_mapping_count + 1; end if;
    map_by_source := map_by_source || jsonb_build_object(source_name,mapping);
  end loop;
  if item_mapping_count<>1 then raise exception 'Map exactly one primary Item column' using errcode = '22023'; end if;

  new_columns := p_payload->'newColumns';
  for definition in select value from jsonb_array_elements(new_columns) loop
    if coalesce(jsonb_typeof(definition),'')<>'object' then raise exception 'Invalid new column definition' using errcode = '22023'; end if;
    source_name := btrim(coalesce(definition->>'source',''));
    new_name := btrim(coalesce(definition->>'name',''));
    new_type := definition->>'type';
    if char_length(new_name) not between 1 and 80 or source_name='' or columns_by_source ? source_name
       or coalesce(map_by_source->source_name->>'action','') <> 'create'
       or coalesce(map_by_source->source_name->>'name','') <> new_name
       or coalesce(map_by_source->source_name->>'columnType','') <> new_type then
      raise exception 'New column definition is inconsistent with the reviewed mapping' using errcode = '22023';
    end if;
    if coalesce(new_type,'') not in ('text','long_text','number','date','people','checkbox','timeline','email','url') then
      raise exception 'New choice/status columns require explicit configured option approval' using errcode = '22023';
    end if;
    if exists(select 1 from public.work_board_columns where board_id=p_board_id and lower(name)=lower(new_name)) then
      raise exception 'A proposed column name now conflicts' using errcode = 'PT409';
    end if;
    if coalesce(definition->'config','{}'::jsonb)<>'{}'::jsonb then
      raise exception 'Custom column configuration is not supported by contract m143-v1' using errcode = '22023';
    end if;
    created_column := public.wm_add_board_column(p_board_id,new_name,new_type,'{}'::jsonb);
    columns_by_source := columns_by_source || jsonb_build_object(source_name,created_column::text);
    created_columns := created_columns + 1;
  end loop;

  for mapping in select value from jsonb_array_elements(mappings) loop
    source_name := mapping->>'source';
    if mapping->>'action'='create' and not (columns_by_source ? source_name) then
      raise exception 'New column mapping lacks a column definition' using errcode = '22023';
    end if;
    if mapping->>'action'='existing' then
      begin source_column_id := (mapping->>'columnId')::uuid;
      exception when others then raise exception 'Invalid existing column identifier' using errcode = '22023'; end;
      select name, data_type into col_name, source_column_type
        from public.work_board_columns where id=source_column_id and board_id=p_board_id and system_key is distinct from 'title';
      if col_name is null then raise exception 'Existing destination column is not available' using errcode = '23503'; end if;
      if exists(select 1 from jsonb_each_text(columns_by_source) x where x.value=source_column_id::text) then
        raise exception 'Two source headers target one destination column' using errcode = '22023';
      end if;
      columns_by_source := columns_by_source || jsonb_build_object(source_name,source_column_id::text);
    end if;
  end loop;

  match_policy := p_payload->'matches';
  behavior := match_policy->>'behavior';
  if coalesce(behavior,'') not in ('add-new','skip','update') then raise exception 'Unknown match policy' using errcode = '22023'; end if;
  match_column_id := match_policy->>'matchColumnId';
  if behavior <> 'add-new' then
    if coalesce(match_column_id,'')='' then raise exception 'Matching column is required' using errcode = '22023'; end if;
    if gp->>'action'='create' and behavior='update' then raise exception 'Cannot update against a newly created Group' using errcode = '22023'; end if;
    if match_column_id<>'item' then
      begin match_target:=match_column_id::uuid;
      exception when others then raise exception 'Invalid match column identifier' using errcode = '22023'; end;
      select data_type,system_key into match_type,match_system_key
        from public.work_board_columns where id=match_target and board_id=p_board_id;
      if match_type not in ('text','email','url','dropdown','status') then
        raise exception 'Matching currently supports Item, Text, Email, URL, Dropdown or Status only' using errcode = '22023';
      end if;
      select x.key into match_source from jsonb_each(columns_by_source) x where x.value#>>'{}'=match_target::text;
      if match_source is null then raise exception 'Match column must be included in the mapped import' using errcode = '22023'; end if;
    else
      select value->>'source' into match_source from jsonb_each(map_by_source) x(key,value) where value->>'action'='item';
    end if;
  end if;

  for record_row in select value from jsonb_array_elements(p_payload->'rows') loop
    if coalesce(jsonb_typeof(record_row),'')<>'object' or coalesce(jsonb_typeof(record_row->'values'),'')<>'object' then
      raise exception 'Invalid import row payload' using errcode='22023';
    end if;
    item_name := btrim(coalesce(record_row->>'title',''));
    if char_length(item_name) not between 1 and 240 then raise exception 'Imported Item name is invalid' using errcode='22023'; end if;
    row_values := record_row->'values';
    for source_name in select jsonb_object_keys(row_values) loop
      if not (columns_by_source ? source_name) then
        raise exception 'Imported values contain an unmapped column' using errcode='22023';
      end if;
    end loop;
    item_id := null;
    if behavior <> 'add-new' then
      if match_column_id = 'item' then match_value := lower(btrim(item_name));
      else match_value := lower(btrim(coalesce(row_values->match_source #>> '{}',''))); end if;
      if match_value is null or match_value='' then raise exception 'Matching value must not be empty' using errcode='22023'; end if;
      if match_value = any(known_keys) then raise exception 'Ambiguous repeated source match value' using errcode='PT409'; end if;
      known_keys := array_append(known_keys,match_value);
      if match_column_id='item' then
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(i.title))=match_value;
      elsif match_system_key='status' then
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(coalesce(i.status,'')))=match_value;
      else
        select count(*),min(i.id::text)::uuid into matches_found,item_id
          from public.work_board_items i join public.work_board_item_values v on v.item_id=i.id and v.column_id=match_target
          where i.board_id=p_board_id and i.group_id=target_group and i.archived_at is null
            and lower(btrim(coalesce(v.value#>>'{}','')))=match_value;
      end if;
      if matches_found>1 then raise exception 'Match is ambiguous in target Group' using errcode='PT409'; end if;
      if (behavior='skip' and matches_found=1) or (behavior='update' and matches_found=0) then
        skipped_items := skipped_items+1;
        continue;
      end if;
    end if;

    if behavior='update' then
      if item_id is null then raise exception 'Expected a unique matching Item' using errcode='PT409'; end if;
      if nullif(record_row->>'expected_item_updated_at','') is null then
        raise exception 'Update requires the current Item version from reviewed preview' using errcode='PT409';
      end if;
      begin version_expected := (record_row->>'expected_item_updated_at')::timestamptz;
      exception when others then raise exception 'Invalid expected Item version' using errcode='22023'; end;
      if not exists(select 1 from public.work_board_items
         where id=item_id and board_id=p_board_id and updated_at=version_expected and archived_at is null) then
        raise exception 'An Item changed after preview; revalidate the import' using errcode='PT409';
      end if;
      if exists(select 1 from public.work_board_items
        where board_id=p_board_id and group_id=target_group and archived_at is null
        and id<>item_id and lower(btrim(title))=lower(btrim(item_name))) then
        raise exception 'Update would collide with an existing Item title' using errcode='PT409';
      end if;
      update public.work_board_items
         set title=item_name,updated_by=actor,updated_at=clock_timestamp()
       where id=item_id;
      updated_items := updated_items+1;
    else
      select coalesce(max(position),-1)+1 into position_new from public.work_board_items
        where board_id=p_board_id and group_id=target_group and archived_at is null;
      insert into public.work_board_items(board_id,group_id,title,position,created_by,updated_by)
      values(p_board_id,target_group,item_name,position_new,actor,actor)
      returning id into item_id;
      created_items := created_items+1;
    end if;
    -- Empty imported cells preserve existing values on update (non-destructive).
    for mapping in select value from jsonb_array_elements(mappings) loop
      source_name := mapping->>'source';
      if mapping->>'action' not in ('existing','create') then continue; end if;
      mapped_value := row_values->source_name;
      if mapped_value is null or mapped_value='null'::jsonb then continue; end if;
      source_column_id := (columns_by_source->>source_name)::uuid;
      perform public.wm_set_board_cell(item_id,source_column_id,mapped_value);
    end loop;
  end loop;

  update public.work_boards set updated_at=clock_timestamp(),updated_by=actor where id=p_board_id;
  perform public.work_board_log(p_board_id,'items.imported.wizard','Wizard import committed','board',p_board_id::text,
    jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'columns_created',created_columns,'groups_created',created_groups));
  return jsonb_build_object('created',created_items,'updated',updated_items,'skipped',skipped_items,'rejected',0,
    'affected',created_items+updated_items,'columnsCreated',created_columns,'groupsCreated',created_groups);
end $function$;
CREATE OR REPLACE FUNCTION public.wm_set_board_status_labels(p_column_id uuid, p_labels jsonb, p_default_label_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.work_board_columns%rowtype; cfg jsonb; default_id text; cleared bigint:=0;
begin
  select * into c from public.work_board_columns where id=p_column_id;
  if c.id is null then raise exception 'Column not found' using errcode='42501'; end if;
  perform 1 from public.work_boards where id=c.board_id for update;
  select * into c from public.work_board_columns where id=p_column_id for update;
  if not private.wm_board_config_session_active()
     or not public.work_board_access(c.board_id,'manage') then
    raise exception 'Board manage permission required for status labels'
      using errcode='42501';
  end if;
  if c.data_type<>'status' then raise exception 'This column is not a Status column'; end if;
  cfg:=public.work_board_normalize_column_config('status',jsonb_build_object('labels',coalesce(p_labels,'[]'::jsonb),'default_label_id',p_default_label_id));
  default_id:=cfg->>'default_label_id';
  -- Deny changes that would remove recorded values; never delete or clear them.
  if c.system_key='status' then
    if exists(select 1 from public.work_board_items i
       where i.board_id=c.board_id and i.status is not null
         and not exists(select 1 from jsonb_array_elements(cfg->'labels') e
           where e->>'id'=i.status)) then
      raise exception 'Status labels are still used by items'
        using errcode='23503';
    end if;
  else
    if exists(select 1 from public.work_board_item_values v
       where v.column_id=c.id and v.value is not null
         and not exists(select 1 from jsonb_array_elements(cfg->'labels') e
           where e->>'id'=(v.value#>>'{}'))) then
      raise exception 'Status labels are still used by item cells'
        using errcode='23503';
    end if;
  end if;
  update public.work_board_columns set config=cfg,updated_by=auth.uid(),updated_at=now() where id=c.id;
  update public.work_boards set updated_at=now(),updated_by=auth.uid() where id=c.board_id;
  perform public.work_board_log(c.board_id,'column.status_labels_updated','Status labels updated','column',c.id::text,jsonb_build_object('label_count',jsonb_array_length(cfg->'labels'),'default_label_id',default_id,'cleared_values',cleared));
  return cfg;
end $function$;

-- Preserve existing signed-only API grants after replacing privileged functions.
REVOKE ALL ON FUNCTION
 public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb),
 public.wm_set_board_status_labels(uuid,jsonb,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION
 public.wm_import_board_wizard_atomic(uuid,timestamptz,jsonb),
 public.wm_set_board_status_labels(uuid,jsonb,text)
 TO authenticated;

DO $verify_writer$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='wm_set_board_status_labels'
   AND (p.prosrc ILIKE '%delete from public.work_board_item_values%'
     OR p.prosrc ILIKE '%update public.work_board_items i set status=null%')) THEN
  RAISE EXCEPTION 'Destructive status-label writer remains' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='wm_import_board_wizard_atomic'
  AND p.prosrc LIKE '%Board manage permission required for wizard-created columns%') THEN
  RAISE EXCEPTION 'Schema-creation wizard remains unguarded' USING ERRCODE='42501'; END IF;
END $verify_writer$;
COMMIT;
