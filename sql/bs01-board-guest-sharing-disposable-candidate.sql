-- BS01 BOARD/APPLICATION GUEST SHARING: DISPOSABLE DEVELOPMENT SCHEMA.
-- IMPORTANT: This is a *staged* SQL candidate, never deploy to the shared
-- WatchdogWorkspace Supabase project. No frontend or authenticated grants.
-- Existing board ACLs, workspace membership, module RPCs, Storage, Auth
-- triggers, registration and platform roles are NOT modified.
BEGIN;
DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable' THEN
  RAISE EXCEPTION 'BS01 migration only allowed in named disposable test database' USING ERRCODE='42501';
 END IF;
 IF to_regclass('public.work_boards') IS NULL
   OR to_regclass('public.profiles') IS NULL
   OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
   OR to_regclass('auth.sessions') IS NULL
   OR to_regclass('auth.users') IS NULL
   OR to_regclass('private.bs01_board_policies') IS NOT NULL
   OR to_regprocedure('extensions.digest(bytea,text)') IS NULL
   OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
  RAISE EXCEPTION 'BS01 prerequisites missing or migration already installed' USING ERRCODE='42501';
 END IF;
END $preflight$;

-- Every board, including an application-backed board, starts PRIVATE.
-- Authoritative policy is server-side; the UI does not classify access.
CREATE TABLE private.bs01_board_policies (
 board_id uuid PRIMARY KEY REFERENCES public.work_boards(id) ON DELETE CASCADE,
 mode text NOT NULL DEFAULT 'private'
   CHECK (mode IN ('private','workspace_restricted','guest_shareable')),
 reviewed_by uuid REFERENCES public.profiles(id),
 reviewed_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK (mode<>'guest_shareable' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE private.bs01_flags (
 id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
 enabled boolean NOT NULL DEFAULT false,
 guest_read_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.bs01_flags(id) VALUES(true);

CREATE TABLE private.bs01_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 issued_by uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL,
 token_salt bytea NOT NULL CHECK(octet_length(token_salt)=16),
 token_digest bytea NOT NULL CHECK(octet_length(token_digest)=32),
 recipient_email text,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 redeemed_by uuid REFERENCES public.profiles(id),
 redeemed_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '24 hours'),
 CHECK((redeemed_by IS NULL)=(redeemed_at IS NULL)),
 CHECK(recipient_email IS NULL OR (length(recipient_email) BETWEEN 3 AND 254)),
 UNIQUE(board_id,issued_by,request_id)
);
CREATE INDEX bs01_links_board_pending ON private.bs01_links(board_id,expires_at)
 WHERE redeemed_by IS NULL AND revoked_at IS NULL;
CREATE TABLE private.bs01_guest_grants (
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 invitation_id uuid NOT NULL REFERENCES private.bs01_links(id),
 role text NOT NULL DEFAULT 'viewer' CHECK(role='viewer'),
 issued_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revoked_by uuid REFERENCES public.profiles(id),
 PRIMARY KEY(board_id,user_id),
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE TABLE private.bs01_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 invitation_id uuid REFERENCES private.bs01_links(id),
 action text NOT NULL CHECK(action IN
  ('link.issued','link.redeemed','link.revoked','grant.revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.bs01_board_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_guest_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_board_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_links FORCE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_guest_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.bs01_board_policies,private.bs01_flags,
 private.bs01_links,private.bs01_guest_grants,private.bs01_events
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.bs01_events_id_seq FROM PUBLIC,anon,authenticated;

-- Dedicated Auth check: unlike ws01_signed_actor_session, it does not
-- require membership in the board's workspace (essential for external guests).
-- Do not expose it as an RPC.
CREATE FUNCTION private.bs01_signed_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid:=auth.uid(); sid_text text:=auth.jwt()->>'session_id';
 sid uuid;
BEGIN
 IF actor IS NULL OR sid_text IS NULL OR sid_text !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR NOT private.wm_board_config_session_active()
 THEN RAISE EXCEPTION 'Signed guest session denied' USING ERRCODE='42501'; END IF;
 sid:=sid_text::uuid;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s
   JOIN auth.users u ON u.id=s.user_id
   JOIN public.profiles p ON p.id=u.id
   WHERE s.id=sid AND s.user_id=actor
    AND (s.not_after IS NULL OR s.not_after>now())
    AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE
    AND p.status='active')
 THEN RAISE EXCEPTION 'Verified guest session denied' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $body$;

-- Issuance requires existing MANAGE rights AND an explicit reviewed policy.
-- Private policy rows and flags default OFF; the raw token is only returned once.
CREATE FUNCTION private.bs01_issue_link(
 p_board uuid,p_request uuid,p_recipient_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid; v_token text; v_salt bytea; v_link uuid;
 v_workspace uuid; v_status text; v_email text;
BEGIN
 actor:=private.bs01_signed_actor();
 IF p_board IS NULL OR p_request IS NULL THEN
  RAISE EXCEPTION 'Invalid sharing request' USING ERRCODE='22023'; END IF;
 SELECT b.workspace_id,b.status INTO v_workspace,v_status
 FROM public.work_boards b WHERE b.id=p_board;
 IF v_workspace IS NULL OR v_status<>'active'
  OR public.current_workspace_id(actor) IS DISTINCT FROM v_workspace
  OR NOT public.work_board_access(p_board,'manage')
  OR NOT EXISTS(SELECT 1 FROM private.bs01_flags
   WHERE id IS TRUE AND enabled IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM private.bs01_board_policies
   WHERE board_id=p_board AND mode='guest_shareable' AND reviewed_by IS NOT NULL)
 THEN RAISE EXCEPTION 'Board guest sharing denied' USING ERRCODE='42501'; END IF;
 v_email:=nullif(pg_catalog.lower(pg_catalog.btrim(p_recipient_email)),'');
 IF v_email IS NOT NULL AND
   (length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
 THEN RAISE EXCEPTION 'Invalid invitation recipient' USING ERRCODE='22023'; END IF;
 -- Lock the board row to serialize request issuance and policy rechecks.
 PERFORM 1 FROM public.work_boards WHERE id=p_board FOR UPDATE;
 IF EXISTS(SELECT 1 FROM private.bs01_links
   WHERE board_id=p_board AND issued_by=actor AND request_id=p_request)
 THEN RAISE EXCEPTION 'Existing link cannot disclose original token' USING ERRCODE='42501'; END IF;
 v_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 v_salt:=extensions.gen_random_bytes(16);
 INSERT INTO private.bs01_links(board_id,issued_by,request_id,
   token_salt,token_digest,recipient_email,expires_at)
 VALUES(p_board,actor,p_request,v_salt,
   extensions.digest(v_salt||pg_catalog.decode(v_token,'hex'),'sha256'),
   v_email,now()+interval '24 hours') RETURNING id INTO v_link;
 INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
 VALUES(p_board,actor,v_link,'link.issued');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,'invitationId',v_link,
   'state','issued','token',v_link::text||'.'||v_token);
END $body$;

-- Redeem exactly once; never create workspace membership, platform grants
-- or module permissions. The grant is only a *candidate* until dedicated
-- field-safe guest read API/Storage/RPC coverage has been independently tested.
CREATE FUNCTION private.bs01_redeem_link(p_token text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid; v_id uuid; v_secret text; v_inv private.bs01_links%ROWTYPE;
 v_email text; v_workspace uuid; v_status text;
BEGIN
 actor:=private.bs01_signed_actor();
 IF p_token IS NULL OR length(p_token)<>101
  OR p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.][0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE='42501'; END IF;
 v_id:=split_part(p_token,'.',1)::uuid;
 v_secret:=split_part(p_token,'.',2);
 SELECT * INTO v_inv FROM private.bs01_links WHERE id=v_id FOR UPDATE;
 IF NOT FOUND OR v_inv.revoked_at IS NOT NULL
  OR v_inv.redeemed_by IS NOT NULL OR v_inv.expires_at<=now()
  OR extensions.digest(v_inv.token_salt||pg_catalog.decode(v_secret,'hex'),'sha256')
   IS DISTINCT FROM v_inv.token_digest
  OR NOT EXISTS(SELECT 1 FROM private.bs01_flags
    WHERE id IS TRUE AND enabled IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM private.bs01_board_policies
    WHERE board_id=v_inv.board_id AND mode='guest_shareable' AND reviewed_by IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid or expired invitation' USING ERRCODE='42501'; END IF;
 SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
 WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS FALSE;
 IF v_email IS NULL OR
  (v_inv.recipient_email IS NOT NULL AND v_email<>v_inv.recipient_email)
 THEN RAISE EXCEPTION 'Recipient denied' USING ERRCODE='42501'; END IF;
 SELECT b.workspace_id,b.status INTO v_workspace,v_status
 FROM public.work_boards b WHERE b.id=v_inv.board_id;
 IF v_workspace IS NULL OR v_status<>'active'
 THEN RAISE EXCEPTION 'Unavailable board' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM private.bs01_guest_grants g
   WHERE g.board_id=v_inv.board_id AND g.user_id=actor)
 THEN RAISE EXCEPTION 'Existing guest access cannot be reassigned' USING ERRCODE='42501'; END IF;
 INSERT INTO private.bs01_guest_grants(board_id,user_id,invitation_id)
 VALUES(v_inv.board_id,actor,v_inv.id);
 UPDATE private.bs01_links SET redeemed_by=actor,redeemed_at=now()
 WHERE id=v_inv.id;
 INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
 VALUES(v_inv.board_id,actor,v_inv.id,'link.redeemed');
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'state','redeemed','boardId',v_inv.board_id,'role','viewer',
  'workspaceMembershipGranted',false);
END $body$;

-- This predicate is the future *upper bound* for a dedicated, scoped guest
-- reader. It is NOT wired into generic work_board_access or module RPCs.
CREATE FUNCTION private.bs01_guest_read_allowed(p_board uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid;
BEGIN
 BEGIN actor:=private.bs01_signed_actor();
 EXCEPTION WHEN OTHERS THEN RETURN false; END;
 RETURN actor IS NOT NULL AND EXISTS(
  SELECT 1 FROM private.bs01_guest_grants g
  JOIN private.bs01_links i ON i.id=g.invitation_id
  JOIN private.bs01_board_policies p ON p.board_id=g.board_id
  JOIN public.work_boards b ON b.id=g.board_id
  JOIN private.bs01_flags f ON f.id IS TRUE
  WHERE g.board_id=p_board AND g.user_id=actor AND g.revoked_at IS NULL
    AND i.redeemed_by=actor AND i.revoked_at IS NULL
    AND p.mode='guest_shareable' AND p.reviewed_by IS NOT NULL
    AND b.status='active' AND f.enabled IS TRUE AND f.guest_read_enabled IS TRUE);
END $body$;

CREATE FUNCTION private.bs01_revoke_link(p_link uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $body$
DECLARE actor uuid; v_board uuid; v_ws uuid;
BEGIN
 actor:=private.bs01_signed_actor();
 SELECT i.board_id,b.workspace_id INTO v_board,v_ws
 FROM private.bs01_links i JOIN public.work_boards b ON b.id=i.board_id
 WHERE i.id=p_link FOR UPDATE OF i;
 IF v_board IS NULL OR public.current_workspace_id(actor) IS DISTINCT FROM v_ws
  OR NOT public.work_board_access(v_board,'manage')
 THEN RAISE EXCEPTION 'Revoke denied' USING ERRCODE='42501'; END IF;
 UPDATE private.bs01_links SET revoked_at=now()
 WHERE id=p_link AND revoked_at IS NULL;
 IF FOUND THEN
  INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
  VALUES(v_board,actor,p_link,'link.revoked');
 END IF;
END $body$;

-- Absolutely no callable browser RPC, guest read view or public table access.
-- Activation will require a separate signed trusted server adapter and approved
-- field-level projections. These functions stay ungranted until then.
REVOKE ALL ON FUNCTION private.bs01_signed_actor() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bs01_issue_link(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bs01_redeem_link(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bs01_guest_read_allowed(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.bs01_revoke_link(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
