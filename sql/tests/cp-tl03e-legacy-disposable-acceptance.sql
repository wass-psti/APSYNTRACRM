-- CP-TL-03E hardened legacy entrypoints: synthetic valid, revoked,
-- expired, employee and foreign-workspace assertions. PostgreSQL 17 only.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"33333333-3333-4333-8333-333333333333"}',false);
DO $authorized$
DECLARE value text; new_rev bigint;
BEGIN
 SELECT image_data INTO value FROM public.tradelink_asset_read('synthetic-vendor','logo');
 IF value IS DISTINCT FROM 'data:image/png;base64,YQ==' THEN RAISE EXCEPTION 'Valid manager read broken'; END IF;
 SELECT public.tradelink_asset_write('synthetic-new','qr','data:image/png;base64,YQ==',0) INTO new_rev;
 IF new_rev<>1 THEN RAISE EXCEPTION 'Valid manager CAS write broken'; END IF;
END $authorized$;
RESET ROLE;

-- A previously accepted synthetic bearer stays valid as JWT claims but its session row is removed.
DELETE FROM auth.sessions WHERE id='33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
DO $revoked$
DECLARE q text; denied integer:=0;
BEGIN
 FOR q IN SELECT * FROM (VALUES
  ('SELECT * FROM public.tradelink_asset_read(''synthetic-vendor'',''logo'')'),
  ('SELECT public.tradelink_asset_write(''synthetic-new'',''qr'',''data:image/png;base64,YQ=='',1)'),
  ('SELECT * FROM public.tradelink_cleanup_fence_activate(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'',0)'),
  ('SELECT public.tradelink_cleanup_fence_release(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'')'),
  ('SELECT * FROM public.tradelink_reconciliation_assess(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'')'),
  ('SELECT * FROM public.tradelink_reconciliation_cleanup_audit_list(1)'),
  ('SELECT * FROM public.tradelink_reconciliation_cleanup_preflight(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'',0)'),
  ('SELECT * FROM public.tradelink_reconciliation_list(1)'),
  ('SELECT public.tradelink_reconciliation_report(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'',''item'',''commit-uncertain'')'),
  ('SELECT * FROM public.tradelink_reconciliation_request_cleanup(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'',0)'),
  ('SELECT * FROM public.tradelink_reconciliation_verify_revision(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/key'',0)')
 ) AS candidates(sql_text) LOOP
  BEGIN
   EXECUTE q;
   RAISE EXCEPTION 'Revoked JWT unexpectedly succeeded for %',q;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=denied+1;
  END;
 END LOOP;
 IF denied<>11 THEN RAISE EXCEPTION 'Only %/11 revoked denies observed',denied; END IF;
 RAISE NOTICE 'REVOCATION PASS: 11 of 11 legacy signed RPCs denied same previously allowed session';
END $revoked$;
RESET ROLE;
-- Separate expiry path: present session row past the deadline, with the original JWT claims unchanged.
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',now()-interval '1 minute');
SET ROLE authenticated;
DO $expired$
BEGIN
 BEGIN
  PERFORM 1 FROM public.tradelink_asset_read('synthetic-vendor','logo');
  RAISE EXCEPTION 'Expired synthetic session unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $expired$;
RESET ROLE;
-- Employee signed session: still cannot use manager/asset role, even with an active session.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"44444444-4444-4444-8444-444444444444"}',false);
DO $employee$
BEGIN
 BEGIN
  PERFORM 1 FROM public.tradelink_asset_read('synthetic-vendor','logo');
  RAISE EXCEPTION 'Employee gained asset read';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $employee$;
RESET ROLE;
-- Foreign signed manager-equivalent module access still only searches their workspace.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"55555555-5555-4555-8555-555555555555","session_id":"66666666-6666-4666-8666-666666666666"}',false);
DO $foreign$
DECLARE result text;
BEGIN
 SELECT image_data INTO result FROM public.tradelink_asset_read('synthetic-vendor','logo');
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Foreign workspace read exposed original workspace asset'; END IF;
END $foreign$;
RESET ROLE;
-- Preserve existing ACL, CAS and synthetic record counts.
DO $final$
DECLARE c integer; allowed integer;
BEGIN
 SELECT count(*) INTO c FROM public.tradelink_vendor_assets;
 IF c<>2 THEN RAISE EXCEPTION 'Unexpected asset mutations in expired/revoked probes'; END IF;
 SELECT count(*) INTO allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'tradelink_%' AND p.prosecdef
  AND has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND pg_get_functiondef(p.oid) LIKE '%private.wm_board_config_session_active()%';
 IF allowed<>11 THEN RAISE EXCEPTION 'Legacy ACL or guard invariant failed: %',allowed; END IF;
 RAISE NOTICE 'COMPLETE: valid manager, 11 revoked, expired, employee, foreign-workspace, ACL and two synthetic asset records';
END $final$;
