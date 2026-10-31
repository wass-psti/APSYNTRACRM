-- CP-FRT-SEC11: authenticated self-only permissions inspector; no data or role writes.
BEGIN;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_my_effective_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE a uuid:=auth.uid(); w uuid; host_role text; effective text; explicit_role text;
 boot boolean; modules jsonb; boards jsonb;
BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Signed identity required' USING ERRCODE='42501'; END IF;
 w:=public.current_workspace_id(a);
 SELECT p.platform_role INTO host_role
 FROM public.profiles p JOIN public.workspace_members m ON m.user_id=p.id
 WHERE p.id=a AND p.status='active' AND m.workspace_id=w AND m.active;
 IF w IS NULL OR host_role IS NULL THEN
  RAISE EXCEPTION 'Active workspace membership required' USING ERRCODE='42501';
 END IF;
 boot:=public.apsyntra_role_is_bootstrap();
 effective:=public.apsyntra_crm_effective_role(a,w);
 explicit_role:=public.apsyntra_crm_explicit_role(a,w);
 IF boot IS NULL OR effective NOT IN ('admin','supervisor','employee','viewer') THEN
  RAISE EXCEPTION 'Effective authorization unavailable' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'moduleId',x.id,'role',public.module_role_for(x.id,a),
  'allowed',public.has_module_access(x.id,a)) ORDER BY x.id),'[]'::jsonb)
 INTO modules FROM unnest(ARRAY[
  'aps-aims','charter-navigator','employee-eval','fueltrack-plus',
  'fueltrans','fund-released-tracker','material-request-hub',
  'order-intake','time-tracker','tool-traceability','toolbox-issues','tradelink'
 ]::text[]) x(id);
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'name',b.name,'memberRole',bm.role,
   'view',public.work_board_access(b.id,'view'),
   'edit',public.work_board_access(b.id,'edit'),
   'manage',public.work_board_access(b.id,'manage')
  ) ORDER BY b.name,b.id),'[]'::jsonb) INTO boards
 FROM public.work_boards b
 LEFT JOIN public.work_board_members bm ON bm.board_id=b.id AND bm.user_id=a
 WHERE b.workspace_id=w AND b.status='active'
 AND public.work_board_access(b.id,'view')=true;
 RETURN jsonb_build_object('schemaVersion',1,'workspaceId',w,
  'platformRole',host_role,'effectivePlatformRole',effective,
  'explicitPlatformRole',explicit_role,'bootstrap',boot,
  'modules',modules,'boards',boards);
END;$fn$;
REVOKE ALL ON FUNCTION public.apsyntra_crm_my_effective_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_crm_my_effective_access() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
