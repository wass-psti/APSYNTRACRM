-- Read-only fingerprint of staging's verified 84 GoTrue migration versions,
-- assembled from the installed local 82 plus exactly two verified staging extras.
-- NO migration history is written, and this does NOT certify runtime compatibility.
DO $verify$
DECLARE v_count integer;
DECLARE v_digest text;
BEGIN
 SELECT count(*),md5(string_agg(version,',' ORDER BY version))
 INTO v_count,v_digest
 FROM (
  SELECT version FROM auth.schema_migrations
  UNION
  SELECT '20260911120000'::text
  UNION
  SELECT '20261030120000'::text
 ) migrations;
 IF v_count<>84 OR v_digest<>'89b5e505220d565bc38e8092af7b6c0f' THEN
  RAISE EXCEPTION 'Existing staging Auth migration-version source mismatch';
 END IF;
END $verify$;
