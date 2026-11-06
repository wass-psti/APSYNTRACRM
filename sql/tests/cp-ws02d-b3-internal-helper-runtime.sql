-- CP-WS-02D/B3: nonproduction-only internal-helper runtime acceptance.
-- Include INSIDE the existing PG17 disposable privacy fixture's BEGIN/ROLLBACK.
-- No external service, production database, real user identity or secrets.
DO $guard$
BEGIN
 IF current_database() <> 'ws02d_privacy_disposable'
    OR current_setting('server_version_num')::integer < 170000
    OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
    OR position('p_user_id = auth.uid()' IN
       pg_get_functiondef('public.has_module_access(text,uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'Disposable-only signed-actor privacy fixture required'; END IF;
END $guard$;

CREATE TABLE public.module_state_key_policies(
 module_id text NOT NULL, match_type text NOT NULL, key_pattern text NOT NULL,
 required_scope text NOT NULL, max_bytes integer NOT NULL, writable boolean NOT NULL
);
INSERT INTO public.module_state_key_policies VALUES
 ('time-tracker','exact','test.note','user',1024,true),
 ('time-tracker','exact','timetracker.attendance.v1','workspace',1024,true),
 ('tradelink','exact','test.note','user',1024,true),
 ('tradelink','exact','test.readonly','user',1024,false);

-- The following 3 functions were obtained by read-only pg_get_functiondef
-- from the existing project and were MD5-checked before inclusion.

CREATE OR REPLACE FUNCTION public.module_state_delete_allowed(p_module_id text, p_scope text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text:=public.module_role_for(p_module_id,p_user_id);
begin
  if p_scope='user' then return public.has_module_access(p_module_id,p_user_id); end if;
  return case p_module_id
    when 'time-tracker' then r in ('System Admin','IT Administrator','HR')
    when 'fueltrack-plus' then r='Admin'
    when 'tradelink' then r='General Manager'
    else false end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.module_state_policy(p_module_id text, p_state_key text)
 RETURNS TABLE(required_scope text, max_bytes integer, writable boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
    select pol.required_scope,pol.max_bytes,pol.writable
    from public.module_state_key_policies pol
    where pol.module_id=p_module_id
      and (
        (pol.match_type='exact' and pol.key_pattern=p_state_key)
        or (pol.match_type='prefix' and left(p_state_key,length(pol.key_pattern))=pol.key_pattern)
      )
    order by case when pol.match_type='exact' then 0 else 1 end, length(pol.key_pattern) desc
    limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.module_state_write_allowed(p_module_id text, p_state_key text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 r text:=public.module_role_for(p_module_id,p_user_id);
 pol record;
BEGIN
 IF NOT public.has_module_access(p_module_id,p_user_id) THEN RETURN false; END IF;
 IF p_module_id='time-tracker' AND p_state_key IN (
  'timetracker.attendance.v1','timetracker.attendance.v1.backup'
 ) THEN RETURN false; END IF;
 SELECT * INTO pol FROM public.module_state_policy(p_module_id,p_state_key);
 IF NOT FOUND OR NOT pol.writable THEN RETURN false; END IF;
 IF p_module_id='time-tracker' AND p_state_key IN (
  'timetracker.rbac.v1','timetracker.rbac.v1.backup'
 ) THEN RETURN false; END IF;
 IF p_module_id='fueltrack-plus' AND p_state_key IN (
  'fueltrackplus.userroles.v3','fueltrackplus.activity.v3'
 ) THEN RETURN false; END IF;
 RETURN true;
END;
$function$;

-- Internal helpers stay unreachable to direct user JWT roles.
REVOKE ALL ON FUNCTION public.module_state_write_allowed(text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.module_state_delete_allowed(text,text,uuid) FROM PUBLIC,anon,authenticated;

-- Simulated signed entrypoint: derives the actor exclusively from auth.uid().
CREATE FUNCTION public.ws02d_b3_internal_helper_read_probe(p_module_id text,p_key text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO '' AS $probe$
DECLARE v_actor uuid := auth.uid();
BEGIN
 IF v_actor IS NULL THEN
  RETURN jsonb_build_object('write',false,'delete_user',false,'delete_workspace',false);
 END IF;
 RETURN jsonb_build_object(
  'write',public.module_state_write_allowed(p_module_id,p_key,v_actor),
  'delete_user',public.module_state_delete_allowed(p_module_id,'user',v_actor),
  'delete_workspace',public.module_state_delete_allowed(p_module_id,'workspace',v_actor));
END $probe$;
REVOKE ALL ON FUNCTION public.ws02d_b3_internal_helper_read_probe(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ws02d_b3_internal_helper_read_probe(text,text) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
-- Synthetic diagnostic only; no real actor identifiers or secrets.
SELECT public.ws02d_b3_internal_helper_read_probe('time-tracker','test.note') AS signed_one_own,
       public.ws02d_b3_internal_helper_read_probe('tradelink','test.note') AS signed_one_denied,
       public.ws02d_b3_internal_helper_read_probe('time-tracker','timetracker.attendance.v1') AS signed_one_protected;
DO $signed_one$
BEGIN
 IF public.ws02d_b3_internal_helper_read_probe('time-tracker','test.note')
   IS DISTINCT FROM '{"write":true,"delete_user":true,"delete_workspace":false}'::jsonb
 OR public.ws02d_b3_internal_helper_read_probe('tradelink','test.note')
   IS DISTINCT FROM '{"write":false,"delete_user":false,"delete_workspace":false}'::jsonb
 OR public.ws02d_b3_internal_helper_read_probe('time-tracker','timetracker.attendance.v1')->>'write' <> 'false'
 THEN RAISE EXCEPTION 'Signed actor one helper runtime regression'; END IF;
END $signed_one$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $signed_two$
BEGIN
 IF public.ws02d_b3_internal_helper_read_probe('tradelink','test.note')
   IS DISTINCT FROM '{"write":true,"delete_user":true,"delete_workspace":false}'::jsonb
 OR public.ws02d_b3_internal_helper_read_probe('tradelink','test.readonly')->>'write' <> 'false'
 OR public.ws02d_b3_internal_helper_read_probe('time-tracker','test.note')->>'write' <> 'false'
 THEN RAISE EXCEPTION 'Signed actor two helper runtime regression'; END IF;
END $signed_two$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $unsigned$
BEGIN
 IF public.ws02d_b3_internal_helper_read_probe('time-tracker','test.note')
   IS DISTINCT FROM '{"write":false,"delete_user":false,"delete_workspace":false}'::jsonb
 THEN RAISE EXCEPTION 'Unsigned helper probe must deny'; END IF;
END $unsigned$;
RESET ROLE;

-- As privileged *fixture owner* only: simulate signed GUC and check that the
-- security-definer helper itself cannot inspect the other principal's scope.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $cross_one$
BEGIN
 IF public.module_state_write_allowed('tradelink','test.note',
     '22222222-2222-4222-8222-222222222222'::uuid) IS DISTINCT FROM false
 OR public.module_state_delete_allowed('tradelink','user',
     '22222222-2222-4222-8222-222222222222'::uuid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Foreign user module state inspection not denied'; END IF;
END $cross_one$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $cross_two$
BEGIN
 IF public.module_state_write_allowed('time-tracker','test.note',
     '11111111-1111-4111-8111-111111111111'::uuid) IS DISTINCT FROM false
 OR public.module_state_delete_allowed('time-tracker','user',
     '11111111-1111-4111-8111-111111111111'::uuid) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Reverse foreign module-state inspection not denied'; END IF;
END $cross_two$;
DO $grants$
BEGIN
 IF has_function_privilege('anon','public.module_state_write_allowed(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.module_state_write_allowed(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.module_state_delete_allowed(text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.module_state_delete_allowed(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.ws02d_b3_internal_helper_read_probe(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Internal helper grants not preserved'; END IF;
END $grants$;

\echo 'WS02D_B3_INTERNAL_HELPER_RUNTIME_PASS source=LIVE_MD5_LOCKED signed_self=PASS protected_state=DENIED readonly_key=DENIED foreign_both_directions=DENIED unsigned=DENIED grants=PRESERVED writes=DISPOSABLE_ONLY'
