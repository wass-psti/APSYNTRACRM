-- CP-BIMP-20B: actual PostgreSQL 17 execution of m143-v2 on disposable fixtures.
-- No Supabase production data, migrations, roles, or policies are touched.
\set ON_ERROR_STOP on
SET statement_timeout = '180s';
DO $bimp20b$
DECLARE
 bid uuid := '30000000-0000-4000-8000-000000000003';
 gid uuid := '60000000-0000-4000-8000-000000000001';
 ref_id uuid := '65000000-0000-4000-8000-000000000002';
 owner_id uuid := '20000000-0000-4000-8000-000000000001';
 session_id uuid := '70000000-0000-4000-8000-000000000001';
 source_names text[] := ARRAY['Extra 1','Extra 2','Extra 3','Extra 4','Extra 5'];
 mappings jsonb;
 rowset jsonb;
 rowvals jsonb;
 longref text;
 payload jsonb;
 receipt jsonb;
 before_revision timestamptz;
 before_count bigint;
 before_events bigint;
 idx int;
 batch_end int;
 batch_count int;
 batch_limit int := 35;
 batch_start timestamptz;
 batch_ms numeric;
 max_ms numeric := 0;
 total_ms numeric := 0;
 total_imported int := 0;
 current_item uuid;
 col_id uuid;
 j int;
 actual_value text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,false);
 PERFORM set_config('request.jwt.claim.session_id',session_id::text,false);
 -- Existing isolated BIMP-02 board, owner and signed-session fixture.
 IF NOT private.wm_board_config_session_active() THEN
  RAISE EXCEPTION 'CP-BIMP-20B: disposable signed fixture not active';
 END IF;
 FOR j IN 1..5 LOOP
  INSERT INTO public.work_board_columns
    (id,board_id,column_key,name,data_type,position,created_by,updated_by)
  VALUES (('85000000-0000-4000-8000-'||lpad(j::text,12,'0'))::uuid,
    bid,'custom:bimp20b-extra-'||j,source_names[j],'text',10+j,owner_id,owner_id);
 END LOOP;
 mappings:=jsonb_build_array(
  jsonb_build_object('source','Name','action','item'),
  jsonb_build_object('source','Legacy Ref','action','existing','columnId',ref_id));
 FOR j IN 1..5 LOOP
  mappings:=mappings||jsonb_build_array(jsonb_build_object(
   'source',source_names[j],'action','existing',
   'columnId',('85000000-0000-4000-8000-'||lpad(j::text,12,'0'))::uuid));
 END LOOP;
 SELECT count(*) INTO before_count FROM public.work_board_items WHERE board_id=bid;
 SELECT count(*) INTO before_events FROM public.work_board_events
  WHERE board_id=bid AND event_type='items.imported.wizard';
 FOR idx IN 1..617 BY batch_limit LOOP
  batch_end:=least(617,idx+batch_limit-1);
  rowset:='[]'::jsonb;
  FOR j IN idx..batch_end LOOP
   longref:='https://example.invalid/docs/'||repeat('R',7200)||'-'||j;
   rowvals:=jsonb_build_object('Legacy Ref',jsonb_build_object('__aps_extended_ref_v1',longref));
   FOR batch_count IN 1..5 LOOP
    rowvals:=rowvals||jsonb_build_object(source_names[batch_count],
      'Value '||j||'-'||batch_count);
   END LOOP;
   rowset:=rowset||jsonb_build_array(jsonb_build_object('title','CP-BIMP-20B Row '||j,'values',rowvals));
  END LOOP;
  payload:=jsonb_build_object('contract','m143-v2',
   'group',jsonb_build_object('action','existing','groupId',gid),
   'matches',jsonb_build_object('behavior','add-new'),
   'mappings',mappings,'newColumns','[]'::jsonb,'rows',rowset);
  SELECT updated_at INTO before_revision FROM public.work_boards WHERE id=bid;
  batch_start:=clock_timestamp();
  receipt:=public.wm_import_board_wizard_extended_atomic(bid,before_revision,payload);
  batch_ms:=round(extract(epoch FROM (clock_timestamp()-batch_start))*1000,2);
  max_ms:=greatest(max_ms,batch_ms);
  total_ms:=total_ms+batch_ms;
  IF (receipt->>'created')::int <> batch_end-idx+1 OR
     (receipt->>'updated')::int<>0 OR (receipt->>'skipped')::int<>0 THEN
   RAISE EXCEPTION 'CP-BIMP-20B mismatched atomic receipt at row %: %',idx,receipt;
  END IF;
  total_imported:=total_imported+(receipt->>'created')::int;
  RAISE NOTICE 'CP-BIMP-20B actual PG17 transaction rows %-%: % ms, receipt created %',
   idx,batch_end,batch_ms,receipt->>'created';
  -- Existing production logs report ~8-second statement timeouts.
  -- Require margin below that ceiling, with no global timeout changes.
  IF batch_ms>=8000 THEN
   RAISE EXCEPTION 'CP-BIMP-20B batch %-% exceeded 8s threshold (% ms)',idx,batch_end,batch_ms;
  END IF;
 END LOOP;
 IF total_imported<>617 THEN RAISE EXCEPTION 'Expected 617 imported items, got %',total_imported; END IF;
 IF (SELECT count(*) FROM public.work_board_items WHERE board_id=bid)<>before_count+617 THEN
  RAISE EXCEPTION 'PostgreSQL board readback item count differs'; END IF;
 IF (SELECT count(*) FROM public.work_board_import_extended_refs r WHERE r.board_id=bid
      AND r.content LIKE 'https://example.invalid/docs/%')<>617 THEN
  RAISE EXCEPTION 'PostgreSQL extended reference count differs'; END IF;
 IF (SELECT count(*) FROM public.work_board_item_values v JOIN public.work_board_items i ON i.id=v.item_id
       WHERE i.board_id=bid AND i.title LIKE 'CP-BIMP-20B Row %'
       AND v.column_id IN (SELECT id FROM public.work_board_columns WHERE board_id=bid
          AND name=ANY(source_names)))<>617*5 THEN
  RAISE EXCEPTION 'PostgreSQL mapped cell readback differs'; END IF;
 FOR j IN 1..617 LOOP
  SELECT id INTO current_item FROM public.work_board_items
   WHERE board_id=bid AND title='CP-BIMP-20B Row '||j;
  IF current_item IS NULL OR
    (SELECT content FROM public.work_board_import_extended_refs
      WHERE item_id=current_item AND column_id=ref_id)
       IS DISTINCT FROM 'https://example.invalid/docs/'||repeat('R',7200)||'-'||j THEN
   RAISE EXCEPTION 'Row % missing / extended reference corrupt',j;
  END IF;
  FOR batch_count IN 1..5 LOOP
   col_id:=('85000000-0000-4000-8000-'||lpad(batch_count::text,12,'0'))::uuid;
   SELECT v.value#>>'{}' INTO actual_value FROM public.work_board_item_values v
    WHERE v.item_id=current_item AND v.column_id=col_id;
   IF actual_value IS DISTINCT FROM 'Value '||j||'-'||batch_count THEN
    RAISE EXCEPTION 'Row % / column % not persisted',j,batch_count;
   END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.work_board_events WHERE board_id=bid
  AND event_type='items.imported.wizard')<>before_events+ceil(617.0/batch_limit) THEN
  RAISE EXCEPTION 'Atomic batch audit events do not match the receipts';
 END IF;
 IF (SELECT jsonb_array_length(public.wm_import_extended_refs_read(bid)))<617 THEN
  RAISE EXCEPTION 'Signed authoritative extended reference readback is incomplete';
 END IF;
 RAISE NOTICE 'CP-BIMP-20B PASS 617 PostgreSQL items, 3085 typed cells, 617 exact long refs, % verified atomic batches; total % ms, max % ms',
  ceil(617.0/batch_limit),total_ms,max_ms;
END $bimp20b$;
