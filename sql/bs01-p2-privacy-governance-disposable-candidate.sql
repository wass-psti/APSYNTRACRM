-- BS01/P2 — policy governance and app-level external-sharing ceiling.
-- STAGING ONLY. Requires sql/bs01-board-guest-sharing-disposable-candidate.sql.
-- Database-name guard deliberately prevents production execution.
BEGIN;
DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regclass('private.bs01_board_policies') IS NULL
  OR to_regclass('private.bs01_guest_grants') IS NULL
  OR to_regclass('private.bs01_links') IS NULL
  OR to_regprocedure('private.bs01_signed_actor()') IS NULL
  OR to_regprocedure('private.bs01_issue_link(uuid,uuid,text)') IS NULL
  OR to_regprocedure('private.bs01_redeem_link(text)') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regprocedure('private.bs01_external_share_eligible(uuid)') IS NOT NULL
  OR to_regclass('private.bs01_policy_events') IS NOT NULL
 THEN RAISE EXCEPTION 'BS01/P2 staged prerequisite or database mismatch'
  USING ERRCODE='42501'; END IF;
END $preflight$;

-- This test-only predicate is an additional MAXIMUM, never a grant.
-- The 12 integrated application boards remain NONSHAREABLE even if a row
-- is manually misconfigured. Each needs a separate app-owned redaction,
-- Storage, RPC, export and audit review before any later allowlist.
CREATE FUNCTION private.bs01_external_share_eligible(p_board uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $eligible$
 SELECT EXISTS(
  SELECT 1 FROM public.work_boards b
  WHERE b.id=p_board AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    -- Stable module board identities resist a rename/description bypass.
    AND b.id NOT IN (
     'b520cefe-6abb-446a-abec-ae5589329a99'::uuid,
     '47df2cdc-503a-4a22-a35c-06f72be5c56b'::uuid,
     'e761b849-f144-4ad2-a418-af9e68b5cc58'::uuid,
     'f36da8fe-8d9d-4629-9938-12533cb3ca39'::uuid,
     '7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid,
     '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid,
     '46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid,
     'd045708b-6e36-4f0a-92fc-f0b8baf93de3'::uuid,
     'd1593528-36a6-4644-82f9-58873d3c136b'::uuid,
     '8219a2a9-be85-479e-af0c-e4a399495f58'::uuid,
     '991d8263-fc7d-49f0-9207-387edd51d299'::uuid,
     '617c4c0f-e343-4b3b-8456-50d47dcbaf99'::uuid)
    AND b.description NOT LIKE '[APSYNTRA:MODULE:%'
    AND pg_catalog.lower(pg_catalog.btrim(b.name)) NOT IN
     ('fueltrans standalone','tool traceability','toolbox issues',
      'fund released tracker','fueltrack+ v3','tradelink',
      'timetracker attendance','order intake','employee evaluation',
      'charter navigator','aps aims','material request hub')
    AND b.name NOT LIKE 'CP-%QA%'
 );
$eligible$;
REVOKE ALL ON FUNCTION private.bs01_external_share_eligible(uuid)
 FROM PUBLIC,anon,authenticated;

-- Every update, including a move to PRIVATE, needs a durable event.
-- Avoid widening the existing bs01_events action enum or privileges.
CREATE TABLE private.bs01_policy_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 previous_mode text NOT NULL
  CHECK(previous_mode IN('private','workspace_restricted','guest_shareable')),
 next_mode text NOT NULL
  CHECK(next_mode IN('private','workspace_restricted','guest_shareable')),
 previous_revision bigint NOT NULL,
 next_revision bigint NOT NULL CHECK(next_revision=previous_revision+1),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.bs01_policy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.bs01_policy_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.bs01_policy_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE private.bs01_policy_events_id_seq
 FROM PUBLIC,anon,authenticated;

-- Reads reveal no user directory or raw invitation secrets. No browser
-- GRANT; an approved JWT-validated trusted server may eventually call it
-- with the genuine end-user's signed database context.
CREATE FUNCTION private.bs01_read_policy(p_board uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $read$
DECLARE actor uuid; v_workspace uuid; v_status text; v_mode text;
 v_enabled boolean:=false; v_eligible boolean:=false; v_can_manage boolean:=false;
BEGIN
 actor:=private.bs01_signed_actor();
 SELECT b.workspace_id,b.status INTO v_workspace,v_status
 FROM public.work_boards b WHERE b.id=p_board;
 IF v_workspace IS NULL OR
  public.current_workspace_id(actor) IS DISTINCT FROM v_workspace
  OR NOT public.work_board_access(p_board,'manage')
 THEN RAISE EXCEPTION 'Board policy access denied' USING ERRCODE='42501'; END IF;
 SELECT p.mode INTO v_mode FROM private.bs01_board_policies p
 WHERE p.board_id=p_board;
 SELECT f.enabled INTO v_enabled FROM private.bs01_flags f WHERE f.id IS TRUE;
 v_eligible:=private.bs01_external_share_eligible(p_board);
 v_can_manage:=EXISTS(SELECT 1 FROM public.profiles p
   WHERE p.id=actor AND p.status='active'
    AND p.platform_role='admin_general_manager');
 RETURN pg_catalog.jsonb_build_object(
  'schemaVersion',1,'boardId',p_board,'workspaceId',v_workspace,
  'externalSharing',coalesce(v_mode,'private'),
  'guestLinksEnabled',coalesce(v_enabled,false) AND v_eligible,
  'mayIssue',coalesce(v_enabled,false) AND v_eligible AND v_can_manage
    AND v_mode='guest_shareable' AND v_status='active');
END $read$;
REVOKE ALL ON FUNCTION private.bs01_read_policy(uuid)
 FROM PUBLIC,anon,authenticated;

-- Server-side CAS with a board-row lock to serialize all policy changes
-- with link issue/redeem. Do not accept a caller-supplied "reviewedBy".
-- Opening external sharing additionally requires general-manager authority,
-- active board manage access, and the resource allowlist. Private and
-- workspace_restricted never change the existing internal board ACL.
CREATE FUNCTION private.bs01_set_policy(
 p_board uuid,p_mode text,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $set$
DECLARE actor uuid; v_workspace uuid; v_old text; v_revision bigint;
 v_next bigint; v_revoke boolean; v_count integer:=0; v_link_count integer:=0;
BEGIN
 actor:=private.bs01_signed_actor();
 IF p_board IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_mode IS NULL OR
  p_mode NOT IN ('private','workspace_restricted','guest_shareable')
 THEN RAISE EXCEPTION 'Invalid policy change' USING ERRCODE='22023'; END IF;
 SELECT b.workspace_id INTO v_workspace FROM public.work_boards b
 WHERE b.id=p_board AND b.status='active' AND b.archived_at IS NULL
   AND b.trashed_at IS NULL FOR UPDATE;
 IF v_workspace IS NULL OR
  public.current_workspace_id(actor) IS DISTINCT FROM v_workspace
  OR NOT public.work_board_access(p_board,'manage')
 THEN RAISE EXCEPTION 'Board management denied' USING ERRCODE='42501'; END IF;
 IF p_mode='guest_shareable' AND (
  NOT private.bs01_external_share_eligible(p_board)
  OR NOT EXISTS(SELECT 1 FROM public.profiles p
    WHERE p.id=actor AND p.status='active'
     AND p.platform_role='admin_general_manager'))
 THEN RAISE EXCEPTION 'External sharing requires independent approval'
   USING ERRCODE='42501'; END IF;

 INSERT INTO private.bs01_board_policies(board_id,mode)
 VALUES(p_board,'private') ON CONFLICT(board_id) DO NOTHING;
 SELECT mode,revision INTO v_old,v_revision
 FROM private.bs01_board_policies WHERE board_id=p_board FOR UPDATE;
 IF v_revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale board privacy revision' USING ERRCODE='40001'; END IF;
 IF v_old=p_mode THEN
  RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
   'boardId',p_board,'externalSharing',v_old,'revision',v_revision,
   'changed',false);
 END IF;
 v_next:=v_revision+1;
 UPDATE private.bs01_board_policies
 SET mode=p_mode,revision=v_next,
   reviewed_by=CASE WHEN p_mode='guest_shareable' THEN actor ELSE NULL END,
   reviewed_at=CASE WHEN p_mode='guest_shareable' THEN now() ELSE NULL END
 WHERE board_id=p_board;
 INSERT INTO private.bs01_policy_events(
  board_id,actor_id,previous_mode,next_mode,previous_revision,next_revision
 ) VALUES(p_board,actor,v_old,p_mode,v_revision,v_next);

 -- On any downgrade revoke unredeemed links AND existing guest grants
 -- under the same transaction, not merely hide the Share button.
 v_revoke:=p_mode<>'guest_shareable';
 IF v_revoke THEN
  WITH affected AS (
   UPDATE private.bs01_links l SET revoked_at=now()
   WHERE l.board_id=p_board AND l.revoked_at IS NULL
   RETURNING l.id
  )
  INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
  SELECT p_board,actor,a.id,'link.revoked' FROM affected a;
  GET DIAGNOSTICS v_link_count=ROW_COUNT;

  WITH affected AS (
   UPDATE private.bs01_guest_grants g
   SET revoked_at=now(),revoked_by=actor
   WHERE g.board_id=p_board AND g.revoked_at IS NULL
   RETURNING g.invitation_id
  )
  INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
  SELECT p_board,actor,a.invitation_id,'grant.revoked' FROM affected a;
  GET DIAGNOSTICS v_count=ROW_COUNT;
 END IF;
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'boardId',p_board,'externalSharing',p_mode,'revision',v_next,
  'changed',true,'linksRevoked',v_link_count,'grantsRevoked',v_count);
END $set$;
REVOKE ALL ON FUNCTION private.bs01_set_policy(uuid,text,bigint)
 FROM PUBLIC,anon,authenticated;

-- Independently revoke an individual guest even if the invitation link
-- itself was already consumed. No ability to reactivate an old grant.
CREATE FUNCTION private.bs01_revoke_guest(p_board uuid,p_guest uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $revoke$
DECLARE actor uuid; v_workspace uuid; v_link uuid; v_changed boolean:=false;
BEGIN
 actor:=private.bs01_signed_actor();
 SELECT b.workspace_id INTO v_workspace FROM public.work_boards b
 WHERE b.id=p_board FOR UPDATE;
 IF v_workspace IS NULL OR p_guest IS NULL OR
  public.current_workspace_id(actor) IS DISTINCT FROM v_workspace OR
  NOT public.work_board_access(p_board,'manage')
 THEN RAISE EXCEPTION 'Guest revocation denied' USING ERRCODE='42501'; END IF;
 UPDATE private.bs01_guest_grants g
 SET revoked_at=now(),revoked_by=actor
 WHERE g.board_id=p_board AND g.user_id=p_guest AND g.revoked_at IS NULL
 RETURNING invitation_id INTO v_link;
 v_changed:=FOUND;
 IF v_changed THEN
  INSERT INTO private.bs01_events(board_id,actor_id,invitation_id,action)
  VALUES(p_board,actor,v_link,'grant.revoked');
 END IF;
 RETURN pg_catalog.jsonb_build_object('schemaVersion',1,
  'boardId',p_board,'revoked',v_changed);
END $revoke$;
REVOKE ALL ON FUNCTION private.bs01_revoke_guest(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- Link issuance and redemption are rechecked at the write boundary.
-- Even an accidentally permissive caller cannot issue for a protected app.
-- This is defense in depth, not a substitute for an authenticated issuer.
CREATE FUNCTION private.bs01_link_policy_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $gate$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.bs01_flags f
   WHERE f.id IS TRUE AND f.enabled IS TRUE)
  OR NOT private.bs01_external_share_eligible(NEW.board_id)
  OR NOT EXISTS(SELECT 1 FROM private.bs01_board_policies p
   WHERE p.board_id=NEW.board_id AND p.mode='guest_shareable'
    AND p.reviewed_by IS NOT NULL AND p.reviewed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Resource not approved for external sharing'
   USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $gate$;
REVOKE ALL ON FUNCTION private.bs01_link_policy_gate()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bs01_before_issue_guard
 BEFORE INSERT ON private.bs01_links FOR EACH ROW
 EXECUTE FUNCTION private.bs01_link_policy_gate();

CREATE FUNCTION private.bs01_grant_policy_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $gate$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.bs01_flags f
   WHERE f.id IS TRUE AND f.enabled IS TRUE)
  OR NOT private.bs01_external_share_eligible(NEW.board_id)
  OR NOT EXISTS(SELECT 1 FROM private.bs01_board_policies p
   WHERE p.board_id=NEW.board_id AND p.mode='guest_shareable'
    AND p.reviewed_by IS NOT NULL AND p.reviewed_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM private.bs01_links l
   WHERE l.id=NEW.invitation_id AND l.board_id=NEW.board_id
    AND l.revoked_at IS NULL AND l.redeemed_by IS NULL
    AND l.expires_at>now())
 THEN RAISE EXCEPTION 'Guest redemption denied by resource policy'
   USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $gate$;
REVOKE ALL ON FUNCTION private.bs01_grant_policy_gate()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bs01_before_guest_grant_guard
 BEFORE INSERT ON private.bs01_guest_grants FOR EACH ROW
 EXECUTE FUNCTION private.bs01_grant_policy_gate();

-- Standalone app and QA fixtures remain unreadable to guests, regardless of
-- a previously redeemed grant or a mistaken guest_read_enabled flag.
-- No expansion of generic work_board_access or independent module RPCs.
CREATE OR REPLACE FUNCTION private.bs01_guest_read_allowed(p_board uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $read$
DECLARE actor uuid;
BEGIN
 BEGIN actor:=private.bs01_signed_actor();
 EXCEPTION WHEN OTHERS THEN RETURN false; END;
 IF actor IS NULL OR NOT private.bs01_external_share_eligible(p_board)
 THEN RETURN false; END IF;
 RETURN EXISTS(
  SELECT 1 FROM private.bs01_guest_grants g
  JOIN private.bs01_links i ON i.id=g.invitation_id
  JOIN private.bs01_board_policies p ON p.board_id=g.board_id
  JOIN public.work_boards b ON b.id=g.board_id
  JOIN private.bs01_flags f ON f.id IS TRUE
  WHERE g.board_id=p_board AND g.user_id=actor AND g.revoked_at IS NULL
    AND i.redeemed_by=actor AND i.revoked_at IS NULL
    AND p.mode='guest_shareable' AND p.reviewed_by IS NOT NULL
    AND p.reviewed_at IS NOT NULL AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND f.enabled IS TRUE AND f.guest_read_enabled IS TRUE);
END $read$;
REVOKE ALL ON FUNCTION private.bs01_guest_read_allowed(uuid)
 FROM PUBLIC,anon,authenticated;

-- No changes to existing internal board ACLs, Auth trigger, Storage policies,
-- or any module RPC; all P2 functions remain private/ungranted.
COMMIT;
