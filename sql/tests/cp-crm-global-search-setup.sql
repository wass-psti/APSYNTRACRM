CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.work_boards(
 id uuid primary key,workspace_id uuid not null,name text not null,
 description text,status text not null
);
CREATE TABLE public.work_board_groups(
 id uuid primary key,board_id uuid not null,title text not null,position integer not null default 0
);
CREATE TABLE public.work_board_items(
 id uuid primary key,board_id uuid not null,group_id uuid,title text,notes text,status text,
 due_date date,archived_at timestamptz,updated_at timestamptz not null default now()
);
CREATE TABLE public.work_board_columns(
 id uuid primary key,board_id uuid not null,name text not null,position integer not null default 0,
 visible boolean not null default true
);
CREATE TABLE public.work_board_item_values(item_id uuid not null,column_id uuid not null,value jsonb);
CREATE TABLE public.test_allowed_board(board_id uuid primary key);
CREATE FUNCTION public.current_workspace_id(p_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN p_user_id=auth.uid() THEN '30000000-0000-4000-8000-000000000001'::uuid ELSE NULL END
$$;
CREATE FUNCTION public.work_board_access(p_board_id uuid,p_required text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT p_required='view' AND EXISTS(
  SELECT 1 FROM public.test_allowed_board WHERE board_id=p_board_id
 )
$$;
INSERT INTO public.work_boards VALUES
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Active Board','Active fixtures','active'),
 ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','Archived Board','Archived fixtures','archived'),
 ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','Trash Board','Must not be searchable','trashed'),
 ('10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','Foreign Board','Other workspace','active');
INSERT INTO public.test_allowed_board VALUES
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004');
INSERT INTO public.work_board_groups VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Tools',1),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Old Assets',1);
INSERT INTO public.work_board_items(id,board_id,group_id,title,notes,status,due_date) VALUES
 ('21000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Widget 100','Blue widget','working','2026-12-01'),
 ('21000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Archived old asset','legacy serial record','done',null),
 ('21000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003',null,'Trash secret','must not appear','todo',null),
 ('21000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004',null,'Foreign secret','must not appear','todo',null);
INSERT INTO public.work_board_items(id,board_id,group_id,title,notes,status,due_date) VALUES
 ('21000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Special 100% Asset','Literal wildcard fixture','todo','2026-12-02');
INSERT INTO public.work_board_columns VALUES
 ('22000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Serial Number',1,true),
 ('22000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Asset Tag',1,true);
INSERT INTO public.work_board_item_values VALUES
 ('21000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','"SERIAL-ARCHIVE-77"'::jsonb);
INSERT INTO public.work_board_item_values VALUES
 ('21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','"ASSET-100-AX"'::jsonb);
