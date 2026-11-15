DO $$
DECLARE fname text; ddl text;
BEGIN
 FOR fname IN SELECT unnest(ARRAY['order_intake_update_status','order_intake_archive']) LOOP
  SELECT pg_get_functiondef(p.oid) INTO ddl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=fname;
  IF ddl IS NULL THEN RAISE EXCEPTION 'Missing function %',fname; END IF;
  IF fname='order_intake_update_status' THEN
   ddl:=replace(ddl,
   'INSERT INTO public.order_intake_activity(workspace_id,order_id,actor_user_id,action,details)
 VALUES(w,p_id,u,''STATUS_UPDATED'',
 jsonb_build_object(''before'',old_order.status,''after'',p_status,''revision'',new_order.revision));',
   'INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,''STATUS_UPDATED'',
 ''Status changed from ''||old_order.status||'' to ''||p_status||'' (revision ''||new_order.revision||'')'',u);');
  ELSE
   ddl:=replace(ddl,
   'INSERT INTO public.order_intake_activity(workspace_id,order_id,actor_user_id,action,details)
 VALUES(w,p_id,u,''ARCHIVED'',jsonb_build_object(''revision'',new_order.revision,''previousStatus'',old_order.status));',
   'INSERT INTO public.order_intake_activity(workspace_id,order_id,po_number,type,message,actor_id)
 VALUES(w,p_id,old_order.po_number,''ARCHIVED'',
 ''Order archived (revision ''||new_order.revision||'', prior status ''||old_order.status||'')'',u);');
  END IF;
  IF strpos(ddl,'actor_user_id,action,details')>0 THEN RAISE EXCEPTION 'Audit replacement failed for %',fname; END IF;
  EXECUTE ddl;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.order_intake_update_status(uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.order_intake_archive(uuid,integer) FROM PUBLIC,anon,authenticated;;
