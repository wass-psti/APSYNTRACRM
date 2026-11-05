-- CP-WS-02D — dormant invitation schema, for isolated acceptance only.
-- Production migration and provider integration require separate approval.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('private.ws01_member_roles') IS NULL
 OR to_regclass('private.ws02d_invitations') IS NOT NULL
 OR to_regclass('private.ws02d_invitation_flags') IS NOT NULL
 OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
 THEN RAISE EXCEPTION 'WS02D missing prerequisite or migration collision'
 USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE private.ws02d_invitation_flags(
 id boolean PRIMARY KEY DEFAULT true CHECK(id IS TRUE),
 enabled boolean NOT NULL DEFAULT false,
 advanced_roles_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws02d_invitation_flags(id) VALUES(true);
CREATE TABLE private.ws02d_member_access(
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN('admin','member','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id)
 REFERENCES public.workspace_members(workspace_id,user_id) ON DELETE CASCADE
);
CREATE TABLE private.ws02d_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 issued_by uuid NOT NULL REFERENCES public.profiles(id),
 issued_session uuid NOT NULL,
 request_id uuid NOT NULL,
 recipient_email text NOT NULL,
 role text NOT NULL CHECK(role IN('admin','member','viewer')),
 token_salt bytea NOT NULL CHECK(octet_length(token_salt)=16),
 token_digest bytea NOT NULL CHECK(octet_length(token_digest)=32),
 state text NOT NULL DEFAULT 'pending'
 CHECK(state IN('pending','accepted','declined','expired','revoked')),
 expires_at timestamptz NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 accepted_by uuid REFERENCES public.profiles(id),
 accepted_at timestamptz,
 revoked_by uuid REFERENCES public.profiles(id),
 revoked_at timestamptz,
 CHECK((state='accepted')=(accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
 UNIQUE(workspace_id,issued_by,request_id)
);
CREATE INDEX ws02d_inv_workspace_state ON private.ws02d_invitations(workspace_id,state,expires_at);
CREATE INDEX ws02d_inv_recipient_state ON private.ws02d_invitations(recipient_email,state,expires_at);
CREATE TABLE private.ws02d_invitation_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invitation_id uuid NOT NULL REFERENCES private.ws02d_invitations(id),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('invitation.issued','invitation.accepted','invitation.revoked')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.ws02d_invitation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02d_member_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02d_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02d_invitation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02d_invitation_flags,private.ws02d_member_access,
 private.ws02d_invitations,private.ws02d_invitation_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws02d_invitation_events_id_seq
 FROM PUBLIC,anon,authenticated;
COMMIT;
