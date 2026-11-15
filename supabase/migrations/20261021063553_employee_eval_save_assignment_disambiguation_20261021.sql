DO $$ DECLARE ddl text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO ddl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='employee_evaluation_save';
 IF ddl IS NULL OR strpos(ddl,'SET ratings=ratings,comments=comments_text')=0 THEN RAISE EXCEPTION 'Expected save assignment not found'; END IF;
 ddl:=replace(ddl,'SET ratings=ratings,comments=comments_text','SET ratings=p_input->''ratings'',comments=comments_text');
 EXECUTE ddl;
 END $$;
 REVOKE ALL ON FUNCTION public.employee_evaluation_save(jsonb) FROM PUBLIC, anon, authenticated;;
