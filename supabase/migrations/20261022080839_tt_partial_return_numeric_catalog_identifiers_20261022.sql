DO $patch$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO original
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='tool_traceability_partial_return_v1'
 AND pg_get_function_identity_arguments(p.oid)='p_workspace_id uuid, p_request_id text, p_tool_ids jsonb, p_expected_version bigint, p_return_date date';
 IF original IS NULL THEN RAISE EXCEPTION 'Expected partial-return function not found'; END IF;
 IF length(original)-length(replace(original, 'x !~ ''^tt-tool-[a-zA-Z0-9-]{20,100}$''', '')) <> length('x !~ ''^tt-tool-[a-zA-Z0-9-]{20,100}$''') THEN RAISE EXCEPTION 'Expected validation predicate not found exactly once'; END IF;
 updated := replace(original, 'x !~ ''^tt-tool-[a-zA-Z0-9-]{20,100}$''', 'x !~ ''^(tt-tool-[a-zA-Z0-9-]{20,100}|[0-9]{1,30})$''');
 EXECUTE updated;
END $patch$;;
