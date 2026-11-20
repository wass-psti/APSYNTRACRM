-- CP-SYSADMIN-01: Explicit global System Admin role, REVIEW CANDIDATE ONLY.
-- NOT APPLIED. Do not add this to supabase/migrations until the live signed
-- authentication, cross-domain permissions and recovery reviews have passed.
-- In particular, an IT department assignment grants *zero* authority.
BEGIN;

DO $requirements$
BEGIN
 IF to_regclass('public.apsyntra_role_bootstrap_identities') IS NULL
 OR to_regprocedure('public.apsyntra_role_is_bootstrap()') IS NULL
 OR to_regprocedure('public.apsyntra_role_is_admin()') IS NULL
 OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regclass('private.apsyntra_system_admin_assignments') IS NOT NULL
 OR to_regclass('private.apsyntra_system_admin_events') IS NOT NULL
 THEN
   RAISE EXCEPTION 'System Admin production prerequisites or schema collision'
     USING ERRCODE='42501';
 END IF;
END;
$requirements$;

-- A global, explicit assignment is not a CRM role override, platform_role,
-- department, TimeTracker module role or board membership. No rows are seeded.
CREATE TABLE private.apsyntra_system_admin_assignments (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 designation text NOT NULL CHECK(designation IN ('trusted_it','general_manager')),
 granted_by uuid NOT NULL REFERENCES public.profiles(id),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_by uuid REFERENCES public.profiles(id),
 revoked_at timestamptz,
 revision bigint NOT NULL CHECK(revision>0)
);
ALTER TABLE private.apsyntra_system_admin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.apsyntra_system_admin_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.apsyntra_system_admin_assignments FROM PUBLIC,anon,authenticated;

CREATE TABLE private.apsyntra_system_admin_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 target_user_id uuid NOT NULL REFERENCES public.profiles(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 operation text NOT NULL CHECK(operation IN ('grant','revoke')),
 designation text NOT NULL CHECK(designation IN ('trusted_it','general_manager')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 12 AND 500),
 revision bigint NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.apsyntra_system_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.apsyntra_system_admin_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.apsyntra_system_admin_events FROM PUBLIC,anon,authenticated;

-- Defense in depth: even a privileged database migration must not silently
-- rewrite/delete an already committed System Admin audit event.
CREATE FUNCTION private.apsyntra_system_admin_event_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $immutable$
BEGIN
 RAISE EXCEPTION 'System Admin audit events are append only' USING ERRCODE='42501';
END;
$immutable$;
CREATE TRIGGER system_admin_event_append_only
 BEFORE UPDATE OR DELETE ON private.apsyntra_system_admin_events
 FOR EACH ROW EXECUTE FUNCTION private.apsyntra_system_admin_event_immutable();
REVOKE ALL ON FUNCTION private.apsyntra_system_admin_event_immutable()
 FROM PUBLIC,anon,authenticated;

-- This predicate is self-only and checks a genuinely live GoTrue session.
-- A title, department, stale browser state or client-side claim cannot grant it.
CREATE FUNCTION public.apsyntra_system_admin_current()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $check$
 SELECT auth.uid() IS NOT NULL
 AND private.ws01_signed_actor_session() IS NOT NULL
 AND EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN private.apsyntra_system_admin_assignments a ON a.user_id=p.id
  WHERE p.id=auth.uid() AND p.status='active' AND a.revoked_at IS NULL
 )
 AND EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.user_id=auth.uid() AND m.active
   AND m.workspace_id=public.current_workspace_id(auth.uid())
 );
$check$;
REVOKE ALL ON FUNCTION public.apsyntra_system_admin_current()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_system_admin_current()
 TO authenticated;

-- CRM Administrator access inherits the explicit System Admin assignment,
-- only within the actor's active workspace. Does NOT override financial,
-- HR, Storage, module, or cross-workspace authorization automatically.
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $admin$
 SELECT public.apsyntra_system_admin_current() OR EXISTS(
  SELECT 1 FROM public.profiles p
  JOIN public.workspace_members wm ON wm.user_id=p.id
  WHERE p.id=auth.uid() AND p.status='active' AND wm.active IS TRUE
   AND wm.workspace_id=public.current_workspace_id(p.id)
   AND public.apsyntra_crm_effective_role(p.id,wm.workspace_id)='admin'
 );
$admin$;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_admin()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_admin()
 TO authenticated;

-- A CRM administrator may READ system-admin status for users in their current
-- workspace, but only an existing System Admin or protected bootstrap actor
-- may grant/revoke it. No arbitrary user/email search or foreign membership.
CREATE FUNCTION public.apsyntra_system_admin_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $snapshot$
DECLARE v_actor uuid:=auth.uid(); v_can_manage boolean;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
 OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
 OR NOT public.apsyntra_role_is_admin()
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members m
   WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active)
 THEN RAISE EXCEPTION 'Signed CRM administrator required'
  USING ERRCODE='42501'; END IF;
 v_can_manage:=public.apsyntra_system_admin_current()
   OR public.apsyntra_role_is_bootstrap();
 RETURN jsonb_build_object(
  'contract','apsyntra-system-admin-v1',
  'workspaceId',p_workspace_id,
  'actorId',v_actor,
  'authorized',true,
  'canManage',v_can_manage,
  'rows',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'userId',p.id,
    'active',coalesce(a.revoked_at IS NULL AND a.user_id IS NOT NULL,false),
    'designation',a.designation,
    'revision',coalesce(a.revision,0),
    'grantedAt',a.granted_at
   ) ORDER BY p.id)
   FROM public.workspace_members m
   JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
   LEFT JOIN private.apsyntra_system_admin_assignments a ON a.user_id=p.id
   WHERE m.workspace_id=p_workspace_id AND m.active
  ),'[]'::jsonb));
