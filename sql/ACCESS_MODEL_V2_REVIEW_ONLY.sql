-- APSYNTRA ACCESS MODEL V2 — REVIEW ONLY, NOT AN AUTO-APPLIED MIGRATION.
-- Depends on the separately reviewed Teams candidate:
--   public.apsyntra_teams, public.apsyntra_team_members,
--   public.apsyntra_team_content,
--   private.apsyntra_system_admin_grants,
--   private.apsyntra_teams_audit_log,
--   public.apsyntra_team_is_system_admin(uuid,uuid)
-- PLUS existing public.work_boards, public.work_board_members,
-- public.workspace_members, public.profiles and the signed actor session.
--
-- Never deploy this file by copying to supabase/migrations without signed
-- PostgreSQL 17 acceptance, owner recovery, semantic mapping of EACH legacy
-- module role, staging validation and approved cutover/rollback.
BEGIN;

CREATE SCHEMA IF NOT EXISTS access_v2;
REVOKE ALL ON SCHEMA access_v2 FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA access_v2 TO authenticated;

DO $prereq$
BEGIN
 IF to_regclass('public.work_boards') IS NULL OR
    to_regclass('public.work_board_members') IS NULL OR
    to_regclass('public.apsyntra_teams') IS NULL OR
    to_regclass('public.apsyntra_team_content') IS NULL OR
    to_regclass('private.apsyntra_system_admin_grants') IS NULL OR
    to_regprocedure('private.ws01_signed_actor_session()') IS NULL
 THEN RAISE EXCEPTION 'Access V2 prerequisite schema is not verified; no tables created'
  USING ERRCODE='42501'; END IF;
END;
$prereq$;

CREATE TYPE access_v2.board_role AS ENUM ('viewer','editor');
CREATE TYPE access_v2.capability AS ENUM
 ('view','create','edit','delete','approve','export');

-- New shadow board records; existing public.work_board_members remains
-- authoritative until a complete dual-read/dual-write cutover is verified.
-- The protected Owner relation is an independent boolean, not a third
-- assignable board role. An owner always has editor capability.
CREATE TABLE access_v2.board_members (
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 role access_v2.board_role NOT NULL,
 is_owner boolean NOT NULL DEFAULT false,
 assigned_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(board_id,user_id),
 CONSTRAINT owner_must_edit CHECK (NOT is_owner OR role='editor'::access_v2.board_role)
);
CREATE INDEX access_v2_direct_board_member_user ON access_v2.board_members(user_id,board_id);

CREATE TABLE access_v2.board_team_access (
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.apsyntra_teams(id) ON DELETE CASCADE,
 role access_v2.board_role NOT NULL,
 assigned_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(board_id,team_id)
);
CREATE INDEX access_v2_board_team_lookup ON access_v2.board_team_access(team_id,board_id);

