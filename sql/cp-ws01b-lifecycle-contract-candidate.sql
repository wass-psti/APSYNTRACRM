-- CP-WS-01C/B1 — additive private workspace lifecycle SCHEMA ONLY.
-- NEVER execute in production without explicit schema + authorization approval.
-- Existing workspace membership and current_workspace_id are not changed here.
-- No lifecycle RPCs, public creation/switching functions, session cutover or user grants.
BEGIN;
DO $preflight$
BEGIN
 IF to_regnamespace('private') IS NULL
  OR to_regclass('public.workspaces') IS NULL
  OR to_regclass('public.workspace_members') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('auth.sessions') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regclass('private.ws01_workspace_policy') IS NOT NULL
  OR to_regclass('private.ws01_member_roles') IS NOT NULL
  OR to_regclass('private.ws01_create_requests') IS NOT NULL
  OR to_regclass('private.ws01_session_choices') IS NOT NULL
  OR to_regclass('private.ws01_lifecycle_flags') IS NOT NULL
  OR to_regclass('private.ws01_events') IS NOT NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_list()') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-WS-01C/B1 dependencies or migration collision'
  USING ERRCODE='42501';
 END IF;
END $preflight$;

-- Explicit server-only ownership, privacy, and membership distinctions.
-- Legacy workspaces remain unclaimed (no fabricated owner); a missing
-- policy is treated as CLOSED, and missing role as MEMBER.
CREATE TABLE private.ws01_workspace_policy (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
 privacy text NOT NULL DEFAULT 'closed' CHECK (privacy IN ('open','closed')),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws01_member_roles (
 workspace_id uuid NOT NULL,
 user_id uuid NOT NULL,
 relation text NOT NULL CHECK(relation IN ('owner','member','collaborator')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id),
 FOREIGN KEY(workspace_id,user_id)
  REFERENCES public.workspace_members(workspace_id,user_id) ON DELETE CASCADE
);
CREATE TABLE private.ws01_create_requests (
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id),
 requested_name text NOT NULL,
 requested_privacy text NOT NULL CHECK(requested_privacy IN('open','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE private.ws01_session_choices (
 session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws01_lifecycle_flags (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 creation_enabled boolean NOT NULL DEFAULT false,
 selection_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.ws01_lifecycle_flags(id) VALUES(true);
CREATE TABLE private.ws01_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 session_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('workspace.created','workspace.selected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ws01_events_workspace_time ON private.ws01_events(workspace_id,created_at DESC,id DESC);
CREATE INDEX ws01_session_choices_actor ON private.ws01_session_choices(actor_id);

ALTER TABLE private.ws01_workspace_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_create_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_session_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_lifecycle_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws01_events ENABLE ROW LEVEL SECURITY;
-- No user-visible table access. A future separately gated signed RPC must
-- enforce actor/session/membership authorization before accessing these tables.
REVOKE ALL ON private.ws01_workspace_policy,private.ws01_member_roles,
 private.ws01_create_requests,private.ws01_session_choices,
 private.ws01_lifecycle_flags,private.ws01_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws01_events_id_seq FROM PUBLIC,anon,authenticated;
-- This is an additive, disabled schema boundary only.
-- Creation, discovery, and session cutover remain separate gates.
COMMIT;
