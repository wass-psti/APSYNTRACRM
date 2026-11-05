-- CP-WS-02D/B3 read-only production preflight.
-- No DDL/DML/grants, no user records, no token or provider secret access.
WITH baseline AS (
 SELECT
  to_regclass('private.ws02d_invitation_flags') IS NULL
   AND to_regclass('private.ws02d_invitations') IS NULL
   AND to_regclass('private.ws02d_delivery_receipts') IS NULL
   AND to_regclass('private.ws02d_delivery_events') IS NULL
   AND to_regclass('private.ws02d_member_access') IS NULL AS invite_schema_absent,
  to_regprocedure('private.ws02d_record_delivery_outcome(uuid,text,uuid)') IS NULL
   AND to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
   AND to_regprocedure('private.ws02d_accept(text)') IS NULL
   AND to_regprocedure('private.ws02d_revoke(uuid)') IS NULL
   AND to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
   AS invite_runtime_absent,
  md5(pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure))
   ='6a7c23c439e8c59d7883bc8f59d66d08' AS board_acl_original,
  md5(pg_get_functiondef('public.put_module_state(text,text,text,text,bigint)'::regprocedure))
   ='cb66214a6f7970f0c272d59ab2c2f741' AS put_module_original,
  md5(pg_get_functiondef('public.delete_module_state(text,text,text,bigint)'::regprocedure))
   ='74c5b010c94ad82abdddffb7236c4e03' AS delete_module_original,
  md5(pg_get_functiondef('public.acquire_module_operation_lock(text,text,integer)'::regprocedure))
   ='72cbaba52785b8ae3b29f9a3341d6ee9' AS acquire_lock_original,
  md5(pg_get_functiondef('public.release_module_operation_lock(text,text,text)'::regprocedure))
   ='41662f82357f35042ec681f8f1a70152' AS release_lock_original,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
   AND to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
   AND (SELECT creation_enabled IS FALSE AND selection_enabled IS FALSE
     FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
   AS b3_b4_disabled,
  (SELECT count(*) FROM public.workspaces) AS workspace_count,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships
)
SELECT CASE WHEN invite_schema_absent AND invite_runtime_absent
 AND board_acl_original AND put_module_original AND delete_module_original
 AND acquire_lock_original AND release_lock_original AND b3_b4_disabled
 THEN 'WS02D_B3_PRODUCTION_DEFAULT_DENY_AND_ORIGINAL_DOMAIN_FINGERPRINTS_VERIFIED'
 ELSE 'WS02D_B3_BLOCKED_LIVE_SCHEMA_OR_AUTHORIZATION_DRIFT' END AS status,
 baseline.*
FROM baseline;
