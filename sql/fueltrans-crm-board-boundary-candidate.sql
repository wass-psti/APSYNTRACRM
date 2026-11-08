-- Candidate only: requires explicit approval before production application.
-- Adds CRM scope restrictions; retains existing FuelTrans role/client policies.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('private.fueltrans_current_role(uuid)','02d040f5a17d7722eeb147660cd87b6f'),
 ('private.fueltrans_current_client(uuid)','90db1da41e4ddb7f0842fea8721374b4'),
 ('public.fueltrans_soft_delete_ticket_v1(uuid,text,timestamp with time zone)','6c99f70a89162fd7da5bfc58b2c75c73'),
 ('public.fueltrans_restore_deleted_ticket_v1(uuid,text)','2ce5a6d9f1899900863c44c958aec1ab'),
 ('public.fueltrans_permanently_delete_ticket_v1(uuid,text,timestamp with time zone)','f478e9f29544c5618b07ba0d7b2be700'),
 ('public.fueltrans_list_deleted_tickets_v1(uuid,integer,integer,text)','d8f9acce15da3a3f03c91bc5319a77a9'),
 ('public.fueltrans_deleted_ticket_page_v1(uuid,integer,integer,text)','a5a8b9106fe19e172b42ac1a2a148c1c')
 ) AS expected(signature,hash) LOOP
 IF to_regprocedure(r.signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.hash THEN
  RAISE EXCEPTION 'FuelTrans function changed: %',r.signature;
 END IF;
 END LOOP;
END $preflight$;

-- Private helper needs definer access to auth.sessions; returns only a boolean.
CREATE FUNCTION private.fueltrans_crm_access(p_workspace_id uuid,p_required text DEFAULT 'view')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $gate$
DECLARE caller uuid:=auth.uid(); sid text:=auth.jwt()->>'session_id'; board_id uuid;
BEGIN
 IF caller IS NULL OR p_workspace_id IS NULL OR p_required IS NULL OR p_required NOT IN ('view','edit','manage') THEN RETURN false; END IF;
 IF sid IS NULL OR sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=sid::uuid AND s.user_id=caller AND (s.not_after IS NULL OR s.not_after>now())) THEN RETURN false; END IF;
 IF public.current_workspace_id(caller) IS DISTINCT FROM p_workspace_id OR NOT public.has_module_access('fueltrans',caller) THEN RETURN false; END IF;
 SELECT b.id INTO board_id FROM public.work_boards b WHERE b.workspace_id=p_workspace_id AND b.name='FuelTrans Standalone' AND b.archived_at IS NULL AND b.status='active';
 RETURN board_id IS NOT NULL AND public.work_board_access(board_id,p_required);
END $gate$;
REVOKE ALL ON FUNCTION private.fueltrans_crm_access(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.fueltrans_crm_access(uuid,text) TO authenticated;

-- Retain current function signatures, owners and ACLs. The additional predicate
-- also protects legacy SECURITY DEFINER paths and private Storage authorization.
DO $helpers$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['private.fueltrans_current_role(uuid)','private.fueltrans_current_client(uuid)'] LOOP
  definition:=pg_get_functiondef(to_regprocedure(signature));
  IF strpos(definition,'when auth.uid() is null then null')=0 THEN RAISE EXCEPTION 'Unexpected FuelTrans helper body'; END IF;
  EXECUTE replace(definition,'when auth.uid() is null then null','when auth.uid() is null or not private.fueltrans_crm_access(p_workspace_id,''view'') then null');
 END LOOP;
END $helpers$;

DO $policies$
DECLARE tab text; required text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['fueltrans_audit_events','fueltrans_issue_reports','fueltrans_memberships','fueltrans_notifications','fueltrans_sessions','fueltrans_ticket_events_v2','fueltrans_tickets','fueltrans_user_state'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=tab AND c.relrowsecurity) THEN RAISE EXCEPTION 'Expected FuelTrans RLS table missing: %',tab; END IF;
  required:=CASE WHEN tab='fueltrans_memberships' THEN 'manage' ELSE 'edit' END;
  EXECUTE format('CREATE POLICY fueltrans_crm_view ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (private.fueltrans_crm_access(workspace_id,''view''))',tab);
  EXECUTE format('CREATE POLICY fueltrans_crm_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.fueltrans_crm_access(workspace_id,%L))',tab,required);
  EXECUTE format('CREATE POLICY fueltrans_crm_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.fueltrans_crm_access(workspace_id,%L)) WITH CHECK (private.fueltrans_crm_access(workspace_id,%L))',tab,required,required);
  EXECUTE format('CREATE POLICY fueltrans_crm_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.fueltrans_crm_access(workspace_id,%L))',tab,required);
 END LOOP;
END $policies$;

-- Definer mutations must enforce board editing themselves, since they bypass RLS.
DO $rpc$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.fueltrans_soft_delete_ticket_v1(uuid,text,timestamp with time zone)','public.fueltrans_restore_deleted_ticket_v1(uuid,text)','public.fueltrans_permanently_delete_ticket_v1(uuid,text,timestamp with time zone)'] LOOP
  definition:=pg_get_functiondef(to_regprocedure(signature));
  IF strpos(definition,E'BEGIN\n')=0 THEN RAISE EXCEPTION 'Unexpected FuelTrans RPC body'; END IF;
  EXECUTE replace(definition,E'BEGIN\n',E'BEGIN\n IF NOT private.fueltrans_crm_access(p_workspace_id,''edit'') THEN RAISE EXCEPTION ''FuelTrans board editing permission required'' USING ERRCODE=''42501''; END IF;\n');
 END LOOP;
END $rpc$;

-- Restrictive bucket conditions leave all other applications unaffected.
CREATE POLICY fueltrans_crm_evidence_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING (CASE WHEN bucket_id='fueltrans-evidence' THEN private.fueltrans_crm_access((storage.foldername(name))[1]::uuid,'view') ELSE true END);
CREATE POLICY fueltrans_crm_evidence_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (CASE WHEN bucket_id='fueltrans-evidence' THEN private.fueltrans_crm_access((storage.foldername(name))[1]::uuid,'edit') ELSE true END);
CREATE POLICY fueltrans_crm_evidence_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (CASE WHEN bucket_id='fueltrans-evidence' THEN private.fueltrans_crm_access((storage.foldername(name))[1]::uuid,'edit') ELSE true END)
 WITH CHECK (CASE WHEN bucket_id='fueltrans-evidence' THEN private.fueltrans_crm_access((storage.foldername(name))[1]::uuid,'edit') ELSE true END);
CREATE POLICY fueltrans_crm_evidence_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING (CASE WHEN bucket_id='fueltrans-evidence' THEN private.fueltrans_crm_access((storage.foldername(name))[1]::uuid,'edit') ELSE true END);
COMMIT;
