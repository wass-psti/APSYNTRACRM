-- CP-WS-02D/B: read-only production boundary and role integration inventory.
-- Never inserts invites, changes grants, reassigns roles, or alters production.
-- A PASS here confirms "still default denied", not invitation readiness.
WITH role_acl AS (
 SELECT to_regprocedure('public.work_board_access(uuid,text)') IS NOT NULL
  AND md5(pg_get_functiondef(to_regprocedure('public.work_board_access(uuid,text)')))
   ='6a7c23c439e8c59d7883bc8f59d66d08' AS unchanged_board_acl,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n
  ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
   AND pg_get_functiondef(p.oid) LIKE '%work_board_access%')
  AS definer_routines_using_board_acl
), boundary AS (
 SELECT
  to_regclass('private.ws02d_invitation_flags') IS NULL
   AND to_regclass('private.ws02d_invitations') IS NULL
   AND to_regclass('private.ws02d_member_access') IS NULL
   AND to_regclass('private.ws02d_invitation_events') IS NULL AS schema_absent,
  to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
   AND to_regprocedure('private.ws02d_accept(text)') IS NULL
   AND to_regprocedure('private.ws02d_revoke(uuid)') IS NULL
   AND to_regprocedure('private.ws02d_workspace_ceiling(uuid,uuid,text)') IS NULL
    AS runtime_absent,
  to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
   AND to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
   AND (SELECT creation_enabled IS FALSE AND selection_enabled IS FALSE
    FROM private.ws01_lifecycle_flags WHERE id IS TRUE) AS b3_b4_disabled,
  to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL
   AND to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL
   AS pgcrypto_ready,
  (SELECT count(*) FROM public.workspaces) AS workspaces,
  (SELECT count(*) FROM public.workspace_members WHERE active) AS active_memberships
)
SELECT
 CASE WHEN b.schema_absent AND b.runtime_absent
  AND b.b3_b4_disabled AND b.pgcrypto_ready AND r.unchanged_board_acl
 THEN 'WS02D_B_DEFAULT_DENY_VERIFIED__ROLE_INTEGRATION_AND_PRODUCTION_APPROVAL_PENDING'
 ELSE 'WS02D_B_BLOCKED_CONCURRENT_SCHEMA_OR_ROLE_POLICY_CHANGE'
 END AS status,
 b.*,r.unchanged_board_acl,r.definer_routines_using_board_acl
FROM boundary b CROSS JOIN role_acl r;
