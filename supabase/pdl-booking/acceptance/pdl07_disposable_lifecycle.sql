\set ON_ERROR_STOP on
-- Refuse test writes outside the disposable fixture initialized by this suite.
DO $guard$ BEGIN
  IF to_regclass('pdl07_acceptance_guard.disposable_fixture') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pdl07_acceptance_guard.disposable_fixture WHERE id=1) THEN
    RAISE EXCEPTION 'PDL07_REQUIRES_DISPOSABLE_FIXTURE';
  END IF;
END $guard$;
-- Only against fresh disposable PostgreSQL 17 fixture, never production.
\ir pdl07_disposable_actor_seed.sql
\ir pdl_native04_booking_sync_rollback.sql
-- 04 includes its own BEGIN/ROLLBACK.
\echo CHECK PDL04_ROLLBACK_PERSISTENCE
DO $check$
begin
 if (select count(*) from pdl_booking.reservations) <> 0 or
    (select count(*) from pdl_booking.rates) <> 0 or
    (select count(*) from pdl_booking.audit_events) <> 0 then
   raise exception 'PDL04_ROLLBACK_LEAK';
 end if;
end $check$;
BEGIN;
\ir pdl_native05_rollback.sql
ROLLBACK;
\echo CHECK PDL05_ROLLBACK_PERSISTENCE
DO $check$
begin
 if (select count(*) from pdl_booking.reservations) <> 0 or
    (select count(*) from pdl_booking.quotes) <> 0 or
    (select count(*) from pdl_booking.rates) <> 0 or
    (select count(*) from pdl_booking.audit_events) <> 0 then
   raise exception 'PDL05_ROLLBACK_LEAK';
 end if;
end $check$;
\ir pdl_courts_admin_02_rollback.sql
\echo CHECK PDL02_ROLLBACK_PERSISTENCE
DO $check$
begin
 if (select count(*) from pdl_booking.reservations) <> 0 or
    (select count(*) from pdl_booking.rates) <> 0 or
    (select count(*) from pdl_booking.weekday_hours) <> 0 or
    (select count(*) from pdl_booking.maintenance_blocks) <> 0 or
    (select count(*) from pdl_booking.audit_events) <> 0 then
   raise exception 'PDL02_ROLLBACK_LEAK';
 end if;
end $check$;
\echo PDL07_DISPOSABLE_LIFECYCLE_ROLLBACK_PASS
