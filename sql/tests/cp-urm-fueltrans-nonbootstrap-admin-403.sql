\set ON_ERROR_STOP on
-- Runs after original FuelTrans disposable setup and role acceptance.
-- Simulate the inherited administrator label on a *nonbootstrap* target.
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT p_user_id='55555555-5555-4555-8555-555555555555'::uuid $$;
INSERT INTO public.profiles(id,email,status)
 VALUES('55555555-5555-4555-8555-555555555555','inherited-admin@example.invalid','active')
 ON CONFLICT(id) DO NOTHING;
INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES('11111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555',true)
 ON CONFLICT (workspace_id,user_id) DO UPDATE SET active=true;
DO $regression$
DECLARE w uuid:='11111111-1111-4111-8111-111111111111';
        target uuid:='55555555-5555-4555-8555-555555555555';
BEGIN
 -- The existing RPC denies an ordinary editable target solely because the
 -- inherited platform_role looks administrative. This is the reproduced bug.
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w,target,'viewer',true,NULL);
  RAISE EXCEPTION 'Expected legacy 403 did not occur';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $regression$;
\ir ../../supabase/migrations/20261118040000_cp_urm_fueltrans_nonbootstrap_admin_target.sql
DO $accepted$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 other uuid:='22222222-2222-4222-8222-222222222222';
 target uuid:='55555555-5555-4555-8555-555555555555';
 bootstrap uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 r jsonb;rev timestamptz;s jsonb;
BEGIN
 -- A nonbootstrap inherited CRM Admin can receive a workspace role.
 r:=public.apsyntra_role_fueltrans_workspace_set(w,target,'viewer',true,NULL);
 IF r->>'effective'<>'true' OR r#>>'{after,role}'<>'viewer' OR
  r#>>'{after,enabled}'<>'true' THEN
  RAISE EXCEPTION 'Nonbootstrap admin assignment failed: %',r; END IF;
 rev:=(r->>'currentRevision')::timestamptz;
 s:=public.apsyntra_role_fueltrans_workspace_snapshot(w);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'assignments') a
   WHERE a->>'userId'=target::text AND a->>'role'='viewer' AND a->>'enabled'='true')
 THEN RAISE EXCEPTION 'Authoritative source readback missing'; END IF;
 -- Optimistic revision guard still rejects a stale write.
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w,target,'admin',true,NULL);
  RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 r:=public.apsyntra_role_fueltrans_workspace_set(w,target,'viewer',false,rev);
 IF r#>>'{after,enabled}'<>'false' THEN RAISE EXCEPTION 'Revocation failed'; END IF;
 -- The exact protected bootstrap identity remains immutable.
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w,bootstrap,'viewer',true,NULL);
  RAISE EXCEPTION 'Protected bootstrap changed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Actor cannot modify their own roles.
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w,auth.uid(),'viewer',true,NULL);
  RAISE EXCEPTION 'Self edit succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Workspace guard persists independently of inherited administrator labels.
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(other,target,'viewer',true,NULL);
  RAISE EXCEPTION 'Cross-workspace write succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests
     WHERE payload->>'resourceId'='fueltrans'
       AND payload->>'targetUserId'=target::text)<>2 THEN
  RAISE EXCEPTION 'Role write/revoke audit receipts missing'; END IF;
END $accepted$;
SELECT 'CP_URM_FUELTRANS_NONBOOTSTRAP_ADMIN_403_PASS' AS result;
