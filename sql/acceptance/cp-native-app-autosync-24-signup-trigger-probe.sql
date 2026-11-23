-- Read-only effect: the test runs within a transaction and always rolls back.
-- Explicitly probe staging's existing Auth INSERT triggers, report SQLSTATE
-- only, and never use the local source DB or real user identities.
BEGIN;
DO $cp24$
DECLARE
    fixture uuid := gen_random_uuid();
BEGIN
    IF current_database() <> 'cp_native20_owner_clone' THEN
        RAISE EXCEPTION 'CP24 isolated staging clone required';
    END IF;
    BEGIN
        INSERT INTO auth.users (
          id, instance_id, aud, role, email,
          encrypted_password, email_confirmed_at,
          created_at, updated_at
        ) VALUES (
          fixture, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'cp24-synthetic-probe@example.invalid', '',
          now(), now(), now()
        );
        RAISE NOTICE 'CP24_AUTH_INSERT_TRIGGER=PASS';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'CP24_AUTH_INSERT_TRIGGER_SQLSTATE=%', SQLSTATE;
    END;
END $cp24$;
ROLLBACK;
