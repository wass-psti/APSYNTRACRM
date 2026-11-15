DO $migration$
DECLARE d text; old_guard text := 'p_tool_id !~ ''^tt-tool-[a-zA-Z0-9-]{20,100}$'''; new_guard text := 'p_tool_id !~ ''^(tt-tool-[a-zA-Z0-9-]{20,100}|[0-9]{1,30})$''';
BEGIN
 SELECT pg_get_functiondef('public.tool_traceability_release_inspected_v1(uuid,text,bigint)'::regprocedure) INTO d;
 IF d IS NULL THEN RAISE EXCEPTION 'Missing function'; END IF;
 IF strpos(d,new_guard)>0 THEN RETURN; END IF;
 IF strpos(d,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected function guard'; END IF;
 EXECUTE replace(d,old_guard,new_guard);
END $migration$;;
