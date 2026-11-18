\set ON_ERROR_STOP on
DO $$
DECLARE r jsonb; m jsonb;
BEGIN
 PERFORM set_config('test.actor','11111111-1111-4111-8111-111111111111',true);
 r:=public.apsyntra_crm_my_effective_access();
 IF r->>'workspaceId'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN RAISE EXCEPTION 'wrong workspace'; END IF;
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='material-request-hub';
 IF m->>'role'<>'REQUESTOR' OR m->>'allowed'<>'true' THEN RAISE EXCEPTION 'MRH assignment not applied: %',m; END IF;
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='toolbox-issues';
 IF m->>'role'<>'employee' OR m->>'allowed'<>'true' THEN RAISE EXCEPTION 'Toolbox assignment not applied: %',m; END IF;
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='fueltrans';
 IF m->>'role'<>'User' OR m->>'allowed'<>'true' THEN RAISE EXCEPTION 'FuelTrans assignment not applied: %',m; END IF;
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='tradelink';
 IF m->>'role'<>'User' THEN RAISE EXCEPTION 'Legacy module regression: %',m; END IF;

 -- Changes are visible on the next read, without token refresh.
 UPDATE public.material_request_hub_memberships SET enabled=false WHERE user_id=auth.uid();
 r:=public.apsyntra_crm_my_effective_access();
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='material-request-hub';
 IF m->>'allowed'<>'false' THEN RAISE EXCEPTION 'revocation not effective: %',m; END IF;
 UPDATE public.material_request_hub_memberships SET enabled=true,status='active' WHERE user_id=auth.uid();

 -- Preserve the existing explicit CRM role rank ceiling.
 INSERT INTO public.apsyntra_crm_platform_roles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'viewer');
 r:=public.apsyntra_crm_my_effective_access();
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='toolbox-issues';
 IF m->>'allowed'<>'false' THEN RAISE EXCEPTION 'role ceiling bypassed: %',m; END IF;
 -- CRM Admin effective role must grant the same module and board projection
 -- as an inherited admin, but only inside the active workspace.
 UPDATE public.apsyntra_crm_platform_roles SET role='admin' WHERE user_id=auth.uid();
 r:=public.apsyntra_crm_my_effective_access();
 SELECT x INTO m FROM jsonb_array_elements(r->'modules') x WHERE x->>'moduleId'='toolbox-issues';
 IF m->>'role'<>'admin' OR m->>'allowed'<>'true' THEN
  RAISE EXCEPTION 'Explicit CRM Admin did not receive admin module projection: %',m; END IF;
 SELECT x INTO m FROM jsonb_array_elements(r->'boards') x
   WHERE x->>'id'='77777777-7777-4777-8777-777777777777';
 IF m->>'view'<>'true' OR m->>'edit'<>'true' OR m->>'manage'<>'true' THEN
  RAISE EXCEPTION 'Explicit CRM Admin did not receive board parity: %',m; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'boards') x
  WHERE x->>'id'='88888888-8888-4888-8888-888888888888') THEN
  RAISE EXCEPTION 'Admin role crossed workspace boundary'; END IF;
 DELETE FROM public.apsyntra_crm_platform_roles WHERE user_id=auth.uid();
END $$;
DO $$
DECLARE r jsonb; m jsonb;
BEGIN
 PERFORM set_config('test.actor','22222222-2222-4222-8222-222222222222',true);
 r:=public.apsyntra_crm_my_effective_access();
 IF r->>'workspaceId'<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' THEN RAISE EXCEPTION 'workspace isolation failed'; END IF;
 FOR m IN SELECT x FROM jsonb_array_elements(r->'modules') x
  WHERE x->>'moduleId' IN ('material-request-hub','toolbox-issues','fueltrans') LOOP
  IF m->>'allowed'<>'false' THEN RAISE EXCEPTION 'disabled/client/global role leaked: %',m; END IF;
 END LOOP;
 PERFORM set_config('test.actor','33333333-3333-4333-8333-333333333333',true);
 BEGIN
  PERFORM public.apsyntra_crm_my_effective_access();
  RAISE EXCEPTION 'unassigned account unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT 'CP_URM_EFFECTIVE01A_DISPOSABLE_PASS' AS result;
