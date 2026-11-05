-- CP-WS-02D/B3 only synthetic application roles, no production user changes.
\set ON_ERROR_STOP on
DO $pre$ BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('public.charter_admin_set_role(uuid,text,boolean)') IS NULL
 OR to_regprocedure('public.wm_admin_set_application_role(uuid,text,text,boolean)') IS NULL
 OR to_regprocedure('public.apsyntra_role_is_bootstrap()') IS NOT NULL
 OR to_regclass('public.apsyntra_role_bootstrap_identities') IS NOT NULL
 THEN RAISE EXCEPTION 'Administrative-role fixture collision or wrong DB' USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TABLE public.apsyntra_role_bootstrap_identities(
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 canonical_email text NOT NULL
);
ALTER TABLE public.module_role_assignments DROP COLUMN IF EXISTS id;
ALTER TABLE public.module_role_assignments
 ADD COLUMN user_id uuid NOT NULL REFERENCES public.profiles(id),
 ADD COLUMN module_id text NOT NULL,
 ADD COLUMN role text NOT NULL,
 ADD COLUMN enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN assigned_by uuid REFERENCES public.profiles(id),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.module_role_assignments
 ADD CONSTRAINT module_role_assignments_pkey PRIMARY KEY(user_id,module_id);
-- Reproduce the exact production bootstrap verifier under mock auth.users.
-- Original source MD5 18ff48d4dc742a3c42f3887e6b576dab
CREATE OR REPLACE FUNCTION public.apsyntra_role_is_bootstrap()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(
  SELECT 1 FROM public.apsyntra_role_bootstrap_identities b
  JOIN auth.users u ON u.id=b.user_id
  JOIN public.profiles p ON p.id=b.user_id
  WHERE b.user_id=auth.uid() AND lower(u.email)=b.canonical_email
   AND lower(p.email)=b.canonical_email
   AND p.status='active' AND p.platform_role='admin_general_manager'
 );
$function$
;
REVOKE ALL ON FUNCTION public.apsyntra_role_is_bootstrap() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apsyntra_role_is_bootstrap() TO authenticated;
-- This identity is invented and local to the disposable PostgreSQL fixture.
UPDATE auth.users SET email='synthetic-bootstrap@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.profiles SET email='synthetic-bootstrap@example.invalid'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO public.apsyntra_role_bootstrap_identities(user_id,canonical_email)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic-bootstrap@example.invalid');
