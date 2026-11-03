-- CP-BOARD-BULK02 disposable fixture; run after collab01-disposable-setup and menu01-disposable-setup.
\set ON_ERROR_STOP on
CREATE TABLE public.work_board_groups(
 id uuid PRIMARY KEY,board_id uuid NOT NULL REFERENCES public.work_boards(id),
 title text NOT NULL,position integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.work_board_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_groups FROM PUBLIC,anon,authenticated;
ALTER TABLE public.work_board_items
 ADD COLUMN group_id uuid,
 ADD COLUMN title text NOT NULL DEFAULT 'Untitled',
 ADD COLUMN status text,
 ADD COLUMN position integer NOT NULL DEFAULT 0,
 ADD COLUMN updated_by uuid,
 ADD COLUMN created_by uuid,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE public.work_board_columns(
 id uuid PRIMARY KEY,board_id uuid NOT NULL REFERENCES public.work_boards(id),
 system_key text,data_type text,config jsonb NOT NULL DEFAULT '{}'::jsonb,
 position integer NOT NULL DEFAULT 0);
ALTER TABLE public.work_board_columns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_board_columns FROM PUBLIC,anon,authenticated;
INSERT INTO public.work_board_groups(id,board_id,title,position) VALUES
 ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Main group',0),
 ('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','Secondary group',1),
 ('60000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','Empty group',2),
 ('60000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','Foreign group',0),
 ('60000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000003','TimeTracker group',0),
 ('60000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000004','QA group',0);
UPDATE public.work_board_items SET group_id='60000000-0000-4000-8000-000000000001',
 title='Legacy item',status='working',updated_by='20000000-0000-4000-8000-000000000001'
 WHERE board_id='30000000-0000-4000-8000-000000000001';
UPDATE public.work_board_items SET group_id='60000000-0000-4000-8000-000000000004',
 title='Foreign item',status='done',updated_by='20000000-0000-4000-8000-000000000004'
 WHERE board_id='30000000-0000-4000-8000-000000000002';
ALTER TABLE public.work_board_items ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.work_board_items ADD CONSTRAINT work_board_items_group_id_fkey
 FOREIGN KEY(group_id) REFERENCES public.work_board_groups(id) ON DELETE CASCADE;
INSERT INTO public.work_board_items(id,board_id,group_id,title,status,position,updated_by) VALUES
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000001','Second active item','working',1,'20000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000002','Archived item','done',0,'20000000-0000-4000-8000-000000000001');
UPDATE public.work_board_items SET archived_at=now()-interval '1 day'
 WHERE id='40000000-0000-4000-8000-000000000004';
INSERT INTO public.work_board_columns(id,board_id,system_key,data_type,config) VALUES
 ('80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  'status','status','{"labels":[{"id":"working","active":true},{"id":"done","active":true},{"id":"blocked","active":false}]}'::jsonb);
CREATE TABLE private.wm_board_protected_ids(board_id uuid PRIMARY KEY,reason text);
INSERT INTO private.wm_board_protected_ids VALUES
 ('30000000-0000-4000-8000-000000000003','application_contract'),
 ('30000000-0000-4000-8000-000000000004','platform_quality_assurance');
CREATE FUNCTION private.wm_board_is_protected(p_board_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $$ SELECT EXISTS(SELECT 1 FROM private.wm_board_protected_ids WHERE board_id=p_board_id) $$;
REVOKE ALL ON FUNCTION private.wm_board_is_protected(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.wm_delete_board_group(p_group_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $$ BEGIN DELETE FROM public.work_board_groups WHERE id=p_group_id; END $$;
GRANT EXECUTE ON FUNCTION public.wm_delete_board_group(uuid) TO authenticated;
CREATE FUNCTION public.wm_set_board_item_archived(p_item_id uuid,p_archived boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $arch$
DECLARE bid uuid;i public.work_board_items%rowtype; target int;
BEGIN
 SELECT board_id INTO bid FROM public.work_board_items WHERE id=p_item_id;
 IF bid IS NULL OR NOT public.work_board_access(bid,'edit') THEN
  RAISE EXCEPTION 'Board edit access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(bid::text,0));
 SELECT * INTO i FROM public.work_board_items WHERE id=p_item_id AND board_id=bid FOR UPDATE;
 IF i.id IS NULL OR NOT public.work_board_access(bid,'edit') THEN
  RAISE EXCEPTION 'Board edit access denied' USING ERRCODE='42501'; END IF;
 IF p_archived AND i.archived_at IS NOT NULL OR NOT p_archived AND i.archived_at IS NULL THEN RETURN; END IF;
 IF p_archived THEN
  UPDATE public.work_board_items SET archived_at=now(),updated_by=auth.uid(),updated_at=now() WHERE id=i.id;
  UPDATE public.work_board_items SET position=position-1,updated_at=now()
   WHERE board_id=bid AND group_id=i.group_id AND archived_at IS NULL AND id<>i.id AND position>i.position;
 ELSE
  SELECT count(*) INTO target FROM public.work_board_items
   WHERE board_id=bid AND group_id=i.group_id AND archived_at IS NULL AND id<>i.id;
  UPDATE public.work_board_items SET archived_at=NULL,position=target,updated_by=auth.uid(),updated_at=now() WHERE id=i.id;
 END IF;
 UPDATE public.work_boards SET updated_at=now(),updated_by=auth.uid() WHERE id=bid;
 PERFORM public.work_board_log(bid,'item.archived','Item archived','item',i.id::text,'{}'::jsonb);
END $arch$;
REVOKE ALL ON FUNCTION public.wm_set_board_item_archived(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_set_board_item_archived(uuid,boolean) TO authenticated;
