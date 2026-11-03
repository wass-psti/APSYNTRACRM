-- CP-TT-GROUP01: genuine *disposable* PostgreSQL authorization & data integrity checks.
\set ON_ERROR_STOP on
DO $verify$
DECLARE
 b uuid:='30000000-0000-4000-8000-000000000003';
 ordinary uuid:='30000000-0000-4000-8000-000000000001';
 primary_group uuid:='60000000-0000-4000-8000-000000000005';
 secondary uuid:='60000000-0000-4000-8000-000000000007';
 archived uuid:='60000000-0000-4000-8000-000000000008';
 stale uuid:='60000000-0000-4000-8000-000000000009';
 revision timestamptz; receipt jsonb; before_items integer; after_items integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 SELECT count(*) INTO before_items FROM public.work_board_items;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=primary_group;
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,primary_group,revision,'TimeTracker group');
  RAISE EXCEPTION 'Primary protected group deletion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=secondary;
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,secondary,revision,'WRONG');
  RAISE EXCEPTION 'Wrong group confirmation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=archived;
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,archived,revision,'Archived secondary');
  RAISE EXCEPTION 'Archived-record group deletion accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=stale;
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision-interval '1 second','Stale secondary');
  RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id='60000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(ordinary,
   '60000000-0000-4000-8000-000000000001',revision,'Main group');
  RAISE EXCEPTION 'Ordinary board accepted by protected-specific RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=secondary;
 receipt:=public.wm_managed_board_delete_empty_group(b,secondary,revision,'Safe empty secondary');
 IF receipt->>'groupId'<>secondary::text OR receipt->>'deleted'<>'true'
  OR EXISTS(SELECT 1 FROM public.work_board_groups WHERE id=secondary)
 THEN RAISE EXCEPTION 'Signed empty group not deleted with verified receipt'; END IF;
 SELECT count(*) INTO after_items FROM public.work_board_items;
 IF before_items<>after_items
  OR NOT EXISTS(SELECT 1 FROM public.work_board_events
    WHERE board_id=b AND event_type='group.deleted_empty'
      AND entity_id=secondary::text
      AND actor_id='20000000-0000-4000-8000-000000000001')
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items WHERE group_id=archived)
 THEN RAISE EXCEPTION 'Protected-domain item/audit integrity failure'; END IF;

 -- Board owner, but not a platform administrator: denied.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
 SELECT updated_at INTO revision FROM public.work_board_groups WHERE id=stale;
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision,'Stale secondary');
  RAISE EXCEPTION 'Non-platform board owner bypassed admin-only delete';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Board viewer denied.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000003',false);
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision,'Stale secondary');
  RAISE EXCEPTION 'Viewer deleted protected group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Foreign workspace denied.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000004',false);
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision,'Stale secondary');
  RAISE EXCEPTION 'Foreign workspace deleted protected group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 -- Expired and revoked GoTrue sessions denied even for otherwise valid admin.
 PERFORM set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
 PERFORM set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000001',false);
 UPDATE auth.sessions SET not_after=now()-interval '1 hour'
  WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision,'Stale secondary');
  RAISE EXCEPTION 'Expired session deleted protected group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE auth.sessions SET not_after=NULL
  WHERE id='70000000-0000-4000-8000-000000000001';
 DELETE FROM auth.sessions WHERE id='70000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.wm_managed_board_delete_empty_group(b,stale,revision,'Stale secondary');
  RAISE EXCEPTION 'Revoked session deleted protected group';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_groups WHERE id=stale)
 OR EXISTS(SELECT 1 FROM public.work_board_groups WHERE id=secondary)
 OR before_items<>(SELECT count(*) FROM public.work_board_items)
 OR has_function_privilege('anon',
   'public.wm_managed_board_delete_empty_group(uuid,uuid,timestamp with time zone,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.wm_delete_board_group(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Deny/legacy grant/preservation acceptance failed'; END IF;
 RAISE NOTICE 'CP-TT-GROUP01 disposable managed empty-group signed authorizations PASS';
END $verify$;
