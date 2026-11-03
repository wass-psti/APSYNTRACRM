-- CP-TT-GROUP01 synthetic PG17-only fixture. Load after bulk02 disposable setup.
\set ON_ERROR_STOP on
CREATE FUNCTION public.is_platform_admin(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor
 AND p.platform_role='admin_general_manager' AND p.status='active')
$$;
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','owner'),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','viewer');
INSERT INTO public.work_board_groups(id,board_id,title,position) VALUES
 ('60000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000003','Safe empty secondary',1),
 ('60000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000003','Archived secondary',2),
 ('60000000-0000-4000-8000-000000000009','30000000-0000-4000-8000-000000000003','Stale secondary',3);
INSERT INTO public.work_board_items(id,board_id,group_id,title,status,position,updated_by,archived_at)
VALUES
 ('40000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000008','Archived protected record','done',0,
  '20000000-0000-4000-8000-000000000001',now());
