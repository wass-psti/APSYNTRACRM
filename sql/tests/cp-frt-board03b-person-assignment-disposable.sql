-- Read-only structural assertions plus synthetic signed FRT user actions.
-- Use after SEC14 safe fixture; rollback all test data and audit mutations.
\set ON_ERROR_STOP on
BEGIN;
DO $grants$
BEGIN
 IF has_function_privilege('anon','public.frt_assignable_people(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.frt_request_assignment(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.frt_assign_request_person(uuid,uuid,uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.frt_assign_request_person(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_table_privilege('authenticated','public.frt_requests','UPDATE')
 THEN RAISE EXCEPTION 'FRT03B_ASSIGNMENT_GRANTS_INVALID'; END IF;
END $grants$;
SET ROLE authenticated;
DO $test$
DECLARE w uuid:='00000000-0000-4000-8000-000000000001';
 req uuid:='10000000-0000-4000-8000-000000000001';
 actor uuid:='00000000-0000-4000-8000-00000000000b';
 foreign_user uuid:='00000000-0000-4000-8000-00000000000c';
 result jsonb; blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.frt_assignable_people(w);
 IF jsonb_typeof(result)<>'array' OR NOT result @> jsonb_build_array(jsonb_build_object('id',actor))
 THEN RAISE EXCEPTION 'FRT03B_ACTIVE_WORKSPACE_DIRECTORY_FAILED'; END IF;
 IF public.frt_request_assignment(w,req)->>'assigneeId' IS NOT NULL
 THEN RAISE EXCEPTION 'FRT03B_ORIGINAL_ASSIGNEE_NOT_EMPTY'; END IF;
 result:=public.frt_assign_request_person(w,req,NULL,actor);
 IF result->>'assigneeId' IS DISTINCT FROM actor::text OR
 public.frt_request_assignment(w,req)->>'assigneeId' IS DISTINCT FROM actor::text
 THEN RAISE EXCEPTION 'FRT03B_ASSIGNMENT_ROUNDTRIP_FAILED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_assign_request_person(w,req,NULL,actor);
 EXCEPTION WHEN SQLSTATE '40001' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03B_STALE_ASSIGNMENT_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_assign_request_person(w,req,actor,foreign_user);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03B_FOREIGN_ASSIGNEE_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',foreign_user::text,true);
 blocked:=false;
 BEGIN PERFORM public.frt_request_assignment(w,req);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03B_FOREIGN_READER_ACCEPTED'; END IF;
 blocked:=false;
 BEGIN PERFORM public.frt_assign_request_person(w,req,actor,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'FRT03B_FOREIGN_WRITER_ACCEPTED'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.frt_assign_request_person(w,req,actor,NULL);
 IF result->>'assigneeId' IS NOT NULL OR
 (SELECT count(*) FROM public.frt_audit_logs
 WHERE workspace_id=w AND fund_request_id=req AND action='REQUEST_PERSON_ASSIGNED')<>2
 THEN RAISE EXCEPTION 'FRT03B_UNASSIGN_OR_AUDIT_FAILED'; END IF;
 RAISE NOTICE 'FRT03B_PERSON_ASSIGNMENT_CAS_WORKSPACE_DENIAL_PASS';
END $test$;
RESET ROLE;
ROLLBACK;
