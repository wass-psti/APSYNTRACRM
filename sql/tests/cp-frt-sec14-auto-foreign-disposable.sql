-- SEC14: independently execute staged automatic foreign selection in
-- disposable PostgreSQL. Identity simulation is NOT a production Auth session.
-- Must run after the existing two-workspace and FRT grant fixture.
\set ON_ERROR_STOP on
DO $grants$
BEGIN
 IF to_regprocedure('public.frt_sec14_auto_foreign_denials(uuid)') IS NULL OR
 NOT has_function_privilege('authenticated',
  'public.frt_sec14_auto_foreign_denials(uuid)','EXECUTE') OR
 has_function_privilege('anon','public.frt_sec14_auto_foreign_denials(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'SEC14 automated RPC availability/grants failed';
 END IF;
END
$grants$;
BEGIN;
SET ROLE authenticated;
DO $probe$
DECLARE
 result jsonb;
 denied boolean;
 origin uuid := '00000000-0000-4000-8000-000000000001';
 foreign_ws uuid := '00000000-0000-4000-8000-000000000002';
BEGIN
 -- Fixture user B is a nonbootstrap FINANCE_MANAGER with workspace 1
 -- membership. Workspace 2 exists independently but B is not a member.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',true);
 IF private.frt_current_role(origin) <> 'FINANCE_MANAGER' OR
    private.frt_current_role(foreign_ws) IS NOT NULL THEN
  RAISE EXCEPTION 'Disposable nonbootstrap identity fixture invalid';
 END IF;
 result:=public.frt_sec14_auto_foreign_denials(origin);
 IF result IS DISTINCT FROM jsonb_build_object(
  'status','PASS','reason','FOREIGN_WORKSPACE_DENIAL_VERIFIED',
  'foreignWorkspaceExistence','VERIFIED','dashboard','PASS','list','PASS') THEN
   RAISE EXCEPTION 'SEC14 automated foreign-workspace denial failure';
 END IF;

 -- A caller cannot submit workspace 2 as its own scope to bypass membership.
 denied:=false;
 BEGIN
  PERFORM public.frt_sec14_auto_foreign_denials(foreign_ws);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SEC14 workspace impersonation allowed'; END IF;

 -- Bootstrap identity A is never an eligible independent denial actor.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000a',true);
 denied:=false;
 BEGIN
  PERFORM public.frt_sec14_auto_foreign_denials(origin);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SEC14 bootstrap bypass succeeded'; END IF;

 -- User C belongs to workspace 2 but has no active FRT module grant.
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000c',true);
 denied:=false;
 BEGIN
  PERFORM public.frt_sec14_auto_foreign_denials(foreign_ws);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SEC14 ungranted actor allowed'; END IF;

 PERFORM set_config('request.jwt.claim.sub','',true);
 denied:=false;
 BEGIN
  PERFORM public.frt_sec14_auto_foreign_denials(origin);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SEC14 unsigned actor allowed'; END IF;
END $probe$;
RESET ROLE;
DO $unchanged$
BEGIN
 IF (SELECT count(*) FROM public.frt_requests)<>2 OR
    (SELECT count(*) FROM public.frt_audit_logs)<>0 OR
    (SELECT count(*) FROM public.frt_liquidations)<>0 THEN
  RAISE EXCEPTION 'SEC14 automatic denial test changed finance data';
 END IF;
END
$unchanged$;
ROLLBACK;
