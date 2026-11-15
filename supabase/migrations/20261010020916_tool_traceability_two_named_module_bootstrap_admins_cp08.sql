DO $bootstrap$
DECLARE v_workspace uuid:='00000000-0000-4000-8000-000000000001'::uuid;v_count integer;
BEGIN
 SELECT count(*) INTO v_count
 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 JOIN public.workspace_members w ON w.workspace_id=v_workspace AND w.user_id=u.id
 WHERE lower(u.email) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
  AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND p.status='active' AND w.active;
 IF v_count<>2 THEN RAISE EXCEPTION 'Expected exactly two verified active named bootstrap administrators, got %',v_count;END IF;
 INSERT INTO public.tool_traceability_memberships(workspace_id,user_id,role,enabled,status,assigned_by)
 SELECT v_workspace,u.id,'ADMIN',true,'active',NULL::uuid FROM auth.users u
 WHERE lower(u.email) IN ('lmsenagan@watchdogautomation.com.ph','asenagan@watchdogautomation.com.ph')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role='ADMIN',enabled=true,status='active',updated_at=now();
END;$bootstrap$;;
