-- CP-FRT-SEC14: guarded legacy read RPC EXECUTE retirement candidate.
-- NOT PRODUCTION-AUTHORIZED OR APPLIED. Apply ONLY after:
-- (1) inventory and migration of every deployed FRT legacy client,
-- (2) genuine signed nonbootstrap + foreign existing workspace denial evidence,
-- (3) explicit production security/access change authorization and recovery plan.
-- No CREATE/REPLACE, financial DML, user/role updates, or new permissions.
-- Do not use the earlier canonical detail CREATE+REVOKE file on an already
-- additively activated production database.
BEGIN;

DO $preflight$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY[
  'public.frt_restricted_request_detail(uuid,uuid)',
  'public.frt_board_list_safe(uuid,text,text)',
  'public.frt_board_dashboard_safe(uuid,text)',
  'public.frt_get_request(uuid,uuid)',
  'public.frt_list_requests(uuid,text,text)',
  'public.frt_dashboard(uuid,text)',
  'public.frt_request_action(uuid,uuid,text,jsonb)',
  'private.frt_current_role(uuid)',
  'private.frt_signed_session_active()'
 ] LOOP
  IF to_regprocedure(name) IS NULL THEN
   RAISE EXCEPTION 'SEC14 cutover missing required function: %',name
     USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF NOT (
  has_function_privilege('authenticated','public.frt_restricted_request_detail(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.frt_board_list_safe(uuid,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.frt_board_dashboard_safe(uuid,text)','EXECUTE')
 ) OR (
  has_function_privilege('anon','public.frt_restricted_request_detail(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.frt_board_list_safe(uuid,text,text)','EXECUTE')
  OR has_function_privilege('anon','public.frt_board_dashboard_safe(uuid,text)','EXECUTE')
 ) THEN
  RAISE EXCEPTION 'SEC14 cutover restricted API grants drifted' USING ERRCODE='55000';
 END IF;
 IF pg_get_functiondef('private.frt_current_role(uuid)'::regprocedure)
      NOT LIKE '%private.frt_signed_session_active%' OR
    NOT has_function_privilege('authenticated',
     'public.frt_request_action(uuid,uuid,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'SEC14 cutover auth guard or historical finance authority drifted'
    USING ERRCODE='55000';
 END IF;
END
$preflight$;

REVOKE EXECUTE ON FUNCTION
 public.frt_get_request(uuid,uuid),
 public.frt_list_requests(uuid,text,text),
 public.frt_dashboard(uuid,text)
 FROM PUBLIC,anon,authenticated;

DO $postcheck$
BEGIN
 IF has_function_privilege('authenticated','public.frt_get_request(uuid,uuid)','EXECUTE') OR
    has_function_privilege('authenticated','public.frt_list_requests(uuid,text,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.frt_dashboard(uuid,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_get_request(uuid,uuid)','EXECUTE') OR
    has_function_privilege('anon','public.frt_list_requests(uuid,text,text)','EXECUTE') OR
    has_function_privilege('anon','public.frt_dashboard(uuid,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.frt_restricted_request_detail(uuid,uuid)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.frt_board_list_safe(uuid,text,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.frt_board_dashboard_safe(uuid,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.frt_request_action(uuid,uuid,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'SEC14 cutover postcheck failed; transaction rolled back'
    USING ERRCODE='55000';
 END IF;
END
$postcheck$;

COMMIT;
