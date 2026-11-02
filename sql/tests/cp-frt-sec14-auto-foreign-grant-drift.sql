-- Disposable-only regression: missing authenticated own-scope read grants
-- must NEVER count as a successful foreign-workspace denial.
\set ON_ERROR_STOP on
BEGIN;
REVOKE EXECUTE ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 FROM authenticated;
SET ROLE authenticated;
DO $test$
DECLARE denied boolean := false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000000b',true);
 BEGIN
  PERFORM public.frt_sec14_auto_foreign_denials(
    '00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SEC14 own-workspace grant drift incorrectly PASSED'; END IF;
END
$test$;
RESET ROLE;
ROLLBACK;
