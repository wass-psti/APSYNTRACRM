-- BS09: candidate workspace groups and exact-board Viewer grants.
-- REVIEW / DISPOSABLE ENVIRONMENT ONLY. DO NOT DEPLOY to shared Supabase
-- until owner/IT approves live RLS, onboarding-trigger, board RPC, rollback
-- and positive/negative tests. This candidate never rewrites existing ACLs.
BEGIN;

DO $guard$
BEGIN
 IF to_regclass('public.workspaces') IS NULL
    OR to_regclass('public.workspace_members') IS NULL
    OR to_regclass('public.work_boards') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('private.ws01_member_roles') IS NULL
    OR to_regclass('private.bs09_groups') IS NOT NULL
    OR to_regclass('private.bs09_flags') IS NOT NULL
    OR to_regprocedure('private.bs09_group_allows_board(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'BS09 prerequisites missing or migration collision'
 USING ERRCODE='42501'; END IF;
END $guard$;

CREATE TABLE private.bs09_flags(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.bs09_flags(id,enabled) VALUES(true,false);

CREATE TABLE private.bs09_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(
  length(name) BETWEEN 2 AND 80 AND name=btrim(name)
  AND name !~ '[<>]'
 ),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 UNIQUE(workspace_id,id),
 UNIQUE(workspace_id,created_by,request_id)
);
CREATE UNIQUE INDEX bs09_group_workspace_name_unique
 ON private.bs09_groups(workspace_id,lower(name))
 WHERE archived_at IS NULL;

CREATE TABLE private.bs09_group_members(
 group_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 added_by uuid NOT NULL REFERENCES public.profiles(id),
 added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,user_id),
 FOREIGN KEY(group_id,workspace_id)
  REFERENCES private.bs09_groups(id,workspace_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,user_id)
  REFERENCES public.workspace_members(workspace_id,user_id) ON DELETE CASCADE
);

CREATE TABLE private.bs09_group_board_grants(
 group_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'viewer' CHECK(role='viewer'),
 granted_by uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 PRIMARY KEY(group_id,board_id),
 UNIQUE(workspace_id,granted_by,request_id),
 FOREIGN KEY(group_id,workspace_id)
  REFERENCES private.bs09_groups(id,workspace_id) ON DELETE CASCADE
);
CREATE INDEX bs09_group_boards_active
 ON private.bs09_group_board_grants(board_id,workspace_id)
 WHERE revoked_at IS NULL;

CREATE TABLE private.bs09_access_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 board_id uuid REFERENCES public.work_boards(id),
 group_id uuid REFERENCES private.bs09_groups(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK(action IN (
  'group.created','group.member.added','group.member.removed',
  'group.board.granted','group.board.revoked'
 )),
 occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.bs09_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs09_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs09_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs09_group_board_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs09_access_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.bs09_flags,private.bs09_groups,
 private.bs09_group_members,private.bs09_group_board_grants,
 private.bs09_access_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.bs09_access_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- Deliberately NOT integrated into public.work_board_access or wm_list_boards.
-- It is an internal hook. Do not grant direct execution to browser roles.
-- Both workspace and exact board checks are required; membership alone
-- never suffices. Revocation is evaluated on every fresh server request.
CREATE FUNCTION private.bs09_group_allows_board(
 p_board_id uuid,p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE v_workspace uuid;
BEGIN
 IF p_board_id IS NULL OR p_user_id IS NULL OR
    p_user_id IS DISTINCT FROM auth.uid() OR
    NOT EXISTS(SELECT 1 FROM private.bs09_flags f
     WHERE f.id IS TRUE AND f.enabled IS TRUE) THEN
  RETURN false;
 END IF;
 -- Production must use the approved live GoTrue session verifier. The
 -- existing WS01 verifier fails closed for invalid/revoked sessions.
 PERFORM private.ws01_signed_actor_session();
 SELECT b.workspace_id INTO v_workspace FROM public.work_boards b
 WHERE b.id=p_board_id AND b.archived_at IS NULL AND b.trashed_at IS NULL;
 IF v_workspace IS NULL OR
    public.current_workspace_id(p_user_id) IS DISTINCT FROM v_workspace OR
    NOT EXISTS(SELECT 1 FROM public.profiles p
      WHERE p.id=p_user_id AND p.status='active') OR
    NOT EXISTS(SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id=v_workspace AND wm.user_id=p_user_id
        AND wm.active IS TRUE)
 THEN RETURN false; END IF;

 RETURN EXISTS(
  SELECT 1
  FROM private.bs09_group_board_grants gb
  JOIN private.bs09_groups g ON g.id=gb.group_id
   AND g.workspace_id=gb.workspace_id AND g.archived_at IS NULL
  JOIN private.bs09_group_members gm ON gm.group_id=g.id
   AND gm.workspace_id=g.workspace_id
  WHERE gb.board_id=p_board_id AND gb.workspace_id=v_workspace
    AND gb.revoked_at IS NULL AND gb.role='viewer'
    AND gm.user_id=p_user_id
 );
EXCEPTION WHEN OTHERS THEN
 -- Invalid/expired JWT, missing helper, unexpected schema drift: deny.
 RETURN false;
END $body$;
REVOKE ALL ON FUNCTION private.bs09_group_allows_board(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- No create/assign/revoke RPCs, no trusted API role grants and no automatic
-- workspace membership or board membership mutations are installed here.
-- Later migrations must add signed transactional create/member/grant/revoke
-- APIs, exact-resource sharing policy, module allowlist and audit/rollback.
COMMIT;
