-- CP-FRT-SEC11 isolated fixture only. Run AFTER CP06 disposable acceptance.
-- No production users, memberships, or backend are involved.
ALTER TABLE public.work_boards ADD COLUMN name text, ADD COLUMN status text NOT NULL DEFAULT 'active';
UPDATE public.work_boards SET name='Fixture FRT board';
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
 JOIN public.profiles p ON p.id=b.user_id
 WHERE b.user_id=auth.uid() AND p.status='active'
 AND p.platform_role='admin_general_manager'); $$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_bootstrap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_bootstrap() TO authenticated;

-- HR entitlement is not fabricated by UI: an actual fixture role on the member.
UPDATE public.profiles SET platform_role='hr'
 WHERE id='00000000-0000-4000-8000-00000000000b';

-- Must reject missing identity.
DO $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM public.apsyntra_crm_my_effective_access();
  RAISE EXCEPTION 'SEC11 unauthenticated read granted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $$;

-- Administrative bootstrap sees only active-workspace boards authorized via
-- the pre-existing work_board_access function, not all global workspaces.
DO $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
 result:=public.apsyntra_crm_my_effective_access();
 IF result->>'effectivePlatformRole'<>'admin' OR result->>'platformRole'<>'admin_general_manager'
  OR result->>'bootstrap'<>'true'
  OR jsonb_array_length(result->'modules')<>12
  OR jsonb_array_length(result->'boards')<>1
  OR result#>>'{boards,0,name}'<>'Fixture FRT board'
  OR result#>>'{boards,0,manage}'<>'true'
  OR result#>>'{boards,0,memberRole}' IS NOT NULL
 THEN RAISE EXCEPTION 'SEC11 bootstrap capability snapshot violates authoritative grants'; END IF;
END $$;

-- HR has inherited Supervisor ceiling but existing stored owner board
-- membership and FRT module permission remain authoritative until overridden.
DO $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
 result:=public.apsyntra_crm_my_effective_access();
 IF result->>'platformRole'<>'hr' OR result->>'effectivePlatformRole'<>'supervisor'
   OR result->>'bootstrap'<>'false'
   OR jsonb_array_length(result->'boards')<>1
   OR result#>>'{boards,0,memberRole}'<>'owner'
   OR result#>>'{boards,0,edit}'<>'true'
   OR result#>>'{boards,0,manage}'<>'true'
 THEN RAISE EXCEPTION 'SEC11 inherited HR member permission mismatch'; END IF;
END $$;

-- A legitimate signed user in the OTHER workspace, with no direct board
-- membership, must get a successful EMPTY result. No board IDs are leaked.
DO $$
DECLARE result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
 result:=public.apsyntra_crm_my_effective_access();
 IF jsonb_array_length(result->'boards')<>0 OR
    result->>'effectivePlatformRole'<>'employee' OR
    result->>'bootstrap'<>'false'
 THEN RAISE EXCEPTION 'SEC11 cross-workspace or empty-state isolation failed'; END IF;
END $$;

-- An explicit Viewer cap is respected in the snapshot; after revocation,
-- original member and module assignments are unchanged. Only disposable data.
DO $$
DECLARE result jsonb; revision timestamptz;
 ws uuid:='00000000-0000-4000-8000-000000000001';
 b uuid:='00000000-0000-4000-8000-00000000000b';
BEGIN
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
 PERFORM public.apsyntra_crm_platform_role_set(ws,b,'viewer',NULL);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 result:=public.apsyntra_crm_my_effective_access();
 IF result->>'effectivePlatformRole'<>'viewer'
 OR result->>'explicitPlatformRole'<>'viewer'
 OR result#>>'{boards,0,view}'<>'true'
 OR result#>>'{boards,0,edit}'<>'false'
 OR result#>>'{boards,0,manage}'<>'false'
 THEN RAISE EXCEPTION 'SEC11 Viewer cap not reflected in self-only snapshot'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
 SELECT updated_at INTO revision FROM public.apsyntra_crm_platform_roles
 WHERE user_id=b AND workspace_id=ws;
 PERFORM public.apsyntra_crm_platform_role_set(ws,b,NULL,revision);
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 result:=public.apsyntra_crm_my_effective_access();
 IF result->>'effectivePlatformRole'<>'supervisor'
 OR result#>>'{boards,0,manage}'<>'true'
 OR (SELECT count(*) FROM public.module_role_assignments)<>1
 OR (SELECT count(*) FROM public.work_board_members)<>1
 THEN RAISE EXCEPTION 'SEC11 inherited permissions not restored'; END IF;
END $$;

-- Data API grants: only authenticated signed users can invoke the read-only RPC.
DO $$
BEGIN
 IF has_function_privilege('anon','public.apsyntra_crm_my_effective_access()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.apsyntra_crm_my_effective_access()','EXECUTE')
 OR has_table_privilege('authenticated','public.apsyntra_crm_platform_roles','SELECT')
 THEN RAISE EXCEPTION 'SEC11 broad table/RPC privilege leak'; END IF;
END $$;
SELECT 'PASS CP-FRT-SEC11 isolated self-scoped authorization acceptance' AS outcome;
