-- CP-TT-GROUP01: STAGED ONLY. Do not apply to production without separate
-- explicit schema/function/grant authorization and independent security review.
-- Narrowly extends *group deletion* for TimeTracker Attendance's empty nonprimary
-- groups. Never weakens wm_board_group_cas or regrants wm_delete_board_group.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.wm_managed_board_delete_empty_group(uuid,uuid,timestamp with time zone,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Managed empty-group RPC already exists; review before replacing' USING ERRCODE='42501';
 END IF;
 IF to_regprocedure('private.wm_board_config_session_active()') IS NULL
    OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
    OR to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Required signed session and authorization helpers missing' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.work_board_items'::regclass
    AND confrelid='public.work_board_groups'::regclass
    AND confdeltype='c'
 ) OR EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE contype='f' AND confrelid='public.work_board_groups'::regclass
    AND conrelid<>'public.work_board_items'::regclass
 ) THEN
  RAISE EXCEPTION 'Group foreign-key dependencies changed; independent review required' USING ERRCODE='42501';
 END IF;
END $preflight$;

CREATE FUNCTION public.wm_managed_board_delete_empty_group(
 p_board_id uuid,p_group_id uuid,p_expected_updated_at timestamptz,
 p_confirmation_title text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $managed_group$
DECLARE
 actor uuid:=auth.uid();
 b public.work_boards%ROWTYPE;
 grp public.work_board_groups%ROWTYPE;
 group_total integer;
BEGIN
 IF actor IS NULL
    OR NOT private.wm_board_config_session_active()
    OR NOT public.is_platform_admin(actor)
    OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'Signed platform administrator and board manager access required'
    USING ERRCODE='42501';
 END IF;
 IF p_group_id IS NULL OR p_expected_updated_at IS NULL
    OR p_confirmation_title IS NULL THEN
  RAISE EXCEPTION 'Group, revision, and confirmation are required' USING ERRCODE='22023';
 END IF;

 -- Matches the existing board item creation/update lock order.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_board_id::text,0));
 SELECT * INTO b FROM public.work_boards WHERE id=p_board_id FOR UPDATE;
 IF b.id IS NULL OR b.status<>'active'
    OR b.name<>'TimeTracker Attendance'
    OR b.description NOT LIKE '[APSYNTRA:MODULE:timetracker:v1]%'
    OR NOT public.work_board_access(p_board_id,'manage') THEN
  RAISE EXCEPTION 'Only the protected TimeTracker Attendance board is eligible'
   USING ERRCODE='42501';
 END IF;

 SELECT * INTO grp FROM public.work_board_groups
  WHERE id=p_group_id AND board_id=b.id FOR UPDATE;
 IF grp.id IS NULL THEN
  RAISE EXCEPTION 'Group does not belong to the signed board' USING ERRCODE='42501';
 END IF;
 IF grp.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Group revision changed; reload before deleting' USING ERRCODE='40001';
 END IF;
 IF grp.position<=0 OR grp.title IS DISTINCT FROM p_confirmation_title THEN
  RAISE EXCEPTION 'Primary group is protected or confirmation mismatched' USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO group_total FROM public.work_board_groups WHERE board_id=b.id;
 IF group_total<=1 THEN
  RAISE EXCEPTION 'The final group is protected' USING ERRCODE='23503';
 END IF;

 -- Includes archived items, projections in work_board_items, and all title states.
 IF EXISTS (
  SELECT 1 FROM public.work_board_items i
   WHERE i.board_id=b.id AND i.group_id=grp.id
 ) THEN
  RAISE EXCEPTION 'The group contains records; deletion denied' USING ERRCODE='23503';
 END IF;

 DELETE FROM public.work_board_groups WHERE id=grp.id AND board_id=b.id;
 UPDATE public.work_board_groups SET position=position-1,
   updated_at=pg_catalog.clock_timestamp()
  WHERE board_id=b.id AND position>grp.position;
 UPDATE public.work_boards SET updated_by=actor,
   updated_at=pg_catalog.clock_timestamp() WHERE id=b.id;
 PERFORM public.work_board_log(b.id,'group.deleted_empty',
  'Empty TimeTracker group deleted by signed platform administrator',
  'group',grp.id::text,
  pg_catalog.jsonb_build_object('title',grp.title,'position',grp.position,
    'item_count',0,'controlled_protected_board',true));

 RETURN pg_catalog.jsonb_build_object(
  'boardId',b.id::text,'groupId',grp.id::text,
  'action','delete_empty','updatedAt',NULL,'deleted',true
 );
END
$managed_group$;

REVOKE ALL ON FUNCTION public.wm_managed_board_delete_empty_group(
 uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wm_managed_board_delete_empty_group(
 uuid,uuid,timestamptz,text) TO authenticated;
-- Retain the explicit deny on legacy cascading delete.
REVOKE ALL ON FUNCTION public.wm_delete_board_group(uuid)
 FROM PUBLIC,anon,authenticated;
DO $verify$
BEGIN
 IF has_function_privilege('anon',
  'public.wm_managed_board_delete_empty_group(uuid,uuid,timestamp with time zone,text)',
  'EXECUTE')
 OR has_function_privilege('authenticated',
  'public.wm_delete_board_group(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'Unsafe managed group grant' USING ERRCODE='42501';
 END IF;
END $verify$;
COMMIT;
