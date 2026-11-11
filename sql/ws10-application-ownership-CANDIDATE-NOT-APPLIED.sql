-- WS10 app ownership registry candidate. NOT INSTALLED, NOT ACTIVE.
-- Existing standalone apps have different membership/RPC policies, some
-- globally keyed. Do not treat this registry as authorization until each
-- module adopts the workspace-scoped owner contract and passes negative tests.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.workspaces') IS NULL OR
    to_regclass('public.workspace_members') IS NULL OR
    to_regclass('private.ws10_application_owners') IS NOT NULL
 THEN RAISE EXCEPTION 'App ownership prerequisites missing or already installed'
  USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE private.ws10_application_owners(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 module_id text NOT NULL CHECK(module_id IN(
  'time-tracker','fueltrack-plus','tradelink','toolbox-issues',
  'fund-released-tracker','fueltrans','order-intake','tool-traceability',
  'material-request-hub','aps-aims','employee-eval','charter-navigator'
 )),
 owner_id uuid NOT NULL,
 owner_revision bigint NOT NULL DEFAULT 1 CHECK(owner_revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,module_id),
 FOREIGN KEY(workspace_id,owner_id)
  REFERENCES public.workspace_members(workspace_id,user_id)
);
CREATE TABLE private.ws10_application_owner_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 prior_owner_id uuid REFERENCES public.profiles(id),
 next_owner_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
ALTER TABLE private.ws10_application_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ws10_application_owner_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws10_application_owners,
 private.ws10_application_owner_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.ws10_application_owner_events_id_seq
 FROM PUBLIC,anon,authenticated;
-- No bootstrap, no assignment to current module admin, no override of
-- domain RLS, no RPC and no public grant. Subsequent per-module migrations
-- must verify exact workspace ownership, actor IT Admin/current app owner,
-- target verified active membership and role ceilings; require CAS revision,
-- append-only audit, and immediate revocation. Default deny until then.
COMMIT;
