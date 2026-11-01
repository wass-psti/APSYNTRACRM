-- CP-FRT-SEC14 — CONTROLLED CUTOVER CANDIDATE. NOT YET DEPLOYED.
-- Prerequisites: secure list/dashboard installed, authenticated frontend
-- switched to secureContracts:true, signed negative/positive tests passed,
-- all external FRT consumers reconciled and recovery controls approved.
-- Complements the canonical detail RPC migration and its legacy detail revoke.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.frt_board_list_safe(uuid,text,text)') IS NULL OR
    to_regprocedure('public.frt_board_dashboard_safe(uuid,text)') IS NULL OR
    to_regprocedure('public.frt_list_requests(uuid,text,text)') IS NULL OR
    to_regprocedure('public.frt_dashboard(uuid,text)') IS NULL OR
    NOT has_function_privilege('authenticated',
      'public.frt_board_list_safe(uuid,text,text)','EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.frt_board_dashboard_safe(uuid,text)','EXECUTE') THEN
  RAISE EXCEPTION 'SEC14 safe read API activation preconditions not met'
    USING ERRCODE='55000';
 END IF;
END;
$preflight$;
REVOKE EXECUTE ON FUNCTION public.frt_list_requests(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.frt_dashboard(uuid,text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
