-- Read-only production preflight. Run before authorized activation.
DO $ar_preflight$
BEGIN
 IF pg_catalog.to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('private.tl03_approval_evidence_complete(uuid,bigint)') IS NULL
 OR pg_catalog.to_regprocedure('public.current_workspace_id(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
 OR pg_catalog.to_regclass('public.tradelink_documents') IS NULL THEN
  RAISE EXCEPTION 'TradeLink dependency missing';
 END IF;
 IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
  'public.tl03_analytics_summary(uuid,timestamptz,timestamptz)'::regprocedure))
  IS DISTINCT FROM '4aec7596b90d74f55dca844afa010e13' THEN
  RAISE EXCEPTION 'TradeLink analytics baseline changed; reassess before activation';
 END IF;
 IF pg_catalog.to_regclass('private.tradelink_cheque_clearances') IS NOT NULL
 OR pg_catalog.to_regprocedure('public.tl03_cheque_clearance_status(uuid,uuid,bigint)') IS NOT NULL
 OR pg_catalog.to_regprocedure('public.tl03_record_cheque_clearance(uuid,uuid,bigint)') IS NOT NULL THEN
  RAISE EXCEPTION 'AR activation already present or partial; inspect before applying';
 END IF;
END $ar_preflight$;
