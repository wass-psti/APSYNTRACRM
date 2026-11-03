-- CP-BOARD-BULK02 — STAGED ONLY. Explicit production SQL authorization required.
-- One atomic manager/editor batch; protected domain boards cannot be bulk-mutated.
-- Empty-group CAS delete and all-group CAS rename, with no cascade of board items.
-- Must be applied as one transaction; rollback is fail-closed, never restores unsafe delete.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('private.wm_board_is_protected(uuid)') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regprocedure('public.wm_set_board_item_archived(uuid,boolean)') IS NULL
  OR to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'CP-BOARD-BULK02 dependency missing; abort' USING ERRCODE='55000';
 END IF;
 IF to_regprocedure('public.wm_board_bulk_mutate(uuid,text,jsonb)') IS NOT NULL
  OR to_regprocedure('public.wm_board_group_cas(uuid,uuid,timestamp with time zone,text,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-BOARD-BULK02 already present; require reconciliation' USING ERRCODE='55000';
 END IF;
END $preflight$;

CREATE FUNCTION public.wm_board_bulk_mutate(
 p_board_id uuid,p_action text,p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $bulk$
DECLARE
 actor uuid:=auth.uid(); b public.work_boards%rowtype;
 action_key text:=pg_catalog.btrim(pg_catalog.coalesce(p_action,''));
 entry jsonb; ids uuid[]:=ARRAY[]::uuid[]; expected_times timestamptz[]:=ARRAY[]::timestamptz[];
 status_values text[]:=ARRAY[]::text[]; record_id uuid; expected_at timestamptz;
 v_status text; it public.work_board_items%rowtype; status_column public.work_board_columns%rowtype;
 idx int; item_count int; latest jsonb; target text;
BEGIN
 IF actor IS NULL OR NOT private.wm_board_config_session_active()
  OR NOT public.work_board_access(p_board_id,'edit') THEN
  RAISE EXCEPTION 'Signed board edit permission required' USING ERRCODE='42501';
 END IF;
 IF action_key NOT IN ('status','archive','restore')
  OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
  OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Invalid atomic bulk action or record count (1-50)' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_board_id::text,0));
 SELECT * INTO b FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'active' OR private.wm_board_is_protected(b.id)
  OR NOT public.work_board_access(b.id,'edit') THEN
  RAISE EXCEPTION 'This board cannot accept generic bulk mutations' USING ERRCODE='42501';
 END IF;
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows)
 LOOP
  IF pg_catalog.jsonb_typeof(entry)<>'object'
    OR entry->>'id' IS NULL OR entry->>'expected_updated_at' IS NULL
  THEN RAISE EXCEPTION 'Each item requires an ID and expected revision time' USING ERRCODE='22023'; END IF;
  BEGIN
   record_id:=(entry->>'id')::uuid;
   expected_at:=(entry->>'expected_updated_at')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
   RAISE EXCEPTION 'Invalid item ID or expected revision time' USING ERRCODE='22023';
  END;
  IF record_id=ANY(ids) OR expected_at IS NULL THEN
   RAISE EXCEPTION 'Duplicate item or null revision' USING ERRCODE='22023';
  END IF;
  IF action_key='status' THEN
   v_status:=entry->>'status';
   IF v_status IS NULL OR pg_catalog.char_length(v_status)>100 THEN
    RAISE EXCEPTION 'Status must be a supported label' USING ERRCODE='22023';
   END IF;
  ELSE
   IF entry ? 'status' THEN RAISE EXCEPTION 'Archive action cannot also change status' USING ERRCODE='22023'; END IF;
   v_status:=NULL;
  END IF;
  ids:=pg_catalog.array_append(ids,record_id);
  expected_times:=pg_catalog.array_append(expected_times,expected_at);
  status_values:=pg_catalog.array_append(status_values,v_status);
 END LOOP;
 -- Deterministic locks prevent opposite-order concurrent bulk transactions from deadlocking.
 PERFORM i.id FROM public.work_board_items i
  WHERE i.board_id=b.id AND i.id=ANY(ids) ORDER BY i.id FOR UPDATE;
 SELECT count(*) INTO item_count FROM public.work_board_items WHERE board_id=b.id AND id=ANY(ids);
 IF item_count<>pg_catalog.array_length(ids,1) THEN
  RAISE EXCEPTION 'One or more selected items are missing or outside this board' USING ERRCODE='42501';
 END IF;
 IF action_key='status' THEN
  SELECT * INTO status_column FROM public.work_board_columns
   WHERE board_id=b.id AND system_key='status' AND data_type='status'
   ORDER BY position,id LIMIT 1;
 END IF;
 FOR idx IN 1..pg_catalog.array_length(ids,1) LOOP
  SELECT * INTO it FROM public.work_board_items WHERE id=ids[idx] AND board_id=b.id;
  IF it.id IS NULL OR it.updated_at IS DISTINCT FROM expected_times[idx] THEN
   RAISE EXCEPTION 'Selected item changed; reload before bulk operation' USING ERRCODE='40001';
  END IF;
  IF action_key='archive' AND it.archived_at IS NOT NULL OR
     action_key='restore' AND it.archived_at IS NULL OR
     action_key='status' AND it.archived_at IS NOT NULL THEN
   RAISE EXCEPTION 'Selected item has an incompatible archive state' USING ERRCODE='40001';
  END IF;
  IF action_key='status' THEN
   IF status_column.id IS NOT NULL THEN
    IF NOT EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_array_elements(
      pg_catalog.coalesce(status_column.config->'labels','[]'::jsonb)) x
      WHERE x->>'id'=status_values[idx] AND
       pg_catalog.coalesce((x->>'active')::boolean,true)
    ) THEN
     RAISE EXCEPTION 'Selected status not supported by board schema' USING ERRCODE='22023';
    END IF;
   ELSIF status_values[idx] NOT IN ('not_started','in_progress','blocked','done') THEN
    RAISE EXCEPTION 'Selected status not supported by board schema' USING ERRCODE='22023';
   END IF;
  END IF;
 END LOOP;
 -- All preconditions validated before the first write; any exception rolls back the entire RPC.
 FOR idx IN 1..pg_catalog.array_length(ids,1) LOOP
  IF action_key='status' THEN
   UPDATE public.work_board_items SET status=status_values[idx],
    updated_by=actor,updated_at=pg_catalog.clock_timestamp() WHERE id=ids[idx];
  ELSE
   PERFORM public.wm_set_board_item_archived(ids[idx],action_key='archive');
  END IF;
 END LOOP;
 IF action_key='status' THEN
  UPDATE public.work_boards SET updated_at=pg_catalog.clock_timestamp(),updated_by=actor WHERE id=b.id;
 END IF;
 PERFORM public.work_board_log(b.id,'items.bulk_'||action_key,
  'Atomic bulk item action applied','board',b.id::text,
  pg_catalog.jsonb_build_object('action',action_key,'count',pg_catalog.array_length(ids,1),
   'item_ids',pg_catalog.to_jsonb(ids)));
 SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('id',i.id::text,'updatedAt',i.updated_at,'archived',i.archived_at IS NOT NULL)
  ORDER BY i.id),'[]'::jsonb) INTO latest
 FROM public.work_board_items i WHERE i.board_id=b.id AND i.id=ANY(ids);
 RETURN pg_catalog.jsonb_build_object('boardId',b.id::text,'action',action_key,
  'applied',pg_catalog.array_length(ids,1),'items',latest);
