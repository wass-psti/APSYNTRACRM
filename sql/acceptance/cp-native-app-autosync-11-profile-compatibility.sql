-- CP11: synthetic, temporary staging-shaped profile only. Do not alter public.profiles.
BEGIN;
CREATE TEMP TABLE cp11_staging_profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  display_name text,
  email_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
) ON COMMIT DROP;
INSERT INTO cp11_staging_profiles(id,email,display_name,status)
VALUES ('10000000-0000-4000-8000-000000000001','qa-one@example.invalid','QA One','active'),
       ('20000000-0000-4000-8000-000000000002','qa-two@example.invalid','QA Two','inactive');
-- Rehearse exactly the missing columns in the existing CRM foundation,
-- using its current defaults. This is NOT a staging migration or grant.
ALTER TABLE cp11_staging_profiles
 ADD COLUMN platform_role text NOT NULL DEFAULT 'employee',
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
DO $$
BEGIN
 IF (SELECT count(*) FROM cp11_staging_profiles)<>2
    OR (SELECT count(*) FROM cp11_staging_profiles WHERE platform_role='employee')<>2
    OR (SELECT count(*) FROM cp11_staging_profiles WHERE created_at IS NOT NULL)<>2
    OR (SELECT status FROM cp11_staging_profiles
        WHERE id='20000000-0000-4000-8000-000000000002')<>'inactive'
 THEN RAISE EXCEPTION 'Staging compatibility rehearsal changed source profile semantics'; END IF;
 IF (SELECT count(*) FROM information_schema.columns
     WHERE table_name='cp11_staging_profiles'
       AND column_name IN ('platform_role','created_at'))<>2
 THEN RAISE EXCEPTION 'Missing compatibility columns'; END IF;
END $$;
ROLLBACK;
