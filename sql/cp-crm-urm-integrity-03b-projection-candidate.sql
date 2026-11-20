-- CP-CRM-URM-INTEGRITY-03B candidate: align native module display with
-- the existing signed server authority. This source candidate is NOT a
-- production migration and must not be applied outside disposable testing.
-- Does not change module_role_for, has_module_access, grants, roles or RLS.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $patch$
DECLARE source text; revised text; old_fragment text; new_fragment text;
BEGIN
 source:=pg_catalog.pg_get_functiondef('public.apsyntra_crm_my_effective_access()'::regprocedure);
 old_fragment:=E'''moduleId'', id,\n        ''role'', role,\n        ''allowed'', role IS NOT NULL';
 new_fragment:=E'''moduleId'', id,\n        ''role'', CASE WHEN id IN (''time-tracker'',''fund-released-tracker'',''fueltrack-plus'',''tradelink'') THEN CASE WHEN public.has_module_access(id,v_actor) IS TRUE THEN public.module_role_for(id,v_actor) ELSE NULL END ELSE role END,\n        ''allowed'', CASE WHEN id IN (''time-tracker'',''fund-released-tracker'',''fueltrack-plus'',''tradelink'') THEN public.has_module_access(id,v_actor) IS TRUE AND public.module_role_for(id,v_actor) IS NOT NULL ELSE role IS NOT NULL END';
 IF pg_catalog.strpos(source,old_fragment)=0
  OR pg_catalog.strpos(source,'v_is_admin := v_effective_role = ''admin''')=0
  OR pg_catalog.strpos(source,'public.apsyntra_crm_module_role_rank')=0 THEN
   RAISE EXCEPTION 'Effective-access projection source drift: stop, review manually' USING ERRCODE='55000';
 END IF;
 revised:=pg_catalog.replace(source,old_fragment,new_fragment);
 IF revised=source OR pg_catalog.strpos(revised,'public.has_module_access(id,v_actor)')=0 THEN
  RAISE EXCEPTION 'Native access source reconciliation incomplete' USING ERRCODE='55000';
 END IF;
 EXECUTE revised;
END;
$patch$;
COMMIT;
