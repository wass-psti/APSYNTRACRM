\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL,platform_role text NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid,user_id uuid,active boolean NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_bootstrap_identities(user_id uuid PRIMARY KEY);
CREATE TABLE public.module_role_assignments(user_id uuid,module_id text,role text,enabled boolean,PRIMARY KEY(user_id,module_id));
CREATE TABLE public.frt_memberships(workspace_id uuid,user_id uuid,role text NOT NULL,
 enabled boolean NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.apsyntra_role_change_requests(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 workspace_id uuid,proposed_by uuid,operation text,payload jsonb,status text);
CREATE TABLE public.apsyntra_role_change_audit(change_id uuid,workspace_id uuid,
 actor_id uuid,event text,detail jsonb);
CREATE TABLE public.tool_traceability_memberships(workspace_id uuid,user_id uuid,role text);
CREATE FUNCTION public.apsyntra_role_require_scope(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF auth.uid() IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  OR p_workspace_id IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
END$$;
CREATE FUNCTION private.frt_signed_session_active() RETURNS boolean
LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE FUNCTION public.apsyntra_crm_explicit_role(uuid,uuid)
RETURNS text LANGUAGE sql STABLE AS $$SELECT NULL::text$$;
CREATE FUNCTION public.apsyntra_crm_module_role_rank(text,text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$SELECT 1$$;
CREATE FUNCTION public.apsyntra_crm_role_rank(text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$SELECT 3$$;
CREATE FUNCTION public.apsyntra_crm_effective_role(uuid,uuid)
RETURNS text LANGUAGE sql STABLE AS $$SELECT 'admin'::text$$;

CREATE OR REPLACE FUNCTION public.apsyntra_crm_my_effective_access()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $projection$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid:='11111111-1111-4111-8111-111111111111';
 v_modules jsonb;
BEGIN
 WITH requested_modules(id) AS (VALUES ('fund-released-tracker'),('tool-traceability')),
 raw_roles AS (
 SELECT requested.id,
   CASE requested.id
     WHEN 'tool-traceability' THEN traceability.role
     ELSE assignment.role
   END AS raw_role
 FROM requested_modules requested
 LEFT JOIN public.module_role_assignments assignment
   ON assignment.user_id=v_actor AND assignment.module_id=requested.id
      AND assignment.enabled
 LEFT JOIN public.tool_traceability_memberships traceability
   ON requested.id='tool-traceability'
   AND traceability.workspace_id=v_workspace
   AND traceability.user_id=v_actor
 )
 SELECT jsonb_agg(jsonb_build_object('moduleId',id,'role',raw_role,'allowed',raw_role IS NOT NULL))
 INTO v_modules FROM raw_roles;
 -- This exact verifier anchor is part of the real function's platform ceiling.
 PERFORM public.apsyntra_crm_module_role_rank('fund-released-tracker','REQUESTOR');
 RETURN coalesce(v_modules,'[]'::jsonb);
END;
$projection$;

INSERT INTO public.profiles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active','admin_general_manager'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active','employee'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','active','employee');
INSERT INTO public.workspace_members VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
INSERT INTO public.apsyntra_role_bootstrap_identities VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.module_role_assignments VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fund-released-tracker','FINANCE_APPROVER',true);
