\set ON_ERROR_STOP on
-- Add only the synthetic FRT writer prerequisites to the existing six-app fixture.
CREATE TABLE public.frt_memberships(workspace_id uuid NOT NULL,user_id uuid NOT NULL,
 role text NOT NULL,enabled boolean NOT NULL,status text NOT NULL,
 updated_at timestamptz NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE OR REPLACE FUNCTION private.frt_signed_session_active() RETURNS boolean
LANGUAGE sql STABLE AS $$SELECT true$$;
