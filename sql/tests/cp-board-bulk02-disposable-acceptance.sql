-- CP-BOARD-BULK02 disposable PG17: atomic mutation, stale denial, workspace & role, protected domains and CAS groups.
\set ON_ERROR_STOP on
DO $tests$
DECLARE
 board uuid:='30000000-0000-4000-8000-000000000001';
 foreign_board uuid:='30000000-0000-4000-8000-000000000002';
 module_board uuid:='30000000-0000-4000-8000-000000000003';
 main_group uuid:='60000000-0000-4000-8000-000000000001';
 archived_group uuid:='60000000-0000-4000-8000-000000000002';
 empty_group uuid:='60000000-0000-4000-8000-000000000003';
 module_group uuid:='60000000-0000-4000-8000-000000000005';
 a uuid:='40000000-0000-4000-8000-000000000001';
 b uuid:='40000000-0000-4000-8000-000000000003';
 old_a timestamptz; old_b timestamptz; fresh_a timestamptz; fresh_b timestamptz;
 g_at timestamptz; latest_at timestamptz; result jsonb; prior_items int; prior_audit int;
BEGIN
 SELECT count(*) INTO prior_items FROM public.work_board_items;
 SELECT count(*) INTO prior_audit FROM public.work_board_events;
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 SELECT updated_at INTO old_a FROM public.work_board_items WHERE id=a;
 SELECT updated_at INTO old_b FROM public.work_board_items WHERE id=b;
 result:=public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
  jsonb_build_object('id',a,'expected_updated_at',old_a,'status','done'),
  jsonb_build_object('id',b,'expected_updated_at',old_b,'status','done')));
 IF result->>'action'<>'status' OR (result->>'applied')::int<>2 OR
  jsonb_array_length(result->'items')<>2 OR
  (SELECT count(*) FROM public.work_board_items WHERE id IN(a,b) AND status='done')<>2
 THEN RAISE EXCEPTION 'Atomic bulk status application incorrect'; END IF;
 SELECT updated_at INTO fresh_a FROM public.work_board_items WHERE id=a;
 SELECT updated_at INTO fresh_b FROM public.work_board_items WHERE id=b;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',a,'expected_updated_at',old_a,'status','working'),
   jsonb_build_object('id',b,'expected_updated_at',fresh_b,'status','working')));
  RAISE EXCEPTION 'Stale batch accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_items WHERE id IN(a,b) AND status='done')<>2
 THEN RAISE EXCEPTION 'Failed batch partially changed records'; END IF;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',a,'expected_updated_at',fresh_a,'status','blocked')));
  RAISE EXCEPTION 'Inactive status allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',a,'expected_updated_at',fresh_a,'status','done'),
   jsonb_build_object('id',a,'expected_updated_at',fresh_a,'status','done')));
  RAISE EXCEPTION 'Duplicate batch ID allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',a,'expected_updated_at',fresh_a,'status','working'),
   jsonb_build_object('id','40000000-0000-4000-8000-000000000002',
    'expected_updated_at',fresh_b,'status','working')));
  RAISE EXCEPTION 'Cross-board mixed batch allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.work_board_items WHERE id IN(a,b) AND status='done')<>2
 THEN RAISE EXCEPTION 'Mixed foreign batch changed an allowed item'; END IF;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(module_board,'archive',jsonb_build_array(
   jsonb_build_object('id',a,'expected_updated_at',fresh_a)));
  RAISE EXCEPTION 'Protected module board accepted generic bulk writer';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 result:=public.wm_board_bulk_mutate(board,'archive',jsonb_build_array(
  jsonb_build_object('id',a,'expected_updated_at',fresh_a)));
 IF result->>'action'<>'archive' OR
  (SELECT archived_at FROM public.work_board_items WHERE id=a) IS NULL THEN
  RAISE EXCEPTION 'Archive failed'; END IF;
 SELECT updated_at INTO latest_at FROM public.work_board_items WHERE id=a;
 result:=public.wm_board_bulk_mutate(board,'restore',jsonb_build_array(
  jsonb_build_object('id',a,'expected_updated_at',latest_at)));
 IF (SELECT archived_at FROM public.work_board_items WHERE id=a) IS NOT NULL
 THEN RAISE EXCEPTION 'Restore failed'; END IF;

 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=main_group;
 result:=public.wm_board_group_cas(board,main_group,g_at,'rename','Revised primary group');
 IF result->>'action'<>'rename' OR
  (SELECT title FROM public.work_board_groups WHERE id=main_group)<>'Revised primary group'
 THEN RAISE EXCEPTION 'CAS rename failed'; END IF;
 BEGIN
  PERFORM public.wm_board_group_cas(board,main_group,g_at,'rename','Stale overwrite');
  RAISE EXCEPTION 'Stale group rename accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=archived_group;
 BEGIN
  PERFORM public.wm_board_group_cas(board,archived_group,g_at,'delete_empty',NULL);
  RAISE EXCEPTION 'Archived item group deletion permitted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=main_group;
 BEGIN
  PERFORM public.wm_board_group_cas(board,main_group,g_at,'delete_empty',NULL);
  RAISE EXCEPTION 'Populated item group deletion permitted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=module_group;
 BEGIN
  PERFORM public.wm_board_group_cas(module_board,module_group,g_at,'delete_empty',NULL);
  RAISE EXCEPTION 'Application-managed group deletion permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=empty_group;
 result:=public.wm_board_group_cas(board,empty_group,g_at,'delete_empty',NULL);
 IF result->>'action'<>'delete_empty' OR
  EXISTS(SELECT 1 FROM public.work_board_groups WHERE id=empty_group) OR
  (SELECT count(*) FROM public.work_board_items)<>prior_items THEN
  RAISE EXCEPTION 'Empty-only group delete damaged items'; END IF;

 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
 SELECT updated_at INTO fresh_b FROM public.work_board_items WHERE id=b;
 result:=public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
  jsonb_build_object('id',b,'expected_updated_at',fresh_b,'status','working')));
 IF (SELECT status FROM public.work_board_items WHERE id=b)<>'working'
 THEN RAISE EXCEPTION 'Authorized editor bulk update denied'; END IF;
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=main_group;
 BEGIN
  PERFORM public.wm_board_group_cas(board,main_group,g_at,'delete_empty',NULL);
  RAISE EXCEPTION 'Editor allowed to delete a group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000003',false);
 SELECT updated_at INTO fresh_b FROM public.work_board_items WHERE id=b;
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',b,'expected_updated_at',fresh_b,'status','done')));
  RAISE EXCEPTION 'Viewer bulk edit accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000004',false);
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',b,'expected_updated_at',fresh_b,'status','done')));
  RAISE EXCEPTION 'Foreign workspace edit accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT updated_at INTO g_at FROM public.work_board_groups
  WHERE id='60000000-0000-4000-8000-000000000004';
 BEGIN
  PERFORM public.wm_board_group_cas(foreign_board,
   '60000000-0000-4000-8000-000000000004',g_at,'delete_empty',NULL);
  RAISE EXCEPTION 'Last group deleted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 UPDATE auth.sessions SET not_after=now()-interval '1 hour'
 WHERE id='70000000-0000-4000-8000-000000000001';
 SELECT updated_at INTO g_at FROM public.work_board_groups WHERE id=main_group;
 BEGIN
  PERFORM public.wm_board_group_cas(board,main_group,g_at,'rename','Expired session');
  RAISE EXCEPTION 'Expired signed session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
 WHERE id='70000000-0000-4000-8000-000000000001';
 DELETE FROM auth.sessions WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_board_bulk_mutate(board,'status',jsonb_build_array(
   jsonb_build_object('id',b,'expected_updated_at',fresh_b,'status','done')));
  RAISE EXCEPTION 'Revoked signed session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 IF has_function_privilege('authenticated',
  'public.wm_delete_board_group(uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'public.wm_board_bulk_mutate(uuid,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon',
  'public.wm_board_group_cas(uuid,uuid,timestamptz,text,text)','EXECUTE')
 OR (SELECT count(*) FROM public.work_board_items)<>prior_items
 OR NOT EXISTS(SELECT 1 FROM public.work_board_events
  WHERE event_type='items.bulk_status')
 OR NOT EXISTS(SELECT 1 FROM public.work_board_events
  WHERE event_type='group.deleted_empty')
 THEN RAISE EXCEPTION 'Security grants, preserved data or audit check failed'; END IF;
 RAISE NOTICE 'CP-BOARD-BULK02 synthetic atomic/CAS/denial/rollback prerequisites PASS';
END $tests$;
