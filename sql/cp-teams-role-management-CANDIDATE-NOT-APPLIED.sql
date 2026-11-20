-- CP-TEAMS-01: REVIEW CANDIDATE. NOT AN AUTO-APPLIED MIGRATION.
-- NEVER DEPLOY without PostgreSQL 17 disposable acceptance, security review,
-- approved bootstrap owner and explicit module/board RLS authorization rollout.
-- Context: existing public.profiles, public.workspaces, public.workspace_members,
-- public.work_boards and private.ws01_signed_actor_session().
BEGIN;

DO $prereq$
BEGIN
 IF to_regclass('public.workspaces') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('public.workspace_members') IS NULL
 OR to_regclass('public.work_boards') IS NULL
 OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 OR to_regclass('public.apsyntra_teams') IS NOT NULL
 THEN RAISE EXCEPTION 'Teams: schema collision or missing prerequisites' USING ERRCODE='42501';
 END IF;
END;
$prereq$;

-- Public-namespaced tables remain RLS-protected. All mutations use audited RPCs.
CREATE TABLE public.apsyntra_teams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 avatar_url text,
 cover_url text,
 is_system boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX apsyntra_teams_workspace_name ON public.apsyntra_teams(workspace_id,lower(name));
CREATE UNIQUE INDEX apsyntra_teams_one_system ON public.apsyntra_teams(workspace_id) WHERE is_system;
CREATE INDEX apsyntra_teams_workspace_idx ON public.apsyntra_teams(workspace_id);

CREATE TABLE public.apsyntra_team_members (
 team_id uuid NOT NULL REFERENCES public.apsyntra_teams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 is_owner boolean NOT NULL DEFAULT false,
 added_by uuid NOT NULL REFERENCES public.profiles(id),
 added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(team_id,user_id)
);
CREATE INDEX apsyntra_team_members_user ON public.apsyntra_team_members(user_id);

CREATE TABLE public.apsyntra_team_content (
 team_id uuid NOT NULL REFERENCES public.apsyntra_teams(id) ON DELETE CASCADE,
 content_type text NOT NULL CHECK(content_type IN ('board','folder','app')),
 content_id uuid NOT NULL,
 access_level text NOT NULL CHECK(access_level IN ('viewer','editor','manager')),
 assigned_by uuid NOT NULL REFERENCES public.profiles(id),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(team_id,content_type,content_id)
);
CREATE INDEX apsyntra_team_content_lookup ON public.apsyntra_team_content(content_type,content_id);

