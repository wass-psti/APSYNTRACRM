-- BS11: exact-board existing-member viewer access, PRIVATE, REVIEW ONLY.
-- This candidate does NOT run in production, activate BS09 or change RLS.
-- Separate signed-user, foreign-workspace, Storage and domain acceptance required.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.work_board_members') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
 OR to_regprocedure('private.bs11_change_board_access(uuid,uuid,uuid,text,uuid)') IS NOT NULL
 OR to_regclass('private.bs11_access_requests') IS NOT NULL
 THEN RAISE EXCEPTION 'BS11 exact board authorization prerequisite or collision'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE private.bs11_access_requests(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 board_id uuid NOT NULL REFERENCES public.work_boards(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 target_user_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK(action IN ('grant','revoke')),
 role text NOT NULL CHECK(role='viewer'),
 committed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,board_id,actor_id,request_id)
);
ALTER TABLE private.bs11_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.bs11_access_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.bs11_change_board_access(
 p_workspace uuid,p_board uuid,p_member uuid,p_action text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $change$
DECLARE
 v_actor uuid:=auth.uid();v_session uuid;
 v_old_role text;v_existing private.bs11_access_requests%ROWTYPE;
BEGIN
 v_session:=private.ws01_signed_actor_session();
 IF v_actor IS NULL OR v_session IS NULL OR p_workspace IS NULL OR
    p_board IS NULL OR p_member IS NULL OR p_request IS NULL OR
    p_action IS NULL OR p_action NOT IN ('grant','revoke') OR
    public.current_workspace_id(v_actor) IS DISTINCT FROM p_workspace OR
    NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.status='active') OR
    NOT EXISTS(SELECT 1 FROM public.work_boards b
      WHERE b.id=p_board AND b.workspace_id=p_workspace AND b.status='active'
        AND b.archived_at IS NULL) OR
    NOT public.work_board_access(p_board,'manage')
 THEN RAISE EXCEPTION 'Signed board manager required' USING ERRCODE='42501'; END IF;
 -- Serialize transactions for one board, including competing grants/revokes.
 PERFORM 1 FROM public.work_boards b WHERE b.id=p_board FOR UPDATE;
 SELECT * INTO v_existing FROM private.bs11_access_requests r
  WHERE r.workspace_id=p_workspace AND r.board_id=p_board
   AND r.actor_id=v_actor AND r.request_id=p_request;
 IF FOUND THEN
  IF v_existing.target_user_id IS DISTINCT FROM p_member OR
     v_existing.action IS DISTINCT FROM p_action OR
     v_existing.role IS DISTINCT FROM 'viewer'
  THEN RAISE EXCEPTION 'Request id used for a different board operation'
   USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('state','committed','workspaceId',p_workspace,
   'boardId',p_board,'requestId',p_request,'idempotent',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspace_members m
   JOIN public.profiles p ON p.id=m.user_id
   WHERE m.workspace_id=p_workspace AND m.user_id=p_member
    AND m.active IS TRUE AND p.status='active')
 THEN RAISE EXCEPTION 'Verified workspace member required' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO v_old_role FROM public.work_board_members m
  WHERE m.board_id=p_board AND m.user_id=p_member FOR UPDATE;
 IF v_old_role='owner' THEN
  RAISE EXCEPTION 'Board owner cannot be modified' USING ERRCODE='42501'; END IF;
 IF p_action='grant' THEN
  -- Never elevate an editor or owner or overwrite a different role.
  IF v_old_role IS NOT NULL AND v_old_role<>'viewer' THEN
   RAISE EXCEPTION 'Role elevation or overwrite denied' USING ERRCODE='42501'; END IF;
  INSERT INTO public.work_board_members(board_id,user_id,role,added_by)
   VALUES(p_board,p_member,'viewer',v_actor)
  ON CONFLICT(board_id,user_id) DO NOTHING;
 ELSE
  IF v_old_role IS DISTINCT FROM 'viewer' THEN
   RAISE EXCEPTION 'Only exact viewer assignments can be revoked'
    USING ERRCODE='42501'; END IF;
  DELETE FROM public.work_board_members
   WHERE board_id=p_board AND user_id=p_member AND role='viewer';
 END IF;
 INSERT INTO private.bs11_access_requests(
  workspace_id,board_id,actor_id,request_id,target_user_id,action,role
 ) VALUES(p_workspace,p_board,v_actor,p_request,p_member,p_action,'viewer');
 PERFORM public.work_board_log(p_board,
  CASE WHEN p_action='grant' THEN 'member.added' ELSE 'member.removed' END,
  'Board viewer assignment updated','member',p_member::text,
  jsonb_build_object('role','viewer','action',p_action,'request_id',p_request));
 RETURN jsonb_build_object('state','committed','workspaceId',p_workspace,
  'boardId',p_board,'requestId',p_request,'idempotent',false);
END $change$;
REVOKE ALL ON FUNCTION private.bs11_change_board_access(uuid,uuid,uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
-- No direct grants, no widening of views/Storage/module RPCs, no enable.
COMMIT;
