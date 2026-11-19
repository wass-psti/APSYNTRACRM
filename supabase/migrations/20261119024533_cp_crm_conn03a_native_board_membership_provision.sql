-- CP-CRM-CONN-03A: keep native board visibility aligned with existing app assignments.
-- No RLS changes, no privilege elevation, no new boards. Only canonical viewer rows.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.crm_native_board_provision (
  board_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  module_id text NOT NULL,
  membership_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (board_id, user_id),
  FOREIGN KEY (board_id, user_id)
    REFERENCES public.work_board_members(board_id, user_id) ON DELETE CASCADE,
  CHECK (module_id IN
    ('time-tracker','fund-released-tracker','fueltrack-plus','tradelink'))
);
ALTER TABLE private.crm_native_board_provision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.crm_native_board_provision FROM PUBLIC, anon, authenticated;

-- This private function is used only by database triggers and the bounded backfill.
-- Existing owner/editor/viewer grants without our provenance remain independent.
CREATE FUNCTION private.crm_native_board_sync(p_user_id uuid, p_module_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $sync$
DECLARE
  v_board uuid;
  v_name text;
  v_workspace uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_existing public.work_board_members%ROWTYPE;
  v_provision private.crm_native_board_provision%ROWTYPE;
  v_enabled boolean := false;
  v_scoped_enabled boolean;
  v_scoped_role text;
  v_role text;
BEGIN
  v_board := CASE p_module_id
    WHEN 'time-tracker' THEN '46bf4ee7-368a-4c35-842c-8593ea1f6ac3'::uuid
    WHEN 'fund-released-tracker' THEN 'f36da8fe-8d9d-4629-9938-12533cb3ca39'::uuid
    WHEN 'fueltrack-plus' THEN '7af78b3f-67bf-4600-9aa1-9006d19d486e'::uuid
    WHEN 'tradelink' THEN '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
    ELSE NULL
  END;
  v_name := CASE p_module_id
    WHEN 'time-tracker' THEN 'TimeTracker Attendance'
    WHEN 'fund-released-tracker' THEN 'Fund Released Tracker'
    WHEN 'fueltrack-plus' THEN 'FuelTrack+ v3'
    WHEN 'tradelink' THEN 'TradeLink'
    ELSE NULL END;
  IF v_board IS NULL OR p_user_id IS NULL THEN RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('crm-native:'||v_board::text||':'||p_user_id::text,0));

  -- Never select a similarly named, archived, trashed or foreign-workspace board.
  IF NOT EXISTS (SELECT 1 FROM public.work_boards b
      WHERE b.id=v_board AND b.workspace_id=v_workspace AND b.name=v_name
        AND b.status='active' AND b.archived_at IS NULL AND b.trashed_at IS NULL)
  THEN RETURN; END IF;

  SELECT * INTO v_existing FROM public.work_board_members
    WHERE board_id=v_board AND user_id=p_user_id FOR UPDATE;
  SELECT * INTO v_provision FROM private.crm_native_board_provision
    WHERE board_id=v_board AND user_id=p_user_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.workspace_members wm ON wm.user_id=p.id
        AND wm.workspace_id=v_workspace AND wm.active IS TRUE
      WHERE p.id=p_user_id AND p.status='active')
    AND (SELECT count(*) FROM public.workspace_members w
      WHERE w.user_id=p_user_id AND w.active IS TRUE)=1
    AND NOT public.is_platform_admin(p_user_id)
    AND NOT EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
      WHERE b.user_id=p_user_id)
  THEN
    SELECT m.enabled, m.role INTO v_enabled, v_role
    FROM public.module_role_assignments m
    WHERE m.user_id=p_user_id AND m.module_id=p_module_id;
    v_enabled := coalesce(v_enabled,false);

    -- An explicit workspace-scoped assignment overrides the legacy global row.
    SELECT s.enabled, s.role INTO v_scoped_enabled, v_scoped_role
    FROM public.apsyntra_workspace_module_roles s
    WHERE s.workspace_id=v_workspace AND s.user_id=p_user_id
      AND s.module_id=p_module_id;
    IF FOUND THEN
      v_enabled:=coalesce(v_scoped_enabled,false);
      v_role:=v_scoped_role;
    END IF;

    -- The FRT workspace membership is authoritative when present, even if disabled.
    IF p_module_id='fund-released-tracker' THEN
      SELECT f.enabled AND f.status='active', f.role
      INTO v_scoped_enabled,v_scoped_role
      FROM public.frt_memberships f
      WHERE f.workspace_id=v_workspace AND f.user_id=p_user_id;
      IF FOUND THEN
        v_enabled:=coalesce(v_scoped_enabled,false);
        v_role:=v_scoped_role;
      END IF;
    END IF;

    -- Existing CRM role ceiling is not replaced or broadened.
    IF v_enabled AND public.apsyntra_crm_explicit_role(p_user_id,v_workspace) IS NOT NULL
       AND (public.apsyntra_crm_module_role_rank(p_module_id,v_role) IS NULL
         OR public.apsyntra_crm_module_role_rank(p_module_id,v_role) >
            public.apsyntra_crm_role_rank(
              public.apsyntra_crm_effective_role(p_user_id,v_workspace)))
    THEN v_enabled:=false; END IF;
  END IF;

  IF v_enabled THEN
    IF v_existing.user_id IS NULL THEN
      INSERT INTO public.work_board_members(board_id,user_id,role,added_by,updated_at)
      VALUES(v_board,p_user_id,'viewer',NULL,clock_timestamp())
      ON CONFLICT(board_id,user_id) DO NOTHING
      RETURNING * INTO v_existing;
      IF v_existing.user_id IS NOT NULL THEN
        INSERT INTO private.crm_native_board_provision(
          board_id,user_id,workspace_id,module_id,membership_updated_at)
        VALUES(v_board,p_user_id,v_workspace,p_module_id,v_existing.updated_at)
        ON CONFLICT(board_id,user_id) DO NOTHING;
      END IF;
    END IF;
  ELSIF v_provision.user_id IS NOT NULL THEN
    -- A manual edit/regrant changes membership revision; never revoke that grant.
    IF v_existing.role='viewer'
       AND v_existing.updated_at=v_provision.membership_updated_at THEN
      DELETE FROM public.work_board_members
      WHERE board_id=v_board AND user_id=p_user_id
        AND role='viewer' AND updated_at=v_provision.membership_updated_at;
    END IF;
    DELETE FROM private.crm_native_board_provision
      WHERE board_id=v_board AND user_id=p_user_id;
  END IF;
