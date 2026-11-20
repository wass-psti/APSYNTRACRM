-- PREPARED ROLLBACK ONLY: requires a separately justified rollback decision.
-- Restore only the exact four native projection entries changed by CORE-03C.
-- Production role records, native authorization, grants and RLS are untouched.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $rollback$
DECLARE source text; revised text; old_fragment text; new_fragment text;
BEGIN
 source:=pg_catalog.pg_get_functiondef('public.apsyntra_crm_my_effective_access()'::regprocedure);
 old_fragment:=E'''moduleId'', id,\n        ''role'', role,\n        ''allowed'', role IS NOT NULL';
 new_fragment:=E'''moduleId'', id,\n        ''role'', CASE WHEN id IN (''time-tracker'',''fund-released-tracker'',''fueltrack-plus'',''tradelink'') THEN CASE WHEN public.has_module_access(id,v_actor) IS TRUE THEN public.module_role_for(id,v_actor) ELSE NULL END ELSE role END,\n        ''allowed'', CASE WHEN id IN (''time-tracker'',''fund-released-tracker'',''fueltrack-plus'',''tradelink'') THEN public.has_module_access(id,v_actor) IS TRUE AND public.module_role_for(id,v_actor) IS NOT NULL ELSE role IS NOT NULL END';
 IF pg_catalog.strpos(source,new_fragment)=0 OR pg_catalog.strpos(source,old_fragment)>0 THEN
  RAISE EXCEPTION 'Rollback guard: unexpected active projection; no change' USING ERRCODE='55000';
 END IF;
 revised:=pg_catalog.replace(source,new_fragment,old_fragment);
 IF revised=source THEN RAISE EXCEPTION 'Rollback source replacement did not apply' USING ERRCODE='55000'; END IF;
 EXECUTE revised;
END;
$rollback$;
COMMIT;