CREATE TABLE access_v2.apps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 key text NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workspace_id,key),
 UNIQUE(id,workspace_id)
);
CREATE TABLE access_v2.app_features (
 app_id uuid NOT NULL REFERENCES access_v2.apps(id) ON DELETE CASCADE,
 feature_key text NOT NULL CHECK(feature_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
 capability access_v2.capability NOT NULL,
 PRIMARY KEY(app_id,feature_key,capability)
);
CREATE TABLE access_v2.app_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 app_id uuid NOT NULL REFERENCES access_v2.apps(id) ON DELETE CASCADE,
 role_key text NOT NULL CHECK(role_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '',
 is_admin_role boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 UNIQUE(app_id,role_key),
 UNIQUE(id,app_id)
);
CREATE UNIQUE INDEX access_v2_one_app_admin_role
 ON access_v2.app_roles(app_id) WHERE is_admin_role;
CREATE TABLE access_v2.app_role_capabilities (
 app_role_id uuid NOT NULL,
 app_id uuid NOT NULL,
 feature_key text NOT NULL,
 capability access_v2.capability NOT NULL,
 allowed boolean NOT NULL DEFAULT false,
 updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(app_role_id,feature_key,capability),
 FOREIGN KEY(app_role_id,app_id) REFERENCES access_v2.app_roles(id,app_id) ON DELETE CASCADE,
 FOREIGN KEY(app_id,feature_key,capability)
  REFERENCES access_v2.app_features(app_id,feature_key,capability) ON DELETE RESTRICT
);
CREATE TABLE access_v2.app_role_members (
 app_role_id uuid NOT NULL,
 app_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 assigned_by uuid REFERENCES public.profiles(id),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(app_role_id,user_id),
 FOREIGN KEY(app_role_id,app_id) REFERENCES access_v2.app_roles(id,app_id) ON DELETE CASCADE
);
CREATE INDEX access_v2_role_member_lookup ON access_v2.app_role_members(user_id,app_id);

-- Legacy mappings MUST be explicitly classified; unknown or ambiguous legacy
-- roles cannot silently become the sample roles in the screenshot.
CREATE TABLE access_v2.legacy_app_role_mappings (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 legacy_source text NOT NULL,
 app_id uuid NOT NULL REFERENCES access_v2.apps(id),
 legacy_role_key text NOT NULL,
 mapped_role_id uuid REFERENCES access_v2.app_roles(id),
 decision text NOT NULL DEFAULT 'requires_review'
  CHECK(decision IN ('requires_review','approved','excluded')),
 justification text,
 approved_by uuid REFERENCES public.profiles(id),
 approved_at timestamptz,
 PRIMARY KEY(workspace_id,legacy_source,app_id,legacy_role_key),
 CONSTRAINT approved_mapping_has_target CHECK(decision<>'approved' OR mapped_role_id IS NOT NULL)
);

CREATE TABLE access_v2.audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL,
 target_type text NOT NULL,
 target_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX access_v2_audit_workspace_time
 ON access_v2.audit_log(workspace_id,created_at DESC,id DESC);

-- Every role/action is workspace-scoped, never a global title/department flag.
CREATE TABLE access_v2.workspace_revision (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE access_v2.app_revision (
 app_id uuid PRIMARY KEY REFERENCES access_v2.apps(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);

DO $lockdown$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'board_members','board_team_access','apps','app_features','app_roles',
  'app_role_capabilities','app_role_members','legacy_app_role_mappings',
  'audit_log','workspace_revision','app_revision'
 ] LOOP
  EXECUTE format('ALTER TABLE access_v2.%I ENABLE ROW LEVEL SECURITY',t);
  -- Deny all table access from the browser. RPC owners must be reviewed for
  -- SECURITY DEFINER bypass before grants are authorized.
  EXECUTE format('REVOKE ALL ON access_v2.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END;
$lockdown$;

CREATE FUNCTION access_v2.audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $audit$
BEGIN
 RAISE EXCEPTION 'Access V2 audit records are append-only'
  USING ERRCODE='42501';
END;
$audit$;
CREATE TRIGGER access_v2_audit_append_only
 BEFORE UPDATE OR DELETE ON access_v2.audit_log FOR EACH ROW
 EXECUTE FUNCTION access_v2.audit_immutable();
REVOKE ALL ON FUNCTION access_v2.audit_immutable() FROM PUBLIC,anon,authenticated;

-- Guard against cross-workspace board/team rows and inactive workspace users.
CREATE FUNCTION access_v2.validate_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $scope$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.work_boards b
  WHERE b.id=NEW.board_id AND b.workspace_id=NEW.workspace_id)
 THEN RAISE EXCEPTION 'Board/workspace mismatch' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='board_team_access' THEN
  IF NOT EXISTS(SELECT 1 FROM public.apsyntra_teams t
   WHERE t.id=NEW.team_id AND t.workspace_id=NEW.workspace_id)
  THEN RAISE EXCEPTION 'Cross-workspace team assignment denied'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=NEW.workspace_id AND wm.user_id=NEW.user_id AND wm.active)
  THEN RAISE EXCEPTION 'Inactive or foreign board member denied'
   USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;
$scope$;
CREATE TRIGGER board_direct_validate_scope
 BEFORE INSERT OR UPDATE ON access_v2.board_members
 FOR EACH ROW EXECUTE FUNCTION access_v2.validate_scope();
CREATE TRIGGER board_team_validate_scope
 BEFORE INSERT OR UPDATE ON access_v2.board_team_access
 FOR EACH ROW EXECUTE FUNCTION access_v2.validate_scope();
REVOKE ALL ON FUNCTION access_v2.validate_scope() FROM PUBLIC,anon,authenticated;

-- Deferred validation: no committed board with a missing owner. A board that
-- is itself being deleted is exempt to support board lifecycle cascade.
CREATE FUNCTION access_v2.enforce_last_board_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $owner$
DECLARE v_board uuid:=coalesce(NEW.board_id,OLD.board_id);
BEGIN
 IF EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=v_board) AND
  NOT EXISTS(SELECT 1 FROM access_v2.board_members m
   WHERE m.board_id=v_board AND m.is_owner)
 THEN RAISE EXCEPTION '409: last board owner cannot be removed or demoted'
  USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END;