END;
$sync$;
REVOKE ALL ON FUNCTION private.crm_native_board_sync(uuid,text)
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.crm_native_board_module_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $trigger$
BEGIN
  PERFORM private.crm_native_board_sync(
    CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END,
    CASE WHEN TG_OP='DELETE' THEN OLD.module_id ELSE NEW.module_id END);
  RETURN NULL;
END;
$trigger$;
REVOKE ALL ON FUNCTION private.crm_native_board_module_trigger()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER crm_native_module_assignment_sync
AFTER INSERT OR UPDATE OR DELETE ON public.module_role_assignments
FOR EACH ROW EXECUTE FUNCTION private.crm_native_board_module_trigger();

CREATE TRIGGER crm_native_scoped_assignment_sync
AFTER INSERT OR UPDATE OR DELETE ON public.apsyntra_workspace_module_roles
FOR EACH ROW EXECUTE FUNCTION private.crm_native_board_module_trigger();

CREATE FUNCTION private.crm_native_board_frt_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $trigger$
BEGIN
  IF (CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END)
     ='00000000-0000-4000-8000-000000000001'::uuid THEN
    PERFORM private.crm_native_board_sync(
      CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END,
      'fund-released-tracker');
  END IF;
  RETURN NULL;
END;
$trigger$;
REVOKE ALL ON FUNCTION private.crm_native_board_frt_trigger()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_native_frt_assignment_sync
AFTER INSERT OR UPDATE OR DELETE ON public.frt_memberships
FOR EACH ROW EXECUTE FUNCTION private.crm_native_board_frt_trigger();

-- Concurrent membership activation / invitation: sync after the workspace member exists.
CREATE FUNCTION private.crm_native_board_workspace_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $trigger$
DECLARE v_module text;
BEGIN
  IF NEW.workspace_id='00000000-0000-4000-8000-000000000001'::uuid THEN
    FOREACH v_module IN ARRAY ARRAY[
      'time-tracker','fund-released-tracker','fueltrack-plus','tradelink'] LOOP
      PERFORM private.crm_native_board_sync(NEW.user_id,v_module);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$trigger$;
REVOKE ALL ON FUNCTION private.crm_native_board_workspace_trigger()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_native_workspace_member_sync
AFTER INSERT OR UPDATE OF active ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION private.crm_native_board_workspace_trigger();

-- Existing-assignment reconciliation: no administrative impersonation and no
-- change to the underlying application roles; the helper validates each candidate.
DO $backfill$
DECLARE v_record record;
BEGIN
  FOR v_record IN
    SELECT DISTINCT m.user_id,m.module_id
    FROM public.module_role_assignments m
    JOIN public.workspace_members wm ON wm.user_id=m.user_id
      AND wm.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
      AND wm.active IS TRUE
    WHERE m.module_id IN
      ('time-tracker','fund-released-tracker','fueltrack-plus','tradelink')
      AND m.enabled IS TRUE
    ORDER BY m.user_id,m.module_id
  LOOP
    PERFORM private.crm_native_board_sync(v_record.user_id,v_record.module_id);
  END LOOP;
END;
$backfill$;
COMMIT;
