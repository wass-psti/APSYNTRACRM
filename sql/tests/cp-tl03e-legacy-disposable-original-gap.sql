-- Before hardening, demonstrate why a valid JWT with revoked session remains a risk.
-- Synthetic PostgreSQL only. NO production or actual bearer is used.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"33333333-3333-4333-8333-333333333333"}',false);
DO $pre$
DECLARE result text;
BEGIN
 SELECT image_data INTO result FROM public.tradelink_asset_read('synthetic-vendor','logo');
 IF result IS DISTINCT FROM 'data:image/png;base64,YQ==' THEN
  RAISE EXCEPTION 'Expected signed manager asset read before revocation';
 END IF;
END $pre$;
RESET ROLE;
DELETE FROM auth.sessions WHERE id='33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
-- The original unguarded function still permits the previously authorized actor.
DO $gap$
DECLARE result text;
BEGIN
 SELECT image_data INTO result FROM public.tradelink_asset_read('synthetic-vendor','logo');
 IF result IS DISTINCT FROM 'data:image/png;base64,YQ==' THEN
  RAISE EXCEPTION 'Original unguarded baseline unexpectedly denied old synthetic JWT';
 END IF;
 RAISE NOTICE 'BASELINE GAP REPRODUCED: original legacy asset read accepted synthetic stale-session claims';
END $gap$;
RESET ROLE;
-- Restore an active session before installing the guarded replacement.
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',now()+interval '1 day');
