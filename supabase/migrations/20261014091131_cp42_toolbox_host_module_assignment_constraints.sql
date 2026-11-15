-- CP42: Apply unchanged, previously reviewed CP41-HF1 assignment CHECK migration.
-- Approved after the operator's logical database backup and isolated restore-smoke PASS.
-- No assignment INSERTs, account changes, grants, RLS changes, or module activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $cp41_hf1$
DECLARE
  v_table oid;
  v_module_expr text;
  v_role_expr text;
  v_module_hash text;
  v_role_hash text;
BEGIN
  SELECT to_regclass('public.module_role_assignments') INTO v_table;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: module assignment table is absent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = v_table AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: assignment RLS is not enabled';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = v_table AND contype = 'c') <> 2 THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: unexpected assignment CHECK constraints';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = v_table AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: unexpected assignment triggers';
  END IF;
  IF EXISTS (SELECT 1 FROM public.module_role_assignments
             WHERE module_id = 'toolbox-issues') THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: existing Toolbox assignment needs reconciliation';
  END IF;
  SELECT pg_get_expr(c.conbin,c.conrelid), md5(pg_get_expr(c.conbin,c.conrelid))
    INTO v_module_expr,v_module_hash
  FROM pg_constraint AS c
  WHERE c.conrelid=v_table AND c.contype='c'
    AND c.conname='module_role_assignments_module_id_check';
  SELECT pg_get_expr(c.conbin,c.conrelid), md5(pg_get_expr(c.conbin,c.conrelid))
    INTO v_role_expr,v_role_hash
  FROM pg_constraint AS c
  WHERE c.conrelid=v_table AND c.contype='c' AND c.conname='valid_module_role';
  IF v_module_expr IS NULL OR v_module_hash <> 'b99b8883df4f44fc41df2dcb9c30d2a4'
     OR v_role_expr IS NULL OR v_role_hash <> 'a638af462112c955201291ecabccd93e' THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: expected schema precondition mismatch';
  END IF;

  EXECUTE 'ALTER TABLE public.module_role_assignments DROP CONSTRAINT module_role_assignments_module_id_check';
  EXECUTE 'ALTER TABLE public.module_role_assignments DROP CONSTRAINT valid_module_role';
  EXECUTE format(
    'ALTER TABLE public.module_role_assignments ADD CONSTRAINT module_role_assignments_module_id_check CHECK ((%s) OR (module_id = %L))',
    v_module_expr,'toolbox-issues'
  );
  EXECUTE format(
    'ALTER TABLE public.module_role_assignments ADD CONSTRAINT valid_module_role CHECK ((%s) OR (module_id = %L AND role IN (%L,%L,%L,%L)))',
    v_role_expr,'toolbox-issues','admin','supervisor','employee','viewer'
  );
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid=v_table AND contype='c') <> 2 THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: unexpected post-migration constraint count';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid=v_table AND conname='valid_module_role'
      AND pg_get_expr(conbin,conrelid) LIKE '%toolbox-issues%'
      AND pg_get_expr(conbin,conrelid) LIKE '%supervisor%'
      AND pg_get_expr(conbin,conrelid) LIKE '%viewer%'
  ) THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: Toolbox role constraint absent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid=v_table AND relrowsecurity=true
  ) THEN
    RAISE EXCEPTION 'CP41-HF1 blocked: RLS was changed';
  END IF;
END;
$cp41_hf1$;
COMMIT;;
