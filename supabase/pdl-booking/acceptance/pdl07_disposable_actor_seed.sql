-- Refuse test writes outside the disposable fixture initialized by this suite.
DO $guard$ BEGIN
  IF to_regclass('pdl07_acceptance_guard.disposable_fixture') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pdl07_acceptance_guard.disposable_fixture WHERE id=1) THEN
    RAISE EXCEPTION 'PDL07_REQUIRES_DISPOSABLE_FIXTURE';
  END IF;
END $guard$;
-- Disposal-only two administrator actors; never run against production.
insert into auth.users(id)
select gen_random_uuid()
from generate_series(1, greatest(0, 2 - (select count(*)::int from pdl_booking.admin_users)));
insert into pdl_booking.admin_users(user_id)
select id from auth.users where true
on conflict(user_id) do nothing;
