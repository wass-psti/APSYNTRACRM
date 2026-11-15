BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.ws02_admin_stage_creation(p_email text,p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stage$
DECLARE v_email text:=lower(btrim(coalesce(p_email,'')));
BEGIN
 IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
 OR (SELECT signup_enabled FROM private.ws02_activation_flags WHERE id) IS DISTINCT FROM false
 OR length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR p_sha256 !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Admin provisioning request denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=v_email)
 THEN RAISE EXCEPTION 'Approved account already exists' USING ERRCODE='23505'; END IF;
 INSERT INTO private.ws02_admin_creation_approvals(email,ticket_sha256,expires_at)
 VALUES(v_email,p_sha256,now()+interval '10 minutes')
 ON CONFLICT(email) DO UPDATE
 SET ticket_sha256=EXCLUDED.ticket_sha256,
 staged_at=now(),expires_at=EXCLUDED.expires_at
 WHERE private.ws02_admin_creation_approvals.consumed_at IS NULL
 AND private.ws02_admin_creation_approvals.expires_at<now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Approval already staged or consumed' USING ERRCODE='23505'; END IF;
END $stage$;
REVOKE ALL ON FUNCTION public.ws02_admin_stage_creation(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ws02_admin_stage_creation(text,text) TO service_role;
COMMIT;;
