-- CP-TEAMS-BOARD-INVITE-01: REVIEW CANDIDATE ONLY, NOT APPLIED.
-- Requires CP-TEAMS-01 candidate and independent signed/RLS approval.
-- Team viewer access becomes effective ONLY after the board authorization
-- inventory/allowed()/RLS has been reviewed to union team + direct access.
BEGIN;

CREATE FUNCTION public.apsyntra_board_team_invite_candidates(
 p_workspace_id uuid,p_board_id uuid,p_query text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $candidates$
DECLARE v_actor uuid:=auth.uid();v_revision bigint;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR length(coalesce(p_query,''))>120
  OR NOT EXISTS(SELECT 1 FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
   WHERE p.id=v_actor AND p.status='active'
    AND wm.workspace_id=p_workspace_id AND wm.active)
  OR NOT EXISTS(SELECT 1 FROM public.work_boards b
   WHERE b.id=p_board_id AND b.workspace_id=p_workspace_id
     AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL)
  OR NOT (
    public.apsyntra_team_is_system_admin(v_actor,p_workspace_id)
    OR EXISTS(SELECT 1 FROM public.work_board_members bm
       WHERE bm.board_id=p_board_id AND bm.user_id=v_actor AND bm.role='owner')
  )
 THEN RAISE EXCEPTION 'Signed board-owner permission required to search teams'
  USING ERRCODE='42501'; END IF;
 SELECT revision INTO v_revision FROM private.apsyntra_teams_revision
 WHERE workspace_id=p_workspace_id;
 IF v_revision IS NULL THEN RAISE EXCEPTION 'Teams configuration inactive'
  USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'contract','apsyntra-board-team-invite-v1','authorized',true,
  'workspaceId',p_workspace_id,'boardId',p_board_id,'actorId',v_actor,
  'revision',v_revision,
  'rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'teamId',t.id,'name',t.name,
    'memberCount',(SELECT count(*) FROM public.apsyntra_team_members m
      JOIN public.workspace_members wm ON wm.user_id=m.user_id
       AND wm.workspace_id=p_workspace_id AND wm.active
      JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
      WHERE m.team_id=t.id),
    'hasAccess',EXISTS(SELECT 1 FROM public.apsyntra_team_content c
      WHERE c.team_id=t.id AND c.content_type='board' AND c.content_id=p_board_id)
  ) ORDER BY t.name)
  FROM public.apsyntra_teams t
  WHERE t.workspace_id=p_workspace_id
   AND (nullif(btrim(coalesce(p_query,'')),'') IS NULL
    OR position(lower(btrim(p_query)) in lower(t.name))>0)),'[]'::jsonb));
END;
$candidates$;
REVOKE ALL ON FUNCTION public.apsyntra_board_team_invite_candidates(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_board_team_invite_candidates(uuid,uuid,text)
 TO authenticated;

CREATE FUNCTION public.apsyntra_board_invite_team_viewer(
 p_workspace_id uuid,p_board_id uuid,p_team_id uuid,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $assign$
DECLARE v_actor uuid:=auth.uid();v_revision bigint;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR p_expected_revision IS NULL OR p_expected_revision<0
  OR NOT EXISTS(SELECT 1 FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
   WHERE p.id=v_actor AND p.status='active'
    AND wm.workspace_id=p_workspace_id AND wm.active)
  OR NOT EXISTS(SELECT 1 FROM public.work_boards b
   WHERE b.id=p_board_id AND b.workspace_id=p_workspace_id
    AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL)
  OR NOT (
   public.apsyntra_team_is_system_admin(v_actor,p_workspace_id)
   OR EXISTS(SELECT 1 FROM public.work_board_members bm
    WHERE bm.board_id=p_board_id AND bm.user_id=v_actor AND bm.role='owner')
  )
 THEN RAISE EXCEPTION 'Signed board-owner permission required to invite team'
   USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('apsyntra-teams'),hashtext(p_workspace_id::text));
 SELECT revision INTO v_revision FROM private.apsyntra_teams_revision
 WHERE workspace_id=p_workspace_id FOR UPDATE;
 IF v_revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale team directory; refresh invitation'
  USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.apsyntra_teams t
  WHERE t.id=p_team_id AND t.workspace_id=p_workspace_id)
 THEN RAISE EXCEPTION 'Team not found in signed workspace' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.apsyntra_team_content c
  WHERE c.team_id=p_team_id AND c.content_type='board' AND c.content_id=p_board_id)
 THEN RAISE EXCEPTION 'Team already has access to this board' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.apsyntra_team_content(
  team_id,content_type,content_id,access_level,assigned_by)
 VALUES(p_team_id,'board',p_board_id,'viewer',v_actor);
 UPDATE private.apsyntra_teams_revision
 SET revision=revision+1 WHERE workspace_id=p_workspace_id RETURNING revision INTO v_revision;
 INSERT INTO private.apsyntra_teams_audit_log(
  workspace_id,actor_id,action,target_type,target_id,metadata)
 VALUES(p_workspace_id,v_actor,'invite_team_to_board','team',p_team_id,
  jsonb_build_object('boardId',p_board_id,'accessLevel','viewer','revision',v_revision));
 RETURN jsonb_build_object('contract','apsyntra-board-team-invite-change-v1',
  'state','committed','actorId',v_actor,'workspaceId',p_workspace_id,
  'boardId',p_board_id,'teamId',p_team_id,'revision',v_revision);
END;
$assign$;
REVOKE ALL ON FUNCTION public.apsyntra_board_invite_team_viewer(uuid,uuid,uuid,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_board_invite_team_viewer(uuid,uuid,uuid,bigint)
 TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