CREATE TABLE private.apsyntra_teams_revision (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE private.apsyntra_system_admin_grants (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 granted_by uuid NOT NULL REFERENCES public.profiles(id),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_by uuid REFERENCES public.profiles(id),
 revoked_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE private.apsyntra_teams_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL,
 target_type text NOT NULL,
 target_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $rls$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY[
  'public.apsyntra_teams','public.apsyntra_team_members',
  'public.apsyntra_team_content','private.apsyntra_teams_revision',
  'private.apsyntra_system_admin_grants','private.apsyntra_teams_audit_log'
 ] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',v_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY',v_table);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated',v_table);
 END LOOP;
END;
$rls$;

CREATE FUNCTION private.apsyntra_teams_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
 RAISE EXCEPTION 'Team audit log is append-only' USING ERRCODE='42501';
END;
$function$;
CREATE TRIGGER apsyntra_teams_audit_append_only
 BEFORE UPDATE OR DELETE ON private.apsyntra_teams_audit_log
 FOR EACH ROW EXECUTE FUNCTION private.apsyntra_teams_audit_immutable();
REVOKE ALL ON FUNCTION private.apsyntra_teams_audit_immutable()
 FROM PUBLIC,anon,authenticated;

-- The special team is ID-based; renaming never changes inherited authority.
-- Creating new workspaces requires a reviewed lifecycle hook to seed the team.
INSERT INTO public.apsyntra_teams(workspace_id,name,is_system)
SELECT w.id,'General administration',true FROM public.workspaces w;
INSERT INTO private.apsyntra_teams_revision(workspace_id)
SELECT w.id FROM public.workspaces w ON CONFLICT DO NOTHING;

-- Secure migration prerequisite: an explicitly approved bootstrap profile UUID
-- MUST be provided by the migration operator, not guessed by department/name.
-- Example preamble in the SAME transaction:
-- SET LOCAL apsyntra.approved_seed_admin = 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx';
DO $seed$
DECLARE v_seed uuid;v_text text;
BEGIN
 v_text:=nullif(current_setting('apsyntra.approved_seed_admin',true),'');
 IF v_text IS NULL OR v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RAISE EXCEPTION 'Teams activation requires an explicitly approved bootstrap administrator UUID'
  USING ERRCODE='42501'; END IF;
 v_seed:=v_text::uuid;
 IF NOT EXISTS(
  SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
  JOIN public.profiles p ON p.id=b.user_id AND p.status='active'
  WHERE b.user_id=v_seed
 ) THEN RAISE EXCEPTION 'The approved initial System Admin must be an active protected bootstrap identity'
  USING ERRCODE='42501'; END IF;
 INSERT INTO public.apsyntra_team_members(team_id,user_id,is_owner,added_by)
 SELECT t.id,v_seed,true,v_seed FROM public.apsyntra_teams t
 JOIN public.workspace_members m ON m.workspace_id=t.workspace_id
  AND m.user_id=v_seed AND m.active
 WHERE t.is_system;
 IF EXISTS (
  SELECT 1 FROM public.workspaces w
  WHERE NOT EXISTS (
   SELECT 1 FROM public.apsyntra_teams t
   JOIN public.apsyntra_team_members tm ON tm.team_id=t.id
   WHERE t.workspace_id=w.id AND t.is_system AND tm.user_id=v_seed
  )
 ) THEN
  RAISE EXCEPTION 'Approved seed is not a member of every existing workspace; do not activate partially'
   USING ERRCODE='42501';
 END IF;
END;
$seed$;

-- Session-bound, workspace-bound predicate; neither job title nor IT department
-- implies System Admin. This function is intentionally not a cross-tenant bypass.
CREATE FUNCTION public.apsyntra_team_is_system_admin(p_user_id uuid,p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $admin$
SELECT p_user_id=auth.uid() AND auth.uid() IS NOT NULL
 AND private.ws01_signed_actor_session() IS NOT NULL
 AND p_workspace_id=public.current_workspace_id(auth.uid())
 AND EXISTS(SELECT 1 FROM public.workspace_members wm
  JOIN public.profiles p ON p.id=wm.user_id
  WHERE wm.workspace_id=p_workspace_id AND wm.user_id=p_user_id
   AND wm.active AND p.status='active')
 AND (
  EXISTS(SELECT 1 FROM public.apsyntra_team_members m
   JOIN public.apsyntra_teams t ON t.id=m.team_id
   WHERE m.user_id=p_user_id AND t.workspace_id=p_workspace_id AND t.is_system)
  OR EXISTS(SELECT 1 FROM private.apsyntra_system_admin_grants g
   WHERE g.user_id=p_user_id AND g.revoked_at IS NULL)
 );
$admin$;
REVOKE ALL ON FUNCTION public.apsyntra_team_is_system_admin(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_team_is_system_admin(uuid,uuid) TO authenticated;

-- Authoritative union of direct board invite and team-based board access.
-- NOTE: this does NOT replace existing board RLS/allowed() until approved.
CREATE FUNCTION public.apsyntra_team_effective_board_role(p_board_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE
  WHEN public.apsyntra_team_is_system_admin(auth.uid(),b.workspace_id) THEN 'owner'
  WHEN EXISTS(SELECT 1 FROM public.work_board_members bm
   WHERE bm.board_id=b.id AND bm.user_id=auth.uid() AND bm.role='owner') THEN 'owner'
  WHEN EXISTS(SELECT 1 FROM public.work_board_members bm
   WHERE bm.board_id=b.id AND bm.user_id=auth.uid() AND bm.role='editor')
    OR EXISTS(SELECT 1 FROM public.apsyntra_team_content c
     JOIN public.apsyntra_teams t ON t.id=c.team_id
     JOIN public.apsyntra_team_members m ON m.team_id=t.id
     WHERE m.user_id=auth.uid() AND t.workspace_id=b.workspace_id
       AND c.content_type='board' AND c.content_id=b.id
       AND c.access_level IN ('editor','manager')) THEN 'editor'
  WHEN EXISTS(SELECT 1 FROM public.work_board_members bm
   WHERE bm.board_id=b.id AND bm.user_id=auth.uid() AND bm.role='viewer')
    OR EXISTS(SELECT 1 FROM public.apsyntra_team_content c
     JOIN public.apsyntra_teams t ON t.id=c.team_id
     JOIN public.apsyntra_team_members m ON m.team_id=t.id
     WHERE m.user_id=auth.uid() AND t.workspace_id=b.workspace_id
       AND c.content_type='board' AND c.content_id=b.id) THEN 'viewer'
  ELSE NULL END
 FROM public.work_boards b
 WHERE b.id=p_board_id AND b.status='active'
  AND b.trashed_at IS NULL AND b.archived_at IS NULL
  AND b.workspace_id=public.current_workspace_id(auth.uid())
  AND EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.user_id=auth.uid() AND wm.workspace_id=b.workspace_id
    AND wm.active AND p.status='active')
  AND private.ws01_signed_actor_session() IS NOT NULL;
$role$;
REVOKE ALL ON FUNCTION public.apsyntra_team_effective_board_role(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_team_effective_board_role(uuid) TO authenticated;

CREATE FUNCTION public.apsyntra_teams_snapshot(p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $snapshot$
DECLARE v_actor uuid:=auth.uid();v_sys boolean;v_owner boolean;v_revision bigint;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.user_id=v_actor AND wm.workspace_id=p_workspace_id
     AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Signed Teams workspace required' USING ERRCODE='42501'; END IF;
 v_sys:=public.apsyntra_team_is_system_admin(v_actor,p_workspace_id);
 SELECT EXISTS(SELECT 1 FROM public.apsyntra_team_members m
   JOIN public.apsyntra_teams t ON t.id=m.team_id
   WHERE t.workspace_id=p_workspace_id AND m.user_id=v_actor AND m.is_owner)
 INTO v_owner;
 SELECT revision INTO v_revision FROM private.apsyntra_teams_revision
 WHERE workspace_id=p_workspace_id;
 IF v_revision IS NULL THEN RAISE EXCEPTION 'Teams workspace seed not activated' USING ERRCODE='42501'; END IF;
 RETURN (
 WITH visible AS (
  SELECT t.*,(v_sys OR coalesce(actor_m.is_owner,false)) AS can_manage
  FROM public.apsyntra_teams t
  LEFT JOIN public.apsyntra_team_members actor_m
   ON actor_m.team_id=t.id AND actor_m.user_id=v_actor
  WHERE t.workspace_id=p_workspace_id AND (v_sys OR actor_m.user_id IS NOT NULL)
 ), members AS (
  SELECT m.team_id,m.user_id,m.is_owner,p.display_name AS person_name,p.email,
   coalesce(to_jsonb(p)->>'job_title',to_jsonb(p)->>'title','') AS person_title,
   g.granted_by,g.granted_at,(g.user_id IS NOT NULL AND g.revoked_at IS NULL) AS has_grant,
   EXISTS(SELECT 1 FROM public.apsyntra_team_members sm
    JOIN public.apsyntra_teams st ON st.id=sm.team_id
    WHERE sm.user_id=m.user_id AND st.is_system AND st.workspace_id=p_workspace_id) AS inherited
  FROM public.apsyntra_team_members m
  JOIN visible t ON t.id=m.team_id
  JOIN public.profiles p ON p.id=m.user_id AND p.status='active'
  JOIN public.workspace_members wm ON wm.user_id=m.user_id
   AND wm.workspace_id=p_workspace_id AND wm.active
  LEFT JOIN private.apsyntra_system_admin_grants g ON g.user_id=m.user_id
 ), content AS (
  SELECT c.*,CASE WHEN c.content_type='board' THEN b.name ELSE c.content_type END AS display_name
  FROM public.apsyntra_team_content c JOIN visible t ON t.id=c.team_id
  LEFT JOIN public.work_boards b ON b.id=c.content_id AND c.content_type='board'
   AND b.workspace_id=t.workspace_id
 )
 SELECT jsonb_build_object(
  'contract','apsyntra-teams-v1','workspaceId',p_workspace_id,
  'actorId',v_actor,'authorized',true,'revision',v_revision,
  'canManageSystemAdmins',v_sys,
  'teams',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',t.id,'name',t.name,'isSystem',t.is_system,
    'canManage',t.can_manage,'avatarUrl',t.avatar_url,'coverUrl',t.cover_url,
    'memberCount',(SELECT count(*) FROM members m WHERE m.team_id=t.id),
    'ownerCount',(SELECT count(*) FROM members m WHERE m.team_id=t.id AND m.is_owner),
    'contentCount',(SELECT count(*) FROM content c WHERE c.team_id=t.id),
    'systemAdminCount',(SELECT count(*) FROM members m WHERE m.team_id=t.id AND (m.inherited OR m.has_grant))
    ) ORDER BY t.name) FROM visible t),'[]'::jsonb),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'teamId',m.team_id,'userId',m.user_id,'name',m.person_name,
    'email',m.email,'title',m.person_title,'isOwner',m.is_owner,
    'systemAdminSource',CASE WHEN m.inherited THEN 'inherited'
      WHEN m.has_grant THEN 'explicit' ELSE 'none' END,
    'systemAdminExplicit',m.has_grant,
    'grantedByName',(SELECT pp.display_name FROM public.profiles pp WHERE pp.id=m.granted_by),
    'grantedAt',m.granted_at
    ) ORDER BY m.person_name) FROM members m),'[]'::jsonb),
  'directory',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'userId',p.id,'name',p.display_name,'email',p.email
   ) ORDER BY p.display_name)
   FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=p_workspace_id AND wm.active
    AND (v_sys OR v_owner OR p.id=v_actor)),'[]'::jsonb),
  'content',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'teamId',c.team_id,'contentType',c.content_type,'contentId',c.content_id,
    'accessLevel',c.access_level,'name',c.display_name
    ) ORDER BY c.content_type,c.display_name) FROM content c),'[]'::jsonb)
 )
 );
