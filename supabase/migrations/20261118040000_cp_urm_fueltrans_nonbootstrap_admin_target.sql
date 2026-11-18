-- CP-URM-FUELTRANS-403: preserve exact bootstrap protection while allowing
-- nonbootstrap CRM Admin / inherited admin_general_manager workspace members
-- to receive their existing workspace-scoped operational FuelTrans role.
-- No changes to table grants, policies, or role definitions.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
DO $patch$
DECLARE v_source text;v_revised text;
BEGIN
 v_source:=pg_get_functiondef(
  'public.apsyntra_role_fueltrans_workspace_set(uuid,uuid,text,boolean,timestamptz)'::regprocedure);
 IF position('OR public.is_platform_admin(p_target_user_id)' IN v_source)=0 OR
  position('public.apsyntra_role_bootstrap_identities' IN v_source)=0 OR
  position('public.apsyntra_role_require_scope(p_workspace_id)' IN v_source)=0 THEN
  RAISE EXCEPTION 'FuelTrans source role contract drift: manual review required' USING ERRCODE='55000';
 END IF;
 -- is_platform_admin checks an inherited profile label, not the two protected
 -- bootstrap identities. The separate exact identity guard remains in force.
 v_revised:=replace(v_source,'OR public.is_platform_admin(p_target_user_id)','');
 IF v_revised=v_source OR position('public.apsyntra_role_bootstrap_identities' IN v_revised)=0 THEN
  RAISE EXCEPTION 'FuelTrans protection invariant failed' USING ERRCODE='55000';
 END IF;
 EXECUTE v_revised;
END $patch$;
COMMIT;