$owner$;
CREATE CONSTRAINT TRIGGER board_owner_guard
 AFTER DELETE OR UPDATE OF is_owner ON access_v2.board_members
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION access_v2.enforce_last_board_owner();
REVOKE ALL ON FUNCTION access_v2.enforce_last_board_owner() FROM PUBLIC,anon,authenticated;

-- Defense-in-depth: only the logged-in signed actor may ask about their own
-- effective board role. This never substitutes for existing production board RLS
-- until the cutover is signed off and all work_board_* endpoints use it.
CREATE FUNCTION access_v2.effective_board_role(p_user_id uuid,p_board_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $role$
 SELECT CASE
  WHEN public.apsyntra_team_is_system_admin(p_user_id,b.workspace_id) THEN 'owner'
  WHEN EXISTS(SELECT 1 FROM access_v2.board_members m
   WHERE m.board_id=b.id AND m.user_id=p_user_id AND m.is_owner) THEN 'owner'
  WHEN EXISTS(SELECT 1 FROM access_v2.board_members m
   WHERE m.board_id=b.id AND m.user_id=p_user_id AND m.role='editor')
   OR EXISTS(SELECT 1 FROM access_v2.board_team_access a
    JOIN public.apsyntra_team_members tm ON tm.team_id=a.team_id
    WHERE a.board_id=b.id AND a.workspace_id=b.workspace_id
     AND tm.user_id=p_user_id AND a.role='editor') THEN 'editor'
  WHEN EXISTS(SELECT 1 FROM access_v2.board_members m
   WHERE m.board_id=b.id AND m.user_id=p_user_id)
   OR EXISTS(SELECT 1 FROM access_v2.board_team_access a
    JOIN public.apsyntra_team_members tm ON tm.team_id=a.team_id
    WHERE a.board_id=b.id AND a.workspace_id=b.workspace_id
     AND tm.user_id=p_user_id) THEN 'viewer'
  ELSE NULL END
 FROM public.work_boards b
 WHERE b.id=p_board_id AND p_user_id=auth.uid()
  AND private.ws01_signed_actor_session() IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.workspace_members wm
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE wm.workspace_id=b.workspace_id AND wm.user_id=p_user_id AND wm.active);
$role$;

CREATE FUNCTION access_v2.is_app_admin(p_user_id uuid,p_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $admin$
 SELECT p_user_id=auth.uid() AND auth.uid() IS NOT NULL
  AND private.ws01_signed_actor_session() IS NOT NULL
  AND EXISTS(SELECT 1 FROM access_v2.apps a
   JOIN public.workspace_members wm ON wm.workspace_id=a.workspace_id
    AND wm.user_id=p_user_id AND wm.active
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE a.id=p_app_id AND
    (public.apsyntra_team_is_system_admin(p_user_id,a.workspace_id)
    OR EXISTS(SELECT 1 FROM access_v2.app_roles r
     JOIN access_v2.app_role_members m ON m.app_role_id=r.id AND m.app_id=r.app_id
     WHERE r.app_id=a.id AND r.is_admin_role AND m.user_id=p_user_id)));
$admin$;

CREATE FUNCTION access_v2.has_app_capability(
 p_user_id uuid,p_app_id uuid,p_feature_key text,p_capability access_v2.capability)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $cap$
 SELECT p_user_id=auth.uid() AND auth.uid() IS NOT NULL
  AND private.ws01_signed_actor_session() IS NOT NULL
  AND EXISTS(SELECT 1 FROM access_v2.apps a
   JOIN public.workspace_members wm ON wm.workspace_id=a.workspace_id
    AND wm.user_id=p_user_id AND wm.active
   JOIN public.profiles p ON p.id=wm.user_id AND p.status='active'
   WHERE a.id=p_app_id AND
    (public.apsyntra_team_is_system_admin(p_user_id,a.workspace_id)
     OR EXISTS(SELECT 1 FROM access_v2.app_role_members m
      JOIN access_v2.app_role_capabilities c
       ON c.app_role_id=m.app_role_id AND c.app_id=m.app_id AND c.allowed
      WHERE m.app_id=a.id AND m.user_id=p_user_id
       AND c.feature_key=p_feature_key AND c.capability=p_capability)));
$cap$;
REVOKE ALL ON FUNCTION
 access_v2.effective_board_role(uuid,uuid),
 access_v2.is_app_admin(uuid,uuid),
 access_v2.has_app_capability(uuid,uuid,text,access_v2.capability)
 FROM PUBLIC,anon,authenticated;
-- Do not grant EXECUTE until RLS owner/BYPASSRLS contract and signed policy
-- acceptance are independently verified. All browser-facing endpoints remain
-- disabled before activation.

COMMIT;
