-- Signed synthetic recipient and private QR reference acceptance in PG17 only.
\set ON_ERROR_STOP on
BEGIN;
DO $grants$
BEGIN
 IF has_table_privilege('authenticated','public.frt_saved_recipients','SELECT') OR
    has_table_privilege('authenticated','public.frt_saved_recipients','INSERT') OR
    has_table_privilege('anon','public.frt_saved_recipients','SELECT') OR
    has_function_privilege('anon','public.frt_list_saved_recipients(uuid,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_save_recipient(uuid,text,text,text,text,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_set_recipient_qr(uuid,text,uuid,text,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated','public.frt_list_saved_recipients(uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'RECIPIENT02_UNSAFE_GRANTS'; END IF;
 IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.frt_saved_recipients'::regclass) IS NOT TRUE THEN
  RAISE EXCEPTION 'RECIPIENT02_RLS_NOT_ENABLED'; END IF;
END $grants$;
SET ROLE authenticated;
DO $tests$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-00000000000b';
 outsider uuid:='00000000-0000-4000-8000-00000000000c';
 r uuid;v jsonb;blocked boolean;path text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 v:=public.frt_save_recipient(w,'WAO','Supplier Alpha','Supplier Finance',
  'Synthetic Bank','SYN-123');
 r:=(v->>'id')::uuid;
 IF v->>'saved'<>'true' OR jsonb_array_length(public.frt_list_saved_recipients(w,'WAO'))<>1 OR
  jsonb_array_length(public.frt_list_saved_recipients(w,'WASS'))<>0 THEN
  RAISE EXCEPTION 'RECIPIENT02_CREATE_OR_COMPANY_ISOLATION_FAILED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_save_recipient(w,'NOT_COMPANY','Bad','Bad','Bad','Bad');
 EXCEPTION WHEN SQLSTATE '22023' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_UNKNOWN_COMPANY_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;
 BEGIN PERFORM public.frt_list_saved_recipients(w,'WAO');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_OUTSIDER_READ_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_save_recipient(w,'WAO','Bad','Bad','Bad','Bad');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_OUTSIDER_CREATE_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 path:=w::text||'/recipients/'||r::text||'/12345678-1234-4234-8234-123456789abc.png';
 blocked:=false;
 BEGIN PERFORM public.frt_set_recipient_qr(w,'WAO',r,NULL,path);
 EXCEPTION WHEN SQLSTATE '22023' THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_MISSING_BINARY_ACCEPTED'; END IF;
 -- Storage fixture must be inserted as the superuser; grant local test INSERT only.
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 RAISE NOTICE 'RECIPIENT02_SIGNED_CREATE_AND_DENIAL_PASS %',r;
END $tests$;
RESET ROLE;
DO $qr$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-00000000000b';
 r uuid;path text;receipt jsonb;blocked boolean;
BEGIN
 SELECT id INTO r FROM public.frt_saved_recipients
 WHERE workspace_id=w AND recipient_name='Supplier Alpha' LIMIT 1;
 path:=w::text||'/recipients/'||r::text||'/12345678-1234-4234-8234-123456789abc.png';
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('frt-attachments',path,actor::text,'{"mimetype":"image/png"}'::jsonb);
 -- Switch roles inside a separate DO block below to preserve signed execution.
END $qr$;
SET ROLE authenticated;
DO $qrtest$
DECLARE
 w uuid:='00000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-00000000000b';
 outsider uuid:='00000000-0000-4000-8000-00000000000c';
 r uuid;path text;receipt jsonb;blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 r:=(public.frt_list_saved_recipients(w,'WAO')->0->>'id')::uuid;
 path:=w::text||'/recipients/'||r::text||'/12345678-1234-4234-8234-123456789abc.png';
 receipt:=public.frt_set_recipient_qr(w,'WAO',r,NULL,path);
 IF receipt->>'qrPath'<>path OR public.frt_list_saved_recipients(w,'WAO')->0->>'qrPath'<>path THEN
  RAISE EXCEPTION 'RECIPIENT02_QR_PERSISTENCE_FAILED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_set_recipient_qr(w,'WAO',r,NULL,path);
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_STALE_QR_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_set_recipient_qr(w,'WASS',r,path,path);
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_FOREIGN_COMPANY_QR_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;
 BEGIN PERFORM public.frt_set_recipient_qr(w,'WAO',r,path,path);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'RECIPIENT02_FOREIGN_MEMBER_QR_ACCEPTED'; END IF;
 RAISE NOTICE 'RECIPIENT02_SIGNED_PRIVATE_QR_PASS';
END $qrtest$;
RESET ROLE;
ROLLBACK;