END;
$snapshot$;
REVOKE ALL ON FUNCTION public.apsyntra_system_admin_snapshot(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_system_admin_snapshot(uuid)
 TO authenticated;

-- Always serialized and audited. No self-promotion, department automation,
-- blind target update, bootstrap demotion, last-admin lockout, or cross-tenant
-- authority. The bootstrap identity can explicitly seed the first System Admin;
-- the installation intentionally seeds NONE.
CREATE FUNCTION public.apsyntra_system_admin_change(
 p_workspace_id uuid,
 p_target_user_id uuid,
 p_action text,
 p_designation text,
 p_reason text,
 p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $change$
DECLARE
 v_actor uuid:=auth.uid();
 v_row private.apsyntra_system_admin_assignments%ROWTYPE;
 v_new_revision bigint;
 v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
 OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
 OR NOT EXISTS(SELECT 1 FROM public.workspace_members m
   WHERE m.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.active)
 OR NOT (public.apsyntra_system_admin_current()
   OR public.apsyntra_role_is_bootstrap())
 THEN RAISE EXCEPTION 'System Admin or bootstrap authority required'
   USING ERRCODE='42501'; END IF;
 IF p_target_user_id IS NULL OR p_target_user_id=v_actor
 OR p_action IS NULL OR p_action NOT IN ('grant','revoke')
 OR p_designation IS NULL OR p_designation NOT IN ('trusted_it','general_manager')
 OR p_expected_revision IS NULL OR p_expected_revision<0
 OR length(v_reason)<12 OR length(v_reason)>500
 THEN RAISE EXCEPTION 'Invalid or self-directed System Admin change'
   USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p
  JOIN public.workspace_members m ON m.user_id=p.id
  WHERE p.id=p_target_user_id AND p.status='active'
   AND m.workspace_id=p_workspace_id AND m.active)
 THEN RAISE EXCEPTION 'Target is not an active member of this workspace'
  USING ERRCODE='42501'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(987654321);
 SELECT * INTO v_row FROM private.apsyntra_system_admin_assignments
 WHERE user_id=p_target_user_id FOR UPDATE;
 IF coalesce(v_row.revision,0) IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale System Admin assignment'
  USING ERRCODE='PT409'; END IF;
 IF p_action='grant' AND v_row.user_id IS NOT NULL AND v_row.revoked_at IS NULL
 THEN RAISE EXCEPTION 'System Admin already assigned'
  USING ERRCODE='PT409'; END IF;
 IF p_action='revoke' THEN
  IF v_row.user_id IS NULL OR v_row.revoked_at IS NOT NULL
  THEN RAISE EXCEPTION 'System Admin assignment not active'
   USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
    WHERE b.user_id=p_target_user_id)
  THEN RAISE EXCEPTION 'Bootstrap identity is protected'
   USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM private.apsyntra_system_admin_assignments a
      JOIN public.profiles p ON p.id=a.user_id AND p.status='active'
      WHERE a.revoked_at IS NULL)<=1
  THEN RAISE EXCEPTION 'Last System Admin cannot be revoked'
   USING ERRCODE='42501'; END IF;
  IF v_row.designation IS DISTINCT FROM p_designation
  THEN RAISE EXCEPTION 'Stale System Admin designation'
   USING ERRCODE='PT409'; END IF;
 END IF;
 v_new_revision:=coalesce(v_row.revision,0)+1;
 IF p_action='grant' THEN
  INSERT INTO private.apsyntra_system_admin_assignments
   (user_id,designation,granted_by,granted_at,revoked_by,revoked_at,revision)
  VALUES(p_target_user_id,p_designation,v_actor,clock_timestamp(),NULL,NULL,v_new_revision)
  ON CONFLICT(user_id) DO UPDATE
   SET designation=excluded.designation,granted_by=excluded.granted_by,
       granted_at=excluded.granted_at,revoked_by=NULL,revoked_at=NULL,
       revision=v_new_revision;
 ELSE
  UPDATE private.apsyntra_system_admin_assignments
   SET revoked_by=v_actor,revoked_at=clock_timestamp(),revision=v_new_revision
  WHERE user_id=p_target_user_id;
 END IF;
 INSERT INTO private.apsyntra_system_admin_events
  (actor_id,target_user_id,workspace_id,operation,designation,reason,revision)
 VALUES(v_actor,p_target_user_id,p_workspace_id,p_action,p_designation,
   v_reason,v_new_revision);
 RETURN jsonb_build_object('state','committed','workspaceId',p_workspace_id,
  'targetUserId',p_target_user_id,'action',p_action,'revision',v_new_revision,
  'active',p_action='grant');
END;
$change$;
REVOKE ALL ON FUNCTION public.apsyntra_system_admin_change(
 uuid,uuid,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_system_admin_change(
 uuid,uuid,text,text,text,bigint) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
