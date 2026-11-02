-- CP-TT-OT-02: self-contained disposable PG17 fixture. NEVER run on production.
-- Test roles are simulated; acceptance here is not genuine GoTrue user testing.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
END $$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(auth.jwt()->>'sub','')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated,anon;

CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 not_after timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON auth.sessions FROM PUBLIC,authenticated,anon;

CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,
 display_name text,
 status text NOT NULL,
 platform_role text NOT NULL
);
CREATE TABLE public.workspace_members(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 active boolean NOT NULL,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE public.work_boards(
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 name text NOT NULL,
 status text NOT NULL,
 archived_at timestamptz,
 trashed_at timestamptz
);
CREATE TABLE public.work_board_members(
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 role text NOT NULL,
 PRIMARY KEY(board_id,user_id)
);
CREATE TABLE public.module_role_assignments(
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 module_id text NOT NULL,
 enabled boolean NOT NULL,
 PRIMARY KEY(user_id,module_id)
);
CREATE TABLE public.apsyntra_role_bootstrap_identities(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id)
);
REVOKE ALL ON public.workspaces,public.profiles,public.workspace_members,
 public.work_boards,public.work_board_members,public.module_role_assignments,
 public.apsyntra_role_bootstrap_identities FROM PUBLIC,authenticated,anon;

CREATE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT wm.workspace_id FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.user_id=p_user_id AND wm.active AND p.status='active'
 ORDER BY wm.workspace_id LIMIT 1
$$;
CREATE FUNCTION public.has_module_access(p_module_id text,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.module_role_assignments m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.module_id=p_module_id
 AND m.enabled AND p.status='active'
 ) AND public.current_workspace_id(p_user_id) IS NOT NULL
$$;
CREATE FUNCTION public.work_board_access(p_board_id uuid,p_required text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_required='view' AND EXISTS(
 SELECT 1 FROM public.work_board_members bm
 JOIN public.work_boards b ON b.id=bm.board_id
 WHERE bm.board_id=p_board_id AND bm.user_id=auth.uid()
 AND b.workspace_id=public.current_workspace_id(auth.uid())
 AND bm.role IN ('owner','editor','viewer'))
$$;
CREATE FUNCTION public.apsyntra_role_is_bootstrap()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.apsyntra_role_bootstrap_identities bi
 JOIN public.profiles p ON p.id=bi.user_id
 WHERE bi.user_id=auth.uid() AND p.status='active'
 AND p.platform_role='admin_general_manager')
$$;

INSERT INTO public.workspaces(id) VALUES
 ('10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id,display_name,status,platform_role) VALUES
 ('10000000-0000-4000-8000-000000000011','Employee A','active','employee'),
 ('10000000-0000-4000-8000-000000000012','Employee B','active','employee'),
 ('10000000-0000-4000-8000-000000000013','Bootstrap Approver','active','admin_general_manager'),
 ('10000000-0000-4000-8000-000000000014','Ordinary Platform Manager','active','admin_general_manager'),
 ('20000000-0000-4000-8000-000000000015','Other Workspace','active','employee'),
 ('10000000-0000-4000-8000-000000000016','Revoked Employee','active','employee'),
 ('10000000-0000-4000-8000-000000000017','Inactive Employee','inactive','employee');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000012',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000013',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000014',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000016',true),
 ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000017',true),
 ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000015',true);
INSERT INTO public.work_boards(id,workspace_id,name,status) VALUES
 ('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001','TimeTracker Attendance','active'),
 ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000002','TimeTracker Attendance','active');
INSERT INTO public.work_board_members(board_id,user_id,role)
 SELECT '10000000-0000-4000-8000-000000000021',p.id,'viewer'
 FROM public.profiles p WHERE p.id::text LIKE '10000000-0000-4000-8000-00000000001%';
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000015','viewer');
INSERT INTO public.module_role_assignments(user_id,module_id,enabled)
 SELECT id,'time-tracker',true FROM public.profiles;
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id) VALUES
 ('10000000-0000-4000-8000-000000000013');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000011',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000012',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000013',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000014',now()+interval '2 hours'),
 ('20000000-0000-4000-8000-000000000035','20000000-0000-4000-8000-000000000015',now()+interval '2 hours'),
 ('10000000-0000-4000-8000-000000000037','10000000-0000-4000-8000-000000000017',now()+interval '2 hours');
COMMIT;
