-- CP-BOARD-COL01: completely disposable PostgreSQL 17 schema only.
\set ON_ERROR_STOP on
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY,email text NOT NULL UNIQUE,display_name text,
 platform_role text NOT NULL DEFAULT 'employee',status text NOT NULL DEFAULT 'active');
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES public.profiles,
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.work_boards(id uuid PRIMARY KEY,workspace_id uuid NOT NULL);
CREATE TABLE public.work_board_members(board_id uuid NOT NULL REFERENCES public.work_boards,
 user_id uuid NOT NULL REFERENCES public.profiles,role text NOT NULL,added_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(board_id,user_id));
CREATE TABLE public.apsyntra_crm_platform_roles(workspace_id uuid NOT NULL,user_id uuid NOT NULL,
 role text NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.work_board_items(id uuid PRIMARY KEY,board_id uuid NOT NULL REFERENCES public.work_boards,
 archived_at timestamptz);
CREATE TABLE public.work_board_item_updates(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 board_id uuid NOT NULL,item_id uuid NOT NULL,body text NOT NULL,created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.work_board_item_files(id uuid PRIMARY KEY,board_id uuid NOT NULL,
 item_id uuid NOT NULL,storage_path text NOT NULL,file_name text NOT NULL,mime_type text,
 size_bytes bigint NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.work_board_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 board_id uuid NOT NULL,actor_id uuid NOT NULL,event_type text NOT NULL,message text NOT NULL,
 entity_type text,entity_id text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_item_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_item_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_board_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT wm.workspace_id FROM public.workspace_members wm
 JOIN public.profiles p ON p.id=wm.user_id
 WHERE wm.user_id=p_user_id AND wm.active AND p.status='active'
 ORDER BY wm.created_at LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.apsyntra_crm_explicit_role(p_user uuid,p_workspace uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT a.role FROM public.apsyntra_crm_platform_roles a
 WHERE a.user_id=p_user AND a.workspace_id=p_workspace $$;
CREATE OR REPLACE FUNCTION public.wm_board_member_active(p_workspace_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 RETURN auth.uid() IS NOT NULL
  AND public.current_workspace_id(auth.uid())=p_workspace_id
  AND EXISTS(SELECT 1 FROM public.workspace_members m JOIN public.profiles p ON p.id=m.user_id
   WHERE m.workspace_id=p_workspace_id AND m.user_id=p_user_id AND m.active AND p.status='active');
END $$;
CREATE OR REPLACE FUNCTION public.work_board_access(p_board_id uuid,p_required text DEFAULT 'view')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE c uuid:=auth.uid();w uuid;r text;cap text;
BEGIN
 IF c IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c AND status='active') THEN RETURN false; END IF;
 SELECT workspace_id INTO w FROM public.work_boards WHERE id=p_board_id;
 IF w IS NULL OR w IS DISTINCT FROM public.current_workspace_id(c) OR p_required NOT IN ('view','edit','manage') THEN RETURN false; END IF;
 cap:=public.apsyntra_crm_explicit_role(c,w);
 IF cap='viewer' AND p_required IN('edit','manage') THEN RETURN false; END IF;
 IF cap IN('employee','supervisor') AND p_required='manage' THEN RETURN false; END IF;
 SELECT role INTO r FROM public.work_board_members WHERE board_id=p_board_id AND user_id=c;
 IF p_required='manage' THEN RETURN coalesce(r='owner',false); END IF;
 IF p_required='edit' THEN RETURN coalesce(r IN('owner','editor'),false); END IF;
 RETURN coalesce(r IN('owner','editor','viewer'),false);
END $$;
CREATE OR REPLACE FUNCTION public.work_board_log(
 p_board_id uuid,p_type text,p_message text,p_entity_type text,p_entity_id text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 INSERT INTO public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id,payload)
 VALUES(p_board_id,auth.uid(),p_type,p_message,p_entity_type,p_entity_id,p_payload);
END $$;
INSERT INTO public.profiles(id,email,display_name,platform_role,status) VALUES
 ('20000000-0000-4000-8000-000000000001','owner@example.test','Owner','admin_general_manager','active'),
 ('20000000-0000-4000-8000-000000000002','editor@example.test','Editor','employee','active'),
 ('20000000-0000-4000-8000-000000000003','viewer@example.test','Viewer','viewer','active'),
 ('20000000-0000-4000-8000-000000000004','foreign@example.test','Foreign','employee','active'),
 ('20000000-0000-4000-8000-000000000005','inactive@example.test','Inactive','employee','inactive');
INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',true),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005',false),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004',true);
INSERT INTO public.work_boards(id,workspace_id) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','editor'),
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','viewer'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','owner');
INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','viewer');
INSERT INTO public.work_board_items(id,board_id) VALUES
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');
INSERT INTO public.work_board_item_updates(board_id,item_id,body,created_by) VALUES
 ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Scoped item update','20000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','FOREIGN SECRET','20000000-0000-4000-8000-000000000004');
INSERT INTO public.work_board_item_files(id,board_id,item_id,storage_path,file_name,mime_type,size_bytes,created_by) VALUES
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001/test.pdf',
  'test.pdf','application/pdf',1024,'20000000-0000-4000-8000-000000000002'),
 ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002/foreign.pdf',
  'FOREIGN SECRET.pdf','application/pdf',1024,'20000000-0000-4000-8000-000000000004');
INSERT INTO public.work_board_events(board_id,actor_id,event_type,message,entity_type,entity_id) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','item.updated','First','item','40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','item.updated','Second','item','40000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','item.updated','FOREIGN SECRET','item','40000000-0000-4000-8000-000000000002');
