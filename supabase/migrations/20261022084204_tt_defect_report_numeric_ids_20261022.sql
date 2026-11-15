DO $migration$
DECLARE definition text; old_guard text := 'p_tool_id !~ ''^tt-tool-[a-zA-Z0-9-]{20,100}$'''; new_guard text := 'p_tool_id !~ ''^(tt-tool-[a-zA-Z0-9-]{20,100}|[0-9]{1,30})$''';
BEGIN
 SELECT pg_get_functiondef('public.tool_traceability_report_defect_v1(uuid,text,text,bigint)'::regprocedure) INTO definition;
 IF definition IS NULL THEN RAISE EXCEPTION 'Missing defect reporting RPC'; END IF;
 IF strpos(definition,new_guard)>0 THEN RETURN; END IF;
 IF strpos(definition,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected defect RPC identifier guard'; END IF;
 EXECUTE replace(definition,old_guard,new_guard);
END $migration$;;
