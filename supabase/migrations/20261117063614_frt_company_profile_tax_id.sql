-- CP-FRT-FLOW-03E — persist the company TIN and reuse it in voucher output.
-- Additive: retains the existing seven-argument RPC for already deployed clients.
BEGIN;

ALTER TABLE public.frt_companies
  ADD COLUMN IF NOT EXISTS tax_id_number text;

COMMENT ON COLUMN public.frt_companies.registered_address IS
  'Company address displayed on the voucher; it is not represented as a registered-office address unless separately verified.';

COMMENT ON COLUMN public.frt_companies.tax_id_number IS
  'Company tax identification number printed on Disbursement Vouchers; nullable until confirmed from company records.';

CREATE OR REPLACE FUNCTION public.frt_update_company_profile(
  p_workspace_id uuid,
  p_company_code text,
  p_legal_name text,
  p_registered_address text,
  p_contact_phone text,
  p_contact_email text,
  p_logo_path text,
  p_tax_id_number text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $fn$
DECLARE
  v_company public.frt_companies;
  v_address text := nullif(trim(p_registered_address), '');
  v_phone text := nullif(trim(p_contact_phone), '');
  v_email text := nullif(trim(p_contact_email), '');
  v_tax_id text := nullif(trim(p_tax_id_number), '');
BEGIN
  IF auth.uid() IS NULL OR NOT private.frt_has_membership(p_workspace_id) THEN
    RAISE EXCEPTION 'Active Fund Released Tracker membership is required'
      USING errcode = '42501';
  END IF;

  IF p_company_code NOT IN ('WAO', 'WASS', 'PSTI') THEN
    RAISE EXCEPTION 'Unknown FRT company code' USING errcode = '22023';
  END IF;

  IF p_legal_name IS NULL OR length(trim(p_legal_name)) NOT BETWEEN 2 AND 180 THEN
    RAISE EXCEPTION 'Legal company name must contain 2 to 180 characters'
      USING errcode = '22023';
  END IF;

  IF v_address IS NOT NULL AND length(v_address) > 500 THEN
    RAISE EXCEPTION 'Company address must not exceed 500 characters'
      USING errcode = '22023';
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) > 120 THEN
    RAISE EXCEPTION 'Contact telephone must not exceed 120 characters'
      USING errcode = '22023';
  END IF;

  IF v_email IS NOT NULL AND (
    length(v_email) > 180 OR
    v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ) THEN
    RAISE EXCEPTION 'Enter a valid contact email address'
      USING errcode = '22023';
  END IF;

  IF v_tax_id IS NOT NULL AND length(v_tax_id) > 32 THEN
    RAISE EXCEPTION 'Tax identification number must not exceed 32 characters'
      USING errcode = '22023';
  END IF;

  SELECT *
    INTO v_company
    FROM public.frt_companies
   WHERE workspace_id = p_workspace_id
     AND code = p_company_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FRT company not found in this workspace'
      USING errcode = 'P0002';
  END IF;

  IF p_logo_path IS NOT NULL AND (
    p_logo_path !~ (
      '^' || p_workspace_id::text ||
      '/company-profiles/' || p_company_code ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
    OR NOT EXISTS (
      SELECT 1
        FROM storage.objects AS so
       WHERE so.bucket_id = 'frt-attachments'
         AND so.name = p_logo_path
    )
  ) THEN
    RAISE EXCEPTION 'Company logo must be an uploaded image in this workspace company folder'
      USING errcode = '22023';
  END IF;

  UPDATE public.frt_companies
     SET name = trim(p_legal_name),
         registered_address = v_address,
         contact_phone = v_phone,
         contact_email = v_email,
         logo_path = p_logo_path,
         tax_id_number = v_tax_id
   WHERE id = v_company.id
  RETURNING * INTO v_company;

  RETURN jsonb_build_object(
    'saved', true,
    'company', jsonb_build_object(
      'code', v_company.code,
      'name', v_company.name,
      'registeredAddress', v_company.registered_address,
      'contactPhone', v_company.contact_phone,
      'contactEmail', v_company.contact_email,
      'taxIdNumber', v_company.tax_id_number,
      'logoPath', v_company.logo_path
    )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.frt_update_company_profile(
  uuid, text, text, text, text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.frt_update_company_profile(
  uuid, text, text, text, text, text, text, text
) TO authenticated;

COMMIT;