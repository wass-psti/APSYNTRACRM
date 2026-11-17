-- Disposable PG17 preparation and acceptance; NEVER production.
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $roles$;
CREATE FUNCTION public.is_platform_admin(p_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE TABLE public.fueltrans_memberships(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,
 client_code text,enabled boolean NOT NULL DEFAULT true,assigned_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active',PRIMARY KEY(workspace_id,user_id));
\ir ../cp-urm-fueltrans-workspace-role-candidate.sql
INSERT INTO public.profiles(id,email) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','crm@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','target@example.invalid'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','protected@example.invalid');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id)
 VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT auth.uid() AS actor, count(*) AS active_scope_rows
 FROM public.workspace_members w JOIN public.profiles p ON p.id=w.user_id
 WHERE w.workspace_id='11111111-1111-4111-8111-111111111111'
 AND w.user_id=auth.uid() AND w.active AND p.status='active';
DO $accept$
DECLARE
 w1 uuid:='11111111-1111-4111-8111-111111111111';
 w2 uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 protected_target uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 r jsonb;s jsonb;rev timestamptz;
BEGIN
 s:=public.apsyntra_role_fueltrans_workspace_snapshot(w1);
 IF jsonb_array_length(s->'assignments')<>0 THEN RAISE EXCEPTION 'Initial scope not empty'; END IF;
 r:=public.apsyntra_role_fueltrans_workspace_set(w1,target,'viewer',true,NULL);
 rev:=(r->>'currentRevision')::timestamptz;
 IF r->>'effective'<>'true' OR r#>>'{after,role}'<>'viewer' THEN RAISE EXCEPTION 'Assign receipt invalid'; END IF;
 s:=public.apsyntra_role_fueltrans_workspace_snapshot(w1);
 IF s#>>'{assignments,0,role}'<>'viewer' THEN RAISE EXCEPTION 'Readback mismatch'; END IF;
 r:=public.apsyntra_role_fueltrans_workspace_set(w1,target,'global_l1_support',true,rev);
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w1,target,'viewer',true,rev);
  RAISE EXCEPTION 'Stale write accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w1,actor,'admin',true,NULL);
  RAISE EXCEPTION 'Self mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w1,protected_target,'admin',true,NULL);
  RAISE EXCEPTION 'Protected mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_fueltrans_workspace_set(w2,target,'viewer',true,NULL);
  RAISE EXCEPTION 'Cross workspace mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.fueltrans_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(w2,target,'viewer',true,'active');
 r:=public.apsyntra_role_fueltrans_workspace_set(w1,target,
  'global_l1_support',false,(r->>'currentRevision')::timestamptz);
 IF r#>>'{after,enabled}'<>'false' THEN RAISE EXCEPTION 'Revoke failed'; END IF;
 IF (SELECT role FROM public.fueltrans_memberships WHERE workspace_id=w2 AND user_id=target)<>'viewer' THEN
  RAISE EXCEPTION 'Other workspace corrupted'; END IF;
 IF (SELECT count(*) FROM public.module_role_assignments WHERE module_id='fueltrans')<>0 THEN
  RAISE EXCEPTION 'Legacy global role modified'; END IF;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests WHERE payload->>'resourceId'='fueltrans')<>3 OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit WHERE detail->>'resourceId'='fueltrans' AND event='applied')<>3 THEN
  RAISE EXCEPTION 'Audit mismatch'; END IF;
 RAISE NOTICE 'CP-URM-FUELTRANS workspace isolation, reassignment, revocation and audit PASS';
END $accept$;
