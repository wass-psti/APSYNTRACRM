-- CP-BOARD-GROUP-VIEW-01: per-user Board group expansion preferences.
-- Forward-only additive migration. Requires signed session and Board CONFIG01
-- session guard to be present; do not deploy without disposable signed acceptance.
BEGIN;
DO $dependency$
BEGIN
 IF to_regprocedure('private.wm_board_config_session_active()') IS NULL OR
    to_regprocedure('public.work_board_access(uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'Signed Board configuration/access prerequisites are missing'
    USING ERRCODE='42501';
 END IF;
END $dependency$;

CREATE TABLE public.wm_board_group_view_initialization(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 initialized_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 PRIMARY KEY(user_id,board_id)
);
CREATE TABLE public.wm_board_group_view_state(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES public.work_board_groups(id) ON DELETE CASCADE,
 collapsed boolean NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 PRIMARY KEY(user_id,board_id,group_id)
);
CREATE INDEX wm_board_group_view_state_board_idx
 ON public.wm_board_group_view_state(board_id,group_id);

ALTER TABLE public.wm_board_group_view_initialization ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wm_board_group_view_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wm_board_group_view_initialization FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.wm_board_group_view_state FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.wm_board_group_view_read(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $read$
DECLARE actor uuid:=auth.uid(); group_count int; first_visit boolean;
 workspace_id uuid; payload jsonb;
BEGIN
 IF actor IS NULL OR p_board_id IS NULL OR
    NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Board group preference view denied' USING ERRCODE='42501';
 END IF;
 SELECT b.workspace_id INTO workspace_id FROM public.work_boards b
  WHERE b.id=p_board_id AND b.status='active';
 IF workspace_id IS NULL THEN
  RAISE EXCEPTION 'Active Board unavailable' USING ERRCODE='42501';
 END IF;
 -- Serialize first-use defaults for the same signed actor and board. A new
 -- group added after initialization must always start expanded.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(actor::text||':'||p_board_id::text,0));
 SELECT NOT EXISTS(
  SELECT 1 FROM public.wm_board_group_view_initialization
   WHERE user_id=actor AND board_id=p_board_id) INTO first_visit;
 IF first_visit THEN
  INSERT INTO public.wm_board_group_view_initialization(user_id,board_id)
   VALUES(actor,p_board_id) ON CONFLICT DO NOTHING;
 END IF;
 SELECT count(*) INTO group_count FROM public.work_board_groups g
   WHERE g.board_id=p_board_id;
 WITH ordered AS (
  SELECT g.id,pg_catalog.row_number() OVER(ORDER BY g.position,g.id) AS ordinal
   FROM public.work_board_groups g WHERE g.board_id=p_board_id
 )
 INSERT INTO public.wm_board_group_view_state(user_id,board_id,group_id,collapsed)
 SELECT actor,p_board_id,o.id,(first_visit AND group_count>5 AND o.ordinal>1)
 FROM ordered o ON CONFLICT(user_id,board_id,group_id) DO NOTHING;
 SELECT pg_catalog.coalesce(
  pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'group_id',s.group_id::text,'collapsed',s.collapsed,'revision',s.revision)
    ORDER BY g.position,g.id),'[]'::jsonb)
 INTO payload
 FROM public.wm_board_group_view_state s
 JOIN public.work_board_groups g ON g.id=s.group_id AND g.board_id=s.board_id
 WHERE s.user_id=actor AND s.board_id=p_board_id;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id::text,'groups',payload);
END;
$read$;

CREATE FUNCTION public.wm_board_group_view_set(
 p_board_id uuid,p_group_id uuid,p_collapsed boolean,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $set$
DECLARE actor uuid:=auth.uid(); next_revision bigint;
BEGIN
 IF actor IS NULL OR p_board_id IS NULL OR p_group_id IS NULL OR
    p_collapsed IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1 OR
    NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') OR
    NOT EXISTS(SELECT 1 FROM public.work_board_groups g
      JOIN public.work_boards b ON b.id=g.board_id
      WHERE g.id=p_group_id AND g.board_id=p_board_id AND b.status='active') THEN
  RAISE EXCEPTION 'Board group preference mutation denied' USING ERRCODE='42501';
 END IF;
 UPDATE public.wm_board_group_view_state s
 SET collapsed=p_collapsed,revision=s.revision+1,updated_at=pg_catalog.clock_timestamp()
 WHERE s.user_id=actor AND s.board_id=p_board_id AND s.group_id=p_group_id
   AND s.revision=p_expected_revision RETURNING revision INTO next_revision;
 IF next_revision IS NULL THEN
  RAISE EXCEPTION 'Group preference changed in another session; refresh'
    USING ERRCODE='PT409';
 END IF;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id::text,
  'group_id',p_group_id::text,'collapsed',p_collapsed,'revision',next_revision);
END;
$set$;

CREATE FUNCTION public.wm_board_group_view_set_all(
 p_board_id uuid,p_collapsed boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $all$
DECLARE actor uuid:=auth.uid(); payload jsonb;
BEGIN
 IF actor IS NULL OR p_board_id IS NULL OR p_collapsed IS NULL OR
    NOT private.wm_board_config_session_active() OR
    NOT public.work_board_access(p_board_id,'view') THEN
  RAISE EXCEPTION 'Board group preference bulk mutation denied' USING ERRCODE='42501';
 END IF;
 PERFORM public.wm_board_group_view_read(p_board_id);
 UPDATE public.wm_board_group_view_state s
 SET collapsed=p_collapsed,revision=s.revision+1,updated_at=pg_catalog.clock_timestamp()
 WHERE s.user_id=actor AND s.board_id=p_board_id AND EXISTS(
  SELECT 1 FROM public.work_board_groups g WHERE g.id=s.group_id AND g.board_id=p_board_id);
 SELECT pg_catalog.coalesce(
  pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'group_id',s.group_id::text,'collapsed',s.collapsed,'revision',s.revision)
   ORDER BY g.position,g.id),'[]'::jsonb)
 INTO payload FROM public.wm_board_group_view_state s
 JOIN public.work_board_groups g ON g.id=s.group_id AND g.board_id=p_board_id
 WHERE s.user_id=actor AND s.board_id=p_board_id;
 RETURN pg_catalog.jsonb_build_object('board_id',p_board_id::text,'groups',payload);
END;
$all$;

REVOKE ALL ON FUNCTION public.wm_board_group_view_read(uuid)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_board_group_view_set(uuid,uuid,boolean,bigint)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.wm_board_group_view_set_all(uuid,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wm_board_group_view_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_board_group_view_set(uuid,uuid,boolean,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_board_group_view_set_all(uuid,boolean) TO authenticated;
COMMIT;
