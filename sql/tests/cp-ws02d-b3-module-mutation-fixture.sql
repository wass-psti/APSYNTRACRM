-- CP-WS-02D/B3: synthetic dependencies for original core module write functions.
-- Disposable PostgreSQL 17 only. Never apply this fixture to production.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
 OR to_regclass('public.module_state_entries') IS NOT NULL
 OR to_regclass('public.module_operation_locks') IS NOT NULL
 OR to_regprocedure('public.put_module_state(text,text,text,text,bigint)') IS NOT NULL
 THEN RAISE EXCEPTION 'WS02D/B3 module fixture collision' USING ERRCODE='42501'; END IF;
END $guard$;
CREATE TABLE public.module_state_entries(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL,state_key text NOT NULL,
 scope text NOT NULL,owner_key text NOT NULL,value text,
 revision bigint NOT NULL,updated_by uuid REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT module_state_entries_pkey PRIMARY KEY
 (workspace_id,module_id,state_key,scope,owner_key)
);
CREATE TABLE public.module_operation_locks(
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 module_id text NOT NULL,lock_key text NOT NULL,token text NOT NULL,
 owner_user_id uuid NOT NULL REFERENCES public.profiles(id),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,module_id,lock_key)
);
-- Models preexisting domain constraints as independent AND predicates.
CREATE FUNCTION public.has_module_access(p_module_id text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $m$
 SELECT p_module_id IN ('fueltrack-plus','tradelink')
 AND p_actor IS NOT NULL AND p_actor=auth.uid()
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.status='active')
 AND EXISTS(SELECT 1 FROM public.workspace_members m
   WHERE m.user_id=p_actor AND m.active
    AND m.workspace_id=public.current_workspace_id(p_actor));
$m$;
CREATE FUNCTION public.module_state_policy(p_module_id text,p_state_key text)
RETURNS TABLE(writable boolean,required_scope text,max_bytes integer)
LANGUAGE sql STABLE AS $p$
 SELECT true,'shared'::text,4096
 WHERE p_module_id IN('fueltrack-plus','tradelink')
 AND p_state_key='project.plan';
