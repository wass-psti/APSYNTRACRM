-- CP-TT-OT-SELF-REVIEW-02: Bootstrap Administrator self-review parity for every OT policy.
-- Keep the existing reviewer scope, attendance matching, cutoff, transaction locks and audit semantics.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

DO $preflight$
BEGIN
 IF pg_catalog.to_regprocedure('public.timetracker_ot_snapshot(uuid)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_decide_duration(uuid,uuid,text)') IS NULL
  OR pg_catalog.to_regprocedure('public.timetracker_ot_decide_manual_duration(uuid,uuid,text)') IS NULL
  OR pg_catalog.to_regprocedure('public.apsyntra_role_is_bootstrap()') IS NULL
  OR pg_catalog.to_regclass('public.timetracker_ot_requests') IS NULL THEN
  RAISE EXCEPTION 'Bootstrap OT self-review prerequisites missing' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- Employee duration decisions retain their exact attendance matching and cutoff rules.
-- Only the existing Bootstrap Administrator self-review exclusion is relaxed.
DO $duration_decision$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_decide_duration(uuid,uuid,text)'::regprocedure);

 old:=$old$v_owner uuid;
 v_req public.timetracker_ot_requests%ROWTYPE;$old$;
 replacement:=$new$v_owner uuid;
 v_bootstrap boolean;
 v_req public.timetracker_ot_requests%ROWTYPE;$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Duration OT declaration baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:='v_ws:=public.timetracker_ot_require_scope(p_board_id);';
 replacement:=old||E'\n v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);';
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Duration OT bootstrap identity baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:=$old$IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Request unavailable or self-approval prohibited' USING ERRCODE='42501'; END IF;$old$;
 replacement:=$new$IF NOT FOUND OR (v_owner=v_actor AND NOT v_bootstrap) THEN
  RAISE EXCEPTION 'Request unavailable or self-approval prohibited' USING ERRCODE='42501'; END IF;$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Duration OT self-review baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 EXECUTE d;
END;
$duration_decision$;

-- Manual duration OT is a status/audit decision only. Its existing per-employee lock
-- and row lock remain unchanged; Bootstrap self-review does not create attendance data.
DO $manual_duration_decision$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_decide_manual_duration(uuid,uuid,text)'::regprocedure);

 old:=$old$v_owner uuid;
 v_status text;$old$;
 replacement:=$new$v_owner uuid;
 v_bootstrap boolean;
 v_status text;$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual duration OT declaration baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:='v_ws:=public.timetracker_ot_require_scope(p_board_id);';
 replacement:=old||E'\n v_bootstrap:=COALESCE(public.apsyntra_role_is_bootstrap(),false);';
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual duration OT bootstrap identity baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:=$old$IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Manual duration request unavailable or self-approval prohibited'
   USING ERRCODE='42501';$old$;
 replacement:=$new$IF NOT FOUND OR (v_owner=v_actor AND NOT v_bootstrap) THEN
  RAISE EXCEPTION 'Manual duration request unavailable or self-approval prohibited'
   USING ERRCODE='42501';$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual duration OT initial self-review baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:=$old$IF NOT FOUND OR v_owner=v_actor THEN
  RAISE EXCEPTION 'Manual duration request changed or self-approval prohibited'
   USING ERRCODE='PT409';$old$;
 replacement:=$new$IF NOT FOUND OR (v_owner=v_actor AND NOT v_bootstrap) THEN
  RAISE EXCEPTION 'Manual duration request changed or self-approval prohibited'
   USING ERRCODE='PT409';$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'Manual duration OT locked self-review baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 EXECUTE d;
END;
$manual_duration_decision$;

-- The signed snapshot now exposes review controls for Bootstrap-owned requests under
-- legacy-range, duration-v1 and manual-duration-v1. Other reviewer classes keep the
-- existing owner<>actor rule; no new role or wider reviewer scope is introduced.
DO $snapshot$
DECLARE d text; old text; replacement text;
BEGIN
 d:=pg_catalog.pg_get_functiondef('public.timetracker_ot_snapshot(uuid)'::regprocedure);

 old:=$old$AND (r.owner_id<>v_user OR (v_bootstrap AND r.ot_policy='legacy-range'))),$old$;
 replacement:=$new$AND (r.owner_id<>v_user OR v_bootstrap)), $new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'OT snapshot legacy self-review baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 old:=$old$AND r.status='Submitted' AND r.owner_id<>v_user
    AND (r.submission_source='manual_admin' OR wm.user_id IS NOT NULL)),$old$;
 replacement:=$new$AND r.status='Submitted' AND (r.owner_id<>v_user OR v_bootstrap)
    AND (r.submission_source='manual_admin' OR wm.user_id IS NOT NULL)),$new$;
 IF pg_catalog.cardinality(pg_catalog.string_to_array(d,old))<>2 THEN
  RAISE EXCEPTION 'OT snapshot duration self-review baseline drift'; END IF;
 d:=pg_catalog.replace(d,old,replacement);

 EXECUTE d;
END;
$snapshot$;

COMMENT ON FUNCTION public.timetracker_ot_decide_duration(uuid,uuid,text) IS
 'Approves/rejects employee duration OT for existing HR, System Admin and platform Admin reviewers; Bootstrap Administrators may also review their own requests while attendance matching and cutoff rules remain unchanged.';
COMMENT ON FUNCTION public.timetracker_ot_decide_manual_duration(uuid,uuid,text) IS
 'Approves/rejects historical manual duration OT for existing reviewers; Bootstrap Administrators may also review their own requests without creating attendance or cutoff data.';
COMMENT ON FUNCTION public.timetracker_ot_snapshot(uuid) IS
 'Signed OT snapshot exposes Bootstrap Administrator self-review capability across legacy-range, duration-v1 and manual-duration-v1 while preserving all other reviewer boundaries.';

NOTIFY pgrst,'reload schema';
COMMIT;
