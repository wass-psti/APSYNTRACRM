-- CP-WS-02B: private, dormant Main Workspace provisioning contract.
-- DISPOSABLE TEST / REVIEW CANDIDATE ONLY.
-- DO NOT run against production before replacing legacy signup/role/membership
-- triggers, approved onboarding-policy migration and signed-user validation.
-- This candidate does NOT install an auth.users trigger or grant client EXECUTE.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('private.ws01_workspace_policy') IS NULL
  OR to_regclass('private.ws01_member_roles') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('auth.users') IS NULL
  OR to_regclass('private.ws02_new_account_admissions') IS NOT NULL
  OR to_regclass('private.ws02_personal_workspaces') IS NOT NULL
  OR to_regclass('private.ws02_provision_events') IS NOT NULL
  OR to_regprocedure('private.ws02_provision_main_workspace(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02B unavailable dependencies or migration collision'
  USING ERRCODE='42501';
 END IF;
END $pre$;

-- Only a hardened future signup trigger may mark genuinely new identities.
-- No historical users are inserted or retroactively marked eligible.
CREATE TABLE private.ws02_new_account_admissions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.ws02_personal_workspaces (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE RESTRICT,
 provisioned_at timestamptz NOT NULL DEFAULT now()
);
-- Signup verification may run before an authenticated GoTrue browser session
-- exists; never forge a session_id in the older ws01_events ledger.
CREATE TABLE private.ws02_provision_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action='workspace.main.provisioned'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,action)
);
CREATE INDEX ws02_provision_events_user_time ON
 private.ws02_provision_events(user_id,occurred_at DESC);

ALTER TABLE private.ws02_new_account_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02_personal_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws02_provision_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.ws02_new_account_admissions,
 private.ws02_personal_workspaces,private.ws02_provision_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws02_provision_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- Trusted trigger/backend-only helper: no API client may call it.
-- An admission entry is created ONLY for new signup under the future
-- hardened registration trigger. Existing user accounts have no such entry.
CREATE FUNCTION private.ws02_provision_main_workspace(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $provision$
DECLARE
 v_existing uuid;
 v_workspace uuid;
 v_profile text;
 v_active boolean;
BEGIN
 IF p_user_id IS NULL
  OR NOT EXISTS (
   SELECT 1 FROM private.ws02_new_account_admissions a
   WHERE a.user_id=p_user_id
  )
  OR NOT EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL
    AND u.is_anonymous IS FALSE
  )
 THEN RAISE EXCEPTION 'Main Workspace provisioning denied'
  USING ERRCODE='42501'; END IF;

 -- Row lock serializes concurrent verification/recovery for this one account.
 SELECT p.status INTO v_profile FROM public.profiles p
 WHERE p.id=p_user_id FOR UPDATE;
 IF v_profile IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Active verified profile required'
   USING ERRCODE='42501';
 END IF;

 SELECT l.workspace_id INTO v_existing
 FROM private.ws02_personal_workspaces l
 WHERE l.user_id=p_user_id;
 IF FOUND THEN
  -- Never reactivate an intentionally removed workspace membership.
  SELECT m.active INTO v_active FROM public.workspace_members m
  WHERE m.workspace_id=v_existing AND m.user_id=p_user_id;
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'workspaceId',v_existing,'idempotent',true,
   'membershipActive',coalesce(v_active,false));
 END IF;

 v_workspace:=gen_random_uuid();
 INSERT INTO public.workspaces(id,name)
 VALUES(v_workspace,'Main Workspace');
 INSERT INTO public.workspace_members(workspace_id,user_id,active)
 VALUES(v_workspace,p_user_id,true);
 INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
 VALUES(v_workspace,'closed',p_user_id);
 INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES(v_workspace,p_user_id,'owner');
 INSERT INTO private.ws02_personal_workspaces(user_id,workspace_id)
 VALUES(p_user_id,v_workspace);
 INSERT INTO private.ws02_provision_events(workspace_id,user_id,action)
 VALUES(v_workspace,p_user_id,'workspace.main.provisioned');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'workspaceId',v_workspace,'idempotent',false,'membershipActive',true);
END $provision$;
REVOKE ALL ON FUNCTION private.ws02_provision_main_workspace(uuid)
 FROM PUBLIC,anon,authenticated;
-- No trigger, authenticated function grant, or existing-account backfill.
COMMIT;