END;
$snapshot$;
REVOKE ALL ON FUNCTION public.apsyntra_teams_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_teams_snapshot(uuid) TO authenticated;

-- Revision-checked writes are serialized per workspace. The central RPC
-- never accepts client-supplied actor IDs or admin/crown assertions.
CREATE FUNCTION public.apsyntra_teams_change(
 p_workspace_id uuid,p_action text,p_team_id uuid,p_target_user_id uuid,
 p_destination_team_id uuid,p_name text,p_content_type text,p_content_id uuid,
 p_access_level text,p_asset_url text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mutate$
DECLARE
 v_actor uuid:=auth.uid();v_sys boolean;v_owner boolean;v_target_owner boolean;
 v_team public.apsyntra_teams%ROWTYPE;v_destination public.apsyntra_teams%ROWTYPE;
 v_revision bigint;v_active_admin_count bigint;v_is_system_member boolean;v_new_team uuid;
 v_target_type text:='team';v_target uuid:=p_team_id;
BEGIN
 IF v_actor IS NULL OR private.ws01_signed_actor_session() IS NULL
  OR p_workspace_id IS DISTINCT FROM public.current_workspace_id(v_actor)
  OR NOT EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id
   WHERE wm.user_id=v_actor AND wm.workspace_id=p_workspace_id
    AND wm.active AND p.status='active')
 THEN RAISE EXCEPTION 'Signed Teams actor required' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('create','rename','duplicate','delete','add_member',
   'remove_member','move_member','add_other_team','make_owner','remove_owner',
   'grant_admin','revoke_admin','assign_content','remove_content','set_content_role','set_avatar','set_cover')
   OR p_expected_revision IS NULL OR p_expected_revision<0
 THEN RAISE EXCEPTION 'Invalid Teams action or revision' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(hashtext('apsyntra-teams'),hashtext(p_workspace_id::text));
 SELECT revision INTO v_revision FROM private.apsyntra_teams_revision
 WHERE workspace_id=p_workspace_id FOR UPDATE;
 IF v_revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale Teams revision' USING ERRCODE='PT409'; END IF;
 v_sys:=public.apsyntra_team_is_system_admin(v_actor,p_workspace_id);
 SELECT * INTO v_team FROM public.apsyntra_teams
 WHERE id=p_team_id AND workspace_id=p_workspace_id FOR UPDATE;
 SELECT coalesce(m.is_owner,false) INTO v_owner
 FROM public.apsyntra_team_members m
 WHERE m.team_id=p_team_id AND m.user_id=v_actor;
 v_owner:=coalesce(v_owner,false);
 IF p_action='create' THEN
  IF NOT v_sys OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'System Admin and valid team name required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.apsyntra_teams(workspace_id,name) VALUES(p_workspace_id,btrim(p_name))
  RETURNING id INTO v_new_team;
  v_target:=v_new_team;
 ELSIF p_action='duplicate' THEN
  IF v_team.id IS NULL OR NOT(v_sys OR v_owner)
  THEN RAISE EXCEPTION 'Team owner required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.apsyntra_teams(workspace_id,name)
  VALUES(p_workspace_id,left(v_team.name||' (copy)',100))
  RETURNING id INTO v_new_team;
  v_target:=v_new_team;
 ELSIF v_team.id IS NULL OR NOT(v_sys OR v_owner) THEN
  RAISE EXCEPTION 'Team management permission denied' USING ERRCODE='42501';
 ELSIF v_team.is_system AND NOT v_sys THEN
  RAISE EXCEPTION 'General administration is reserved for System Admins' USING ERRCODE='42501';
 ELSIF p_action='rename' THEN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Invalid team name' USING ERRCODE='22023'; END IF;
  UPDATE public.apsyntra_teams SET name=btrim(p_name) WHERE id=v_team.id;
 ELSIF p_action='delete' THEN
  IF v_team.is_system THEN
   RAISE EXCEPTION 'General administration cannot be deleted' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.apsyntra_teams WHERE id=v_team.id;
 ELSIF p_action IN ('set_avatar','set_cover') THEN
  IF p_asset_url IS NOT NULL AND
   (length(p_asset_url)>500 OR p_asset_url !~* '^https://(jtlusodorfnyzgyuewkz\.supabase\.co/storage/v1/object/public/|wass-psti\.github\.io/APSYNTRACRM/)[^[:space:]]+$')
  THEN RAISE EXCEPTION 'Only approved public asset origins are allowed' USING ERRCODE='22023'; END IF;
  IF p_action='set_avatar' THEN
   UPDATE public.apsyntra_teams SET avatar_url=p_asset_url WHERE id=v_team.id;
  ELSE UPDATE public.apsyntra_teams SET cover_url=p_asset_url WHERE id=v_team.id; END IF;
 ELSIF p_action IN ('add_member','remove_member','move_member','add_other_team','make_owner','remove_owner','grant_admin','revoke_admin') THEN
  IF p_target_user_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.profiles p
   JOIN public.workspace_members wm ON wm.user_id=p.id
   WHERE p.id=p_target_user_id AND p.status='active'
    AND wm.workspace_id=p_workspace_id AND wm.active
  ) THEN RAISE EXCEPTION 'Active workspace member required' USING ERRCODE='42501'; END IF;
  v_target_type:='user';v_target:=p_target_user_id;
  SELECT coalesce(m.is_owner,false) INTO v_target_owner
  FROM public.apsyntra_team_members m
  WHERE m.team_id=v_team.id AND m.user_id=p_target_user_id;
  v_target_owner:=coalesce(v_target_owner,false);
  IF p_action IN ('grant_admin','revoke_admin') THEN
   IF NOT v_sys THEN
    RAISE EXCEPTION 'Only an existing System Admin can change the role' USING ERRCODE='42501'; END IF;
   IF p_action='grant_admin' THEN
    IF EXISTS(SELECT 1 FROM private.apsyntra_system_admin_grants g
      WHERE g.user_id=p_target_user_id AND g.revoked_at IS NULL)
    THEN RAISE EXCEPTION 'System Admin already explicitly granted' USING ERRCODE='PT409'; END IF;
    INSERT INTO private.apsyntra_system_admin_grants AS grant_row(user_id,granted_by,granted_at,revoked_by,revoked_at,revision)
    VALUES(p_target_user_id,v_actor,clock_timestamp(),NULL,NULL,1)
    ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,
     granted_at=excluded.granted_at,revoked_by=NULL,revoked_at=NULL,
     revision=grant_row.revision+1;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM private.apsyntra_system_admin_grants g
       WHERE g.user_id=p_target_user_id AND g.revoked_at IS NULL)
    THEN RAISE EXCEPTION 'Explicit grant not active' USING ERRCODE='PT409'; END IF;
    UPDATE private.apsyntra_system_admin_grants SET revoked_by=v_actor,revoked_at=clock_timestamp(),
     revision=revision+1 WHERE user_id=p_target_user_id;
   END IF;
  ELSIF p_action IN ('add_member','add_other_team','move_member') THEN
   IF p_action IN ('add_other_team','move_member') THEN
    SELECT * INTO v_destination FROM public.apsyntra_teams
    WHERE id=p_destination_team_id AND workspace_id=p_workspace_id FOR UPDATE;
    IF v_destination.id IS NULL OR v_destination.id=v_team.id OR
      (v_destination.is_system AND NOT v_sys) OR
      NOT(v_sys OR EXISTS(SELECT 1 FROM public.apsyntra_team_members m
       WHERE m.team_id=v_destination.id AND m.user_id=v_actor AND m.is_owner))
    THEN RAISE EXCEPTION 'Destination team is not manageable' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.apsyntra_team_members m
      WHERE m.team_id=v_team.id AND m.user_id=p_target_user_id)
    THEN RAISE EXCEPTION 'Source membership is unavailable' USING ERRCODE='42501'; END IF;
   END IF;
   INSERT INTO public.apsyntra_team_members(team_id,user_id,is_owner,added_by)
   VALUES(CASE WHEN p_action='add_member' THEN v_team.id ELSE v_destination.id END,
     p_target_user_id,
     NOT EXISTS(SELECT 1 FROM public.apsyntra_team_members m WHERE m.team_id=
       CASE WHEN p_action='add_member' THEN v_team.id ELSE v_destination.id END),v_actor);
   IF p_action='move_member' THEN
    DELETE FROM public.apsyntra_team_members
    WHERE team_id=v_team.id AND user_id=p_target_user_id;
   END IF;
  ELSIF p_action='remove_member' THEN
   DELETE FROM public.apsyntra_team_members
   WHERE team_id=v_team.id AND user_id=p_target_user_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found' USING ERRCODE='PT409'; END IF;
  ELSIF p_action='make_owner' THEN
   UPDATE public.apsyntra_team_members SET is_owner=true
   WHERE team_id=v_team.id AND user_id=p_target_user_id AND NOT is_owner;
   IF NOT FOUND THEN RAISE EXCEPTION 'User is not an eligible member' USING ERRCODE='PT409'; END IF;
  ELSIF p_action='remove_owner' THEN
   UPDATE public.apsyntra_team_members SET is_owner=false
   WHERE team_id=v_team.id AND user_id=p_target_user_id AND is_owner;
   IF NOT FOUND THEN RAISE EXCEPTION 'Team owner not found' USING ERRCODE='PT409'; END IF;
  END IF;
  IF p_action IN ('remove_member','move_member','remove_owner') AND
    EXISTS(SELECT 1 FROM public.apsyntra_team_members m WHERE m.team_id=v_team.id) AND
    NOT EXISTS(SELECT 1 FROM public.apsyntra_team_members m
     WHERE m.team_id=v_team.id AND m.is_owner)
  THEN RAISE EXCEPTION 'A nonempty team must retain at least one owner' USING ERRCODE='42501'; END IF;
 ELSIF p_action IN ('assign_content','remove_content','set_content_role') THEN
  IF p_content_type NOT IN ('board','folder','app') OR p_content_id IS NULL
  THEN RAISE EXCEPTION 'Valid content reference required' USING ERRCODE='22023'; END IF;
  IF p_action='assign_content' THEN
   -- A team owner must not grant access to any board merely by knowing its UUID.
   -- The actor must additionally control the board itself, or be System Admin.
   IF NOT v_sys AND NOT EXISTS (
    SELECT 1 FROM public.work_board_members bm
    WHERE bm.board_id=p_content_id AND bm.user_id=v_actor AND bm.role='owner'
   ) THEN RAISE EXCEPTION 'Board owner authority required for team grant'
     USING ERRCODE='42501'; END IF;
   -- Folder and app permissions need their own authoritative resource registries,
   -- not arbitrary client-supplied UUIDs.
   IF p_content_type<>'board' OR p_access_level NOT IN ('viewer','editor') OR
    NOT EXISTS(SELECT 1 FROM public.work_boards b
      WHERE b.id=p_content_id AND b.workspace_id=p_workspace_id
       AND b.status='active' AND b.trashed_at IS NULL AND b.archived_at IS NULL)
   THEN RAISE EXCEPTION 'Content target is not an authorized board' USING ERRCODE='42501'; END IF;
   INSERT INTO public.apsyntra_team_content(team_id,content_type,content_id,access_level,assigned_by)
   VALUES(v_team.id,p_content_type,p_content_id,p_access_level,v_actor);
  ELSIF p_action='set_content_role' THEN
   IF p_content_type<>'board' OR p_access_level NOT IN ('viewer','editor') OR
     NOT EXISTS(SELECT 1 FROM public.work_boards b
      WHERE b.id=p_content_id AND b.workspace_id=p_workspace_id
       AND b.status='active' AND b.trashed_at IS NULL AND b.archived_at IS NULL)
   THEN RAISE EXCEPTION 'A valid board and role are required'
    USING ERRCODE='22023'; END IF;
   IF NOT v_sys AND NOT EXISTS(
    SELECT 1 FROM public.work_board_members bm
     WHERE bm.board_id=p_content_id AND bm.user_id=v_actor AND bm.role='owner'
   ) THEN RAISE EXCEPTION 'Board owner authority required for changing inherited access'
    USING ERRCODE='42501'; END IF;
   UPDATE public.apsyntra_team_content
    SET access_level=p_access_level,assigned_by=v_actor,assigned_at=clock_timestamp()
    WHERE team_id=v_team.id AND content_type='board' AND content_id=p_content_id
     AND access_level IS DISTINCT FROM p_access_level;
   IF NOT FOUND THEN RAISE EXCEPTION 'Board permission already changed; refresh and retry'
    USING ERRCODE='PT409'; END IF;
  ELSE
   DELETE FROM public.apsyntra_team_content
   WHERE team_id=v_team.id AND content_type=p_content_type AND content_id=p_content_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Content link not found' USING ERRCODE='PT409'; END IF;
  END IF;
 END IF;

 -- Post-mutation aggregate invariants; count effective DISTINCT active admins
 -- across inheritance + explicit grants, not role rows (avoids double-counting).
 SELECT count(*) INTO v_active_admin_count FROM (
  SELECT wm.user_id FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=p_workspace_id AND wm.active
    AND (EXISTS(SELECT 1 FROM public.apsyntra_team_members m
        JOIN public.apsyntra_teams t ON t.id=m.team_id
        WHERE m.user_id=wm.user_id AND t.workspace_id=p_workspace_id AND t.is_system)
      OR EXISTS(SELECT 1 FROM private.apsyntra_system_admin_grants g
        WHERE g.user_id=wm.user_id AND g.revoked_at IS NULL))
 ) active_system_admins;
 IF v_active_admin_count<1
 THEN RAISE EXCEPTION 'The last System Admin cannot be removed, revoked or deleted'
  USING ERRCODE='42501'; END IF;

 UPDATE private.apsyntra_teams_revision
 SET revision=revision+1 WHERE workspace_id=p_workspace_id
 RETURNING revision INTO v_revision;
 INSERT INTO private.apsyntra_teams_audit_log(workspace_id,actor_id,action,target_type,target_id,metadata)
 VALUES(p_workspace_id,v_actor,p_action,v_target_type,v_target,
  jsonb_build_object('teamId',p_team_id,'targetUserId',p_target_user_id,
   'destinationTeamId',p_destination_team_id,'contentType',p_content_type,
   'contentId',p_content_id,'accessLevel',p_access_level,'revision',v_revision));
 RETURN jsonb_build_object('contract','apsyntra-teams-change-v1','state','committed',
   'workspaceId',p_workspace_id,'actorId',v_actor,'action',p_action,
   'revision',v_revision,'teamId',coalesce(v_new_team,p_team_id));
END;
$mutate$;
REVOKE ALL ON FUNCTION public.apsyntra_teams_change(
 uuid,text,uuid,uuid,uuid,text,text,uuid,text,text,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apsyntra_teams_change(
 uuid,text,uuid,uuid,uuid,text,text,uuid,text,text,bigint)
 TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