$p$;
CREATE FUNCTION public.module_state_write_allowed(p_module_id text,p_state_key text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $a$
 SELECT p_module_id IN('fueltrack-plus','tradelink')
 AND p_state_key='project.plan' AND p_actor=auth.uid();
$a$;
CREATE FUNCTION public.module_state_delete_allowed(p_module_id text,p_scope text,p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $d$
 SELECT p_module_id IN('fueltrack-plus','tradelink')
 AND p_scope='shared' AND p_actor=auth.uid();
$d$;
CREATE FUNCTION public.module_state_merge_authorized_payload(
 p_module_id text,p_state_key text,p_current text,p_new text,p_actor uuid
) RETURNS text LANGUAGE sql STABLE AS $merge$
 SELECT p_new;
$merge$;
CREATE FUNCTION public.module_state_payload_allowed(
 p_module_id text,p_state_key text,p_old text,p_new text,p_actor uuid
) RETURNS boolean LANGUAGE sql STABLE AS $allow$
 SELECT p_new IS NOT NULL AND p_actor=auth.uid();
$allow$;
CREATE FUNCTION public.module_state_invariants_valid(
 p_module_id text,p_state_key text,p_value text
) RETURNS boolean LANGUAGE sql STABLE AS $valid$
 SELECT p_value IS NOT NULL AND length(p_value)<4097;
$valid$;
-- Original production routines use unqualified gen_random_bytes under
-- a legacy public search_path; supply a synthetic extension bridge only.
CREATE FUNCTION public.gen_random_bytes(p_bytes integer)
RETURNS bytea LANGUAGE sql SECURITY INVOKER SET search_path='' AS $random$
 SELECT extensions.gen_random_bytes(p_bytes);
$random$;
CREATE OR REPLACE FUNCTION public.acquire_module_operation_lock(p_module_id text, p_lock_key text, p_ttl_seconds integer DEFAULT 30)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; generated_token text:=encode(gen_random_bytes(24),'hex'); acquired_token text;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  if length(trim(coalesce(p_lock_key,'')))<3 or length(p_lock_key)>240 then raise exception 'invalid operation lock key' using errcode='22023'; end if;
  p_ttl_seconds:=greatest(3,least(coalesce(p_ttl_seconds,30),120));
  ws:=public.current_workspace_id(caller);
  insert into public.module_operation_locks as l(workspace_id,module_id,lock_key,token,owner_user_id,expires_at,created_at)
  values(ws,p_module_id,trim(p_lock_key),generated_token,caller,now()+make_interval(secs=>p_ttl_seconds),now())
  on conflict(workspace_id,module_id,lock_key) do update
    set token=excluded.token,owner_user_id=excluded.owner_user_id,expires_at=excluded.expires_at,created_at=now()
    where l.expires_at<=now()
  returning token into acquired_token;
  return acquired_token;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_module_state(p_module_id text, p_state_key text, p_scope text DEFAULT 'shared'::text, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 caller uuid:=auth.uid();
 ws uuid;
 owner text;
 current_revision bigint;
 affected integer;
 pol record;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
 IF NOT public.has_module_access(p_module_id,caller) THEN
  RAISE EXCEPTION 'module access denied' USING ERRCODE='42501';
 END IF;
 IF p_module_id='time-tracker' AND p_state_key IN (
  'timetracker.attendance.v1','timetracker.attendance.v1.backup'
 ) THEN
  RAISE EXCEPTION 'Dedicated Clock service owns attendance state'
    USING ERRCODE='42501';
 END IF;
 SELECT * INTO pol FROM public.module_state_policy(p_module_id,p_state_key);
 IF NOT FOUND THEN RAISE EXCEPTION 'state key is not registered for module'
  USING ERRCODE='22023'; END IF;
 IF p_scope<>pol.required_scope THEN RAISE EXCEPTION 'state scope mismatch: expected %',pol.required_scope
  USING ERRCODE='22023'; END IF;
 IF NOT public.module_state_delete_allowed(p_module_id,p_scope,caller) THEN
  RAISE EXCEPTION 'module state delete denied' USING ERRCODE='42501'; END IF;
 ws:=public.current_workspace_id(caller);
 owner:=CASE WHEN p_scope='user' THEN caller::text ELSE '*' END;
 SELECT e.revision INTO current_revision FROM public.module_state_entries e
 WHERE e.workspace_id=ws AND e.module_id=p_module_id
 AND e.state_key=p_state_key AND e.scope=p_scope AND e.owner_key=owner FOR UPDATE;
 IF p_expected_revision IS NOT NULL AND COALESCE(current_revision,0)<>p_expected_revision THEN
  RAISE EXCEPTION 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,COALESCE(current_revision,0)
   USING ERRCODE='40001';
 END IF;
 DELETE FROM public.module_state_entries e
 WHERE e.workspace_id=ws AND e.module_id=p_module_id AND e.state_key=p_state_key
 AND e.scope=p_scope AND e.owner_key=owner;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected>0;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.put_module_state(p_module_id text, p_state_key text, p_value text, p_scope text DEFAULT 'shared'::text, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller uuid:=auth.uid(); ws uuid; owner text; current_revision bigint; current_value text;
  effective_value text; result_revision bigint; result_updated_at timestamptz; pol record;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  select * into pol from public.module_state_policy(p_module_id,p_state_key);
  if not found then raise exception 'state key is not registered for module' using errcode='22023'; end if;
  if not pol.writable or not public.module_state_write_allowed(p_module_id,p_state_key,caller) then raise exception 'module state write denied' using errcode='42501'; end if;
  if p_scope<>pol.required_scope then raise exception 'state scope mismatch: expected %',pol.required_scope using errcode='22023'; end if;
  if p_value is null or octet_length(p_value)>pol.max_bytes then raise exception 'state value is empty or exceeds policy limit' using errcode='22023'; end if;
  ws:=public.current_workspace_id(caller); owner:=case when p_scope='user' then caller::text else '*' end;

  select e.revision,e.value into current_revision,current_value from public.module_state_entries e
   where e.workspace_id=ws and e.module_id=p_module_id and e.state_key=p_state_key and e.scope=p_scope and e.owner_key=owner for update;
  if p_expected_revision is not null and coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'WM_STATE_CONFLICT expected %, current %',p_expected_revision,coalesce(current_revision,0) using errcode='40001';
  end if;
  effective_value:=public.module_state_merge_authorized_payload(p_module_id,p_state_key,current_value,p_value,caller);
  if not public.module_state_payload_allowed(p_module_id,p_state_key,current_value,effective_value,caller) then
    raise exception 'module state payload violates record ownership boundary' using errcode='42501';
  end if;
  if not public.module_state_invariants_valid(p_module_id,p_state_key,effective_value) then
    raise exception 'module state violates data integrity invariants' using errcode='22023';
  end if;

  insert into public.module_state_entries(workspace_id,module_id,state_key,scope,owner_key,value,revision,updated_by,updated_at)
  values(ws,p_module_id,p_state_key,p_scope,owner,effective_value,1,caller,now())
  on conflict on constraint module_state_entries_pkey do update
    set value=excluded.value,revision=public.module_state_entries.revision+1,updated_by=caller,updated_at=now()
  returning revision,updated_at into result_revision,result_updated_at;
  return jsonb_build_object('state_key',p_state_key,'revision',result_revision,'updated_at',result_updated_at);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.release_module_operation_lock(p_module_id text, p_lock_key text, p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare caller uuid:=auth.uid(); ws uuid; affected integer;
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.has_module_access(p_module_id,caller) then raise exception 'module access denied' using errcode='42501'; end if;
  ws:=public.current_workspace_id(caller);
  delete from public.module_operation_locks l
    where l.workspace_id=ws and l.module_id=p_module_id and l.lock_key=trim(p_lock_key)
      and l.owner_user_id=caller and l.token=p_token;
  get diagnostics affected=row_count;
  return affected>0;
end;
$function$
;
