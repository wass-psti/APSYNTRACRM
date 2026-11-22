-- CP-TT-OJT-02: Shared OJT email retains its Employee role.
-- Forward correction after 20261123100000_cp_tt_ojt_shared_identities.sql.
-- An OJT department alone does not grant shared-identity privileges.
-- Only the preapproved company account may be explicitly enabled by an admin.
BEGIN;

CREATE OR REPLACE FUNCTION private.tt_ojt_eligible_shared(
 p_workspace_id uuid,p_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 SELECT p_user_id='d613280d-907b-418f-b872-c0f6dd53e580'::uuid
  AND EXISTS(
   SELECT 1 FROM auth.users u
   JOIN public.profiles p ON p.id=u.id
   JOIN public.workspace_members m ON m.user_id=u.id
   JOIN private.tt_employee_departments d
    ON d.workspace_id=m.workspace_id AND d.user_id=u.id
   WHERE u.id=p_user_id
    AND pg_catalog.lower(u.email)='ojt@watchdogautomation.com.ph'
    AND u.email_confirmed_at IS NOT NULL
    AND p.status='active'
    AND m.workspace_id=p_workspace_id AND m.active
    AND d.department='OJT'
  )
  AND public.module_role_for('time-tracker',p_user_id)='Employee'
 $f$;
REVOKE ALL ON FUNCTION private.tt_ojt_eligible_shared(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- Every verification and attendance RPC delegates to this server-side guard.
CREATE OR REPLACE FUNCTION private.tt_ojt_shared(p_board_id uuid)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  IF NOT private.tt_ojt_eligible_shared(v_ws,auth.uid())
   OR NOT EXISTS(
    SELECT 1 FROM private.tt_ojt_shared_accounts g
     WHERE g.workspace_id=v_ws
      AND g.board_id=p_board_id
      AND g.shared_user_id=auth.uid()
      AND g.enabled
   ) THEN
   RAISE EXCEPTION 'Active shared OJT identity required'
    USING ERRCODE='42501';
  END IF;
  RETURN v_ws;
 END $f$;

-- Only authorized TimeTracker administrators can explicitly designate the
-- approved account. Disabling an already configured account remains possible
-- even if its role or department changed after activation.
CREATE OR REPLACE FUNCTION public.timetracker_ojt_group_set(
 p_board_id uuid,p_shared_user_id uuid,p_enabled boolean)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;
 BEGIN
  v_ws:=private.tt_ojt_admin(p_board_id);
  IF p_shared_user_id IS NULL OR p_enabled IS NULL THEN
   RAISE EXCEPTION 'OJT account and status are required'
    USING ERRCODE='22023';
  END IF;
  IF p_enabled AND NOT private.tt_ojt_eligible_shared(v_ws,p_shared_user_id) THEN
   RAISE EXCEPTION 'Only the verified Employee account in the OJT department can be enabled'
    USING ERRCODE='42501';
  END IF;
  IF NOT p_enabled AND NOT EXISTS(
    SELECT 1 FROM private.tt_ojt_shared_accounts g
    WHERE g.workspace_id=v_ws AND g.board_id=p_board_id
     AND g.shared_user_id=p_shared_user_id
  ) THEN
   RAISE EXCEPTION 'The OJT account is not configured on this board'
    USING ERRCODE='42501';
  END IF;

  INSERT INTO private.tt_ojt_shared_accounts
    (workspace_id,board_id,shared_user_id,enabled,updated_by)
  VALUES(v_ws,p_board_id,p_shared_user_id,p_enabled,auth.uid())
  ON CONFLICT(workspace_id,board_id,shared_user_id) DO UPDATE
   SET enabled=excluded.enabled,updated_by=excluded.updated_by,
       updated_at=clock_timestamp();

  IF NOT p_enabled THEN
   UPDATE private.tt_ojt_sessions SET revoked_at=clock_timestamp()
   WHERE workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=p_shared_user_id AND revoked_at IS NULL;
  END IF;
  INSERT INTO private.tt_ojt_audit(workspace_id,board_id,actor_id,action)
   VALUES(v_ws,p_board_id,auth.uid(),
    CASE WHEN p_enabled THEN 'group_enabled' ELSE 'group_disabled' END);

  RETURN jsonb_build_object('contract','tt-ojt-admin-write-1',
   'workspaceId',v_ws::text,'boardId',p_board_id::text,
   'userId',p_shared_user_id::text,'enabled',p_enabled);
 END $f$;

-- A shared group that has lost its Employee/OJT eligibility is reported as
-- disabled, not as an active roster. An unconfigured account stays PERSONAL.
CREATE OR REPLACE FUNCTION public.timetracker_ojt_roster(p_board_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
 AS $f$
 DECLARE v_ws uuid;v_enabled boolean;v_effective boolean;
 BEGIN
  v_ws:=private.tt_ojt_scope(p_board_id);
  SELECT enabled INTO v_enabled FROM private.tt_ojt_shared_accounts
   WHERE workspace_id=v_ws AND board_id=p_board_id
    AND shared_user_id=auth.uid();
  IF NOT FOUND THEN
   RETURN jsonb_build_object('contract','tt-ojt-roster-1',
    'actorId',auth.uid()::text,'workspaceId',v_ws::text,
    'boardId',p_board_id::text,'mode','PERSONAL','interns','[]'::jsonb);
  END IF;
  v_effective:=v_enabled AND private.tt_ojt_eligible_shared(v_ws,auth.uid());
  RETURN jsonb_build_object('contract','tt-ojt-roster-1',
   'actorId',auth.uid()::text,'workspaceId',v_ws::text,
   'boardId',p_board_id::text,
   'mode',CASE WHEN v_effective THEN 'SHARED_LOGIN' ELSE 'SHARED_DISABLED' END,
   'interns',CASE WHEN NOT v_effective THEN '[]'::jsonb ELSE
    coalesce((
     SELECT jsonb_agg(
      jsonb_build_object('id',id::text,'name',display_name)
      ORDER BY display_name,id)
     FROM private.tt_ojt_interns
     WHERE workspace_id=v_ws AND board_id=p_board_id
      AND shared_user_id=auth.uid() AND active
    ),'[]'::jsonb) END);
 END $f$;

-- Legacy attendance uses a workspace-level JSON row and has no board_id column.
-- Block it for a configured shared account by workspace and signed actor,
-- instead of a hard-coded board UUID. This also covers disabled groups.
CREATE OR REPLACE FUNCTION private.tt_ojt_block_legacy_clock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $f$
 BEGIN
  IF auth.uid() IS NOT NULL
    AND NEW.module_id='time-tracker'
    AND NEW.state_key='timetracker.attendance.v1'
    AND NEW.scope='shared'
    AND NEW.owner_key='*'
    AND EXISTS(
     SELECT 1 FROM private.tt_ojt_shared_accounts g
      WHERE g.workspace_id=NEW.workspace_id
       AND g.shared_user_id=auth.uid()
    ) THEN
   RAISE EXCEPTION 'Use an individually verified OJT attendance identity'
    USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END $f$;

-- A previously enabled group with the obsolete OJT module role must not
-- retain an already issued identity bearer after this policy change.
UPDATE private.tt_ojt_sessions s SET revoked_at=clock_timestamp()
 WHERE revoked_at IS NULL
  AND NOT private.tt_ojt_eligible_shared(s.workspace_id,s.shared_user_id);

REVOKE ALL ON FUNCTION private.tt_ojt_shared(uuid),
 private.tt_ojt_block_legacy_clock() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_roster(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.timetracker_ojt_group_set(uuid,uuid,boolean),
 public.timetracker_ojt_roster(uuid) TO authenticated;
COMMIT;
