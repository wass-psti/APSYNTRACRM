-- CP14. Rehearse observed staging foreign keys and domain vocabularies on
-- temporary tables, against nonproduction disposable auth.users only.
-- No direct writes to staging/public workspaces or signed-user roles.
BEGIN;
CREATE TEMP TABLE cp14_auth_users (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO cp14_auth_users(id)
SELECT id FROM auth.users ORDER BY id LIMIT 2;
CREATE TEMP TABLE cp14_profiles (
 id uuid PRIMARY KEY REFERENCES cp14_auth_users(id),
 email text NOT NULL DEFAULT '',
 display_name text,
 email_verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled'))
) ON COMMIT DROP;
CREATE TEMP TABLE cp14_workspaces (
 id uuid PRIMARY KEY, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
) ON COMMIT DROP;
CREATE TEMP TABLE cp14_members (
 workspace_id uuid NOT NULL REFERENCES cp14_workspaces(id),
 user_id uuid NOT NULL REFERENCES cp14_profiles(id),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id)
) ON COMMIT DROP;
CREATE TEMP TABLE cp14_member_roles (
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 relation text NOT NULL CHECK(relation IN ('owner','member','collaborator')),
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY (workspace_id,user_id) REFERENCES cp14_members(workspace_id,user_id)
 ON DELETE CASCADE
) ON COMMIT DROP;
CREATE TEMP TABLE cp14_invite_member_access (
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','member','viewer')),
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY (workspace_id,user_id) REFERENCES cp14_members(workspace_id,user_id)
 ON DELETE CASCADE
) ON COMMIT DROP;

INSERT INTO cp14_profiles(id,email,status)
SELECT id,'synthetic-'||row_number() OVER (ORDER BY id)||'@example.invalid','active'
FROM cp14_auth_users users;
DO $$
BEGIN
 IF (SELECT count(*) FROM cp14_profiles)<>2
 THEN RAISE EXCEPTION 'Nonproduction local Auth fixture must have two subjects'; END IF;
END $$;
INSERT INTO cp14_workspaces(id,name)
VALUES ('c1400000-0000-4000-8000-000000000001','CP14 staging-shaped workspace');
INSERT INTO cp14_members(workspace_id,user_id)
SELECT 'c1400000-0000-4000-8000-000000000001',id FROM cp14_profiles;
INSERT INTO cp14_member_roles(workspace_id,user_id,relation)
SELECT workspace_id,user_id,
 CASE WHEN row_number() OVER (ORDER BY user_id)=1 THEN 'owner' ELSE 'member' END
FROM cp14_members;
INSERT INTO cp14_invite_member_access(workspace_id,user_id,role)
SELECT workspace_id,user_id,
 CASE WHEN row_number() OVER (ORDER BY user_id)=1 THEN 'admin' ELSE 'viewer' END
FROM cp14_members;

DO $$
BEGIN
 IF (SELECT count(*) FROM cp14_invite_member_access)<>2 OR
    (SELECT count(*) FROM cp14_member_roles)<>2 THEN
    RAISE EXCEPTION 'Staging relationship rehearsal missing rows';
 END IF;
 -- Reject an invented workspace role and an invalid invitation role.
 BEGIN
  UPDATE cp14_member_roles SET relation='crm_admin';
  RAISE EXCEPTION 'Unknown workspace relation was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE cp14_invite_member_access SET role='platform_admin';
  RAISE EXCEPTION 'Unknown invitation role was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;

-- Membership cleanup cascades to both private role analogs.
DELETE FROM cp14_members;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM cp14_member_roles) OR
    EXISTS(SELECT 1 FROM cp14_invite_member_access) THEN
  RAISE EXCEPTION 'Staging role cascade failed';
 END IF;
END $$;
ROLLBACK;
