-- WS02D delivery reconciliation ledger — STAGING CANDIDATE / DEFAULT-OFF.
-- Apply only after all six existing WS02D/WS11/BS11 SQL candidates in an
-- isolated Supabase environment. Does not alter any existing authorization
-- policy, invitation flag, or browser grant.
BEGIN;

DO $guard$
BEGIN
  IF to_regclass('private.ws02d_invitations') IS NULL
   OR to_regprocedure('private.ws02d_sender_authorized(uuid,uuid)') IS NULL
   OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
   OR to_regprocedure('private.ws11_list_invitations(uuid)') IS NULL
   OR to_regclass('private.ws02d_invitation_delivery') IS NOT NULL
  THEN
    RAISE EXCEPTION 'WS02D delivery prerequisites missing or migration collision'
      USING ERRCODE='42501';
  END IF;
END $guard$;

-- No bearer token or plaintext acceptance URL is ever persisted here.
-- The original invitation's salted token digest remains authoritative.
CREATE TABLE private.ws02d_invitation_delivery (
  invitation_id uuid PRIMARY KEY
    REFERENCES private.ws02d_invitations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  issuer_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('prepared','submitted','uncertain','rejected')),
  provider_email_id text CHECK (
    provider_email_id IS NULL OR
    (length(provider_email_id) BETWEEN 1 AND 128 AND
     provider_email_id ~ '^[a-zA-Z0-9_-]+$')
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'submitted' OR provider_email_id IS NOT NULL)
);

CREATE INDEX ws02d_delivery_workspace
  ON private.ws02d_invitation_delivery(workspace_id, updated_at DESC);
ALTER TABLE private.ws02d_invitation_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ws02d_invitation_delivery FROM PUBLIC, anon, authenticated;

-- Idempotent transaction-local registration immediately after ws02d_issue().
-- If the Edge process dies before contacting Resend, state stays 'prepared'
-- and can be reconciled/revoked by an authorized manager without reissuing.
CREATE FUNCTION private.ws02d_delivery_prepare(
  p_workspace uuid, p_invitation uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_sid uuid;
  v_row private.ws02d_invitation_delivery%ROWTYPE;
BEGIN
  v_sid := private.ws01_signed_actor_session();
  IF v_sid IS NULL OR NOT private.ws02d_sender_authorized(p_workspace,v_actor)
    OR NOT EXISTS (
      SELECT 1 FROM private.ws02d_invitations i
      WHERE i.id=p_invitation AND i.workspace_id=p_workspace
        AND i.issued_by=v_actor AND i.request_id=p_request
    )
  THEN RAISE EXCEPTION 'Delivery preparation denied' USING ERRCODE='42501'; END IF;

  INSERT INTO private.ws02d_invitation_delivery(
    invitation_id,workspace_id,issuer_id,request_id
  ) VALUES(p_invitation,p_workspace,v_actor,p_request)
  ON CONFLICT(invitation_id) DO NOTHING;

  SELECT * INTO v_row FROM private.ws02d_invitation_delivery
    WHERE invitation_id=p_invitation AND workspace_id=p_workspace
      AND issuer_id=v_actor AND request_id=p_request;
  IF NOT FOUND
  THEN RAISE EXCEPTION 'Conflicting delivery request' USING ERRCODE='40001'; END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invitationId',p_invitation,'deliveryState',v_row.state,
    'providerEmailId',v_row.provider_email_id);
END $fn$;
REVOKE ALL ON FUNCTION private.ws02d_delivery_prepare(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;

-- Only the verified issuer, still authorized for the same workspace, may
-- record the provider's response. A submitted response cannot be downgraded.
CREATE FUNCTION private.ws02d_delivery_record(
  p_workspace uuid, p_invitation uuid, p_outcome text, p_provider_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_sid uuid;
  v_row private.ws02d_invitation_delivery%ROWTYPE;
BEGIN
  v_sid := private.ws01_signed_actor_session();
  IF v_sid IS NULL OR NOT private.ws02d_sender_authorized(p_workspace,v_actor)
    OR p_outcome NOT IN ('submitted','uncertain','rejected')
    OR (p_outcome='submitted' AND (
      p_provider_id IS NULL OR length(p_provider_id) NOT BETWEEN 1 AND 128
      OR p_provider_id !~ '^[a-zA-Z0-9_-]+$'
    ))
    OR (p_outcome<>'submitted' AND p_provider_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Delivery outcome denied' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_row FROM private.ws02d_invitation_delivery
    WHERE invitation_id=p_invitation AND workspace_id=p_workspace
      AND issuer_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing delivery record' USING ERRCODE='42501'; END IF;

  IF v_row.state = 'submitted' THEN
    IF p_outcome IS DISTINCT FROM 'submitted'
       OR v_row.provider_email_id IS DISTINCT FROM p_provider_id
    THEN RAISE EXCEPTION 'Delivery already submitted' USING ERRCODE='40001'; END IF;
  ELSIF v_row.state IN ('uncertain','rejected') THEN
    -- Never silently replace a provider outcome; reconcile manually.
    IF v_row.state IS DISTINCT FROM p_outcome
    THEN RAISE EXCEPTION 'Delivery reconciliation required' USING ERRCODE='40001'; END IF;
  ELSE
    UPDATE private.ws02d_invitation_delivery SET
      state=p_outcome,provider_email_id=p_provider_id,updated_at=now()
    WHERE invitation_id=p_invitation;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'invitationId',p_invitation,'deliveryState',p_outcome,
    'providerEmailId',p_provider_id);
END $fn$;
REVOKE ALL ON FUNCTION private.ws02d_delivery_record(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;

-- Owner/authorized inviter-only view, for safe manual reconciliation.
-- A status of 'submitted' means API acceptance, NOT inbox delivery.
CREATE FUNCTION private.ws02d_delivery_list(p_workspace uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_sid uuid;
  v_result jsonb;
BEGIN
  v_sid := private.ws01_signed_actor_session();
  IF v_sid IS NULL OR NOT private.ws02d_sender_authorized(p_workspace,v_actor)
  THEN RAISE EXCEPTION 'Delivery listing denied' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'invitationId',d.invitation_id,
     'deliveryState',d.state,
     'providerEmailId',d.provider_email_id,
     'updatedAt',pg_catalog.to_char(d.updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )), '[]'::jsonb) INTO v_result
  FROM private.ws02d_invitation_delivery d
  WHERE d.invitation_id IN (
     SELECT i.id FROM private.ws02d_invitations i
     WHERE i.workspace_id=p_workspace
     ORDER BY i.issued_at DESC,i.id DESC LIMIT 100
  );
  RETURN pg_catalog.jsonb_build_object(
    'workspaceId',p_workspace,'delivery',v_result);
END $fn$;
REVOKE ALL ON FUNCTION private.ws02d_delivery_list(uuid)
  FROM PUBLIC,anon,authenticated;

COMMIT;