END $bulk$;

CREATE FUNCTION public.wm_board_group_cas(
 p_board_id uuid,p_group_id uuid,p_expected_updated_at timestamptz,
 p_action text,p_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $group$
DECLARE
 actor uuid:=auth.uid(); b public.work_boards%rowtype; grp public.work_board_groups%rowtype;
 action_key text:=pg_catalog.btrim(pg_catalog.coalesce(p_action,''));
 cleaned text:=pg_catalog.btrim(pg_catalog.coalesce(p_title,''));
 revised timestamptz; group_total int;
BEGIN
 IF actor IS NULL OR NOT private.wm_board_config_session_active()
  OR NOT public.work_board_access(p_board_id,
   CASE WHEN action_key='delete_empty' THEN 'manage' ELSE 'edit' END)
 THEN RAISE EXCEPTION 'Signed board configuration permission required' USING ERRCODE='42501'; END IF;
 IF action_key NOT IN ('rename','delete_empty') OR p_expected_updated_at IS NULL THEN
  RAISE EXCEPTION 'Unsupported group action or missing revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_board_id::text,0));
 SELECT * INTO b FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'active'
   OR NOT public.work_board_access(p_board_id,
    CASE WHEN action_key='delete_empty' THEN 'manage' ELSE 'edit' END) THEN
  RAISE EXCEPTION 'Board no longer allows this operation' USING ERRCODE='42501'; END IF;
 SELECT * INTO grp FROM public.work_board_groups
  WHERE id=p_group_id AND board_id=b.id FOR UPDATE;
 IF grp.id IS NULL THEN RAISE EXCEPTION 'Group does not belong to board' USING ERRCODE='42501'; END IF;
 IF grp.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Group changed; reload before editing' USING ERRCODE='40001'; END IF;
 IF action_key='rename' THEN
  IF pg_catalog.char_length(cleaned) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'Group name must contain 1-120 characters' USING ERRCODE='22023'; END IF;
  UPDATE public.work_board_groups SET title=cleaned,
   updated_at=pg_catalog.clock_timestamp() WHERE id=grp.id RETURNING updated_at INTO revised;
  PERFORM public.work_board_log(b.id,'group.updated',
   'Group renamed with revision protection','group',grp.id::text,
   pg_catalog.jsonb_build_object('title',cleaned));
 ELSE
  IF private.wm_board_is_protected(b.id) THEN
   RAISE EXCEPTION 'Application-managed group deletion is prohibited' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO group_total FROM public.work_board_groups WHERE board_id=b.id;
  IF group_total<=1 THEN
   RAISE EXCEPTION 'A board must retain at least one group' USING ERRCODE='22023'; END IF;
  -- Includes archived items. Group FK currently has ON DELETE CASCADE, so
  -- absence of ANY item is essential; the existing item creator shares this board lock.
  IF EXISTS(SELECT 1 FROM public.work_board_items WHERE board_id=b.id AND group_id=grp.id) THEN
   RAISE EXCEPTION 'Group contains records, including archived records' USING ERRCODE='23503'; END IF;
  DELETE FROM public.work_board_groups WHERE id=grp.id AND board_id=b.id;
  UPDATE public.work_board_groups SET position=position-1,
   updated_at=pg_catalog.clock_timestamp() WHERE board_id=b.id AND position>grp.position;
  PERFORM public.work_board_log(b.id,'group.deleted_empty',
   'Empty group safely deleted','group',grp.id::text,
   pg_catalog.jsonb_build_object('title',grp.title,'position',grp.position));
  revised:=NULL;
 END IF;
 UPDATE public.work_boards SET updated_at=pg_catalog.clock_timestamp(),
  updated_by=actor WHERE id=b.id;
 RETURN pg_catalog.jsonb_build_object('boardId',b.id::text,'groupId',grp.id::text,
  'action',action_key,'updatedAt',revised);
END $group$;

REVOKE ALL ON FUNCTION public.wm_board_bulk_mutate(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.wm_board_group_cas(uuid,uuid,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_board_bulk_mutate(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_board_group_cas(uuid,uuid,timestamptz,text,text) TO authenticated;
-- The legacy group deletion cascades into item deletion. Deny authenticated bypass.
REVOKE ALL ON FUNCTION public.wm_delete_board_group(uuid) FROM PUBLIC,anon,authenticated;
DO $verify$
BEGIN
 IF has_function_privilege('anon','public.wm_board_bulk_mutate(uuid,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.wm_board_group_cas(uuid,uuid,timestamptz,text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_delete_board_group(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-BOARD-BULK02 unsafe grant' USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;
